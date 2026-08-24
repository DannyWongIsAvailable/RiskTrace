<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { UploadInstance, UploadUserFile } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  completeProjectUploads,
  confirmDocumentUpload,
  createUploadSession,
  getProject,
  getProjectMaterialAnalysis,
  getProjectReviewEvents,
  getProjectReviewStatus,
  uploadProjectMaterial,
} from '@/api/modules'
import { isApiError } from '@/api/request'
import MaterialAnalysisPanel from '@/components/projects/MaterialAnalysisPanel.vue'
import HarnessActivityPanel from '@/components/review/HarnessActivityPanel.vue'
import { projectReviewActivity } from '@/components/review/review-activity-projector'
import { AppIcons } from '@/icons'
import type {
  ReviewConnectionState,
  ReviewHarnessEvent,
} from '@/types/review-activity'
import type {
  MaterialAnalysis,
  ProjectDetail,
  ReviewStatusResponse,
} from '@/types/project'

const EVENT_POLL_INTERVAL_MS = 1250
const STATUS_POLL_EVERY_TICKS = 2
const EVENT_PAGE_LIMIT = 200

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId ?? ''))
const project = ref<ProjectDetail>()
const materialAnalysis = ref<MaterialAnalysis>()
const reviewStatus = ref<ReviewStatusResponse>()
const reviewEvents = ref<ReviewHarnessEvent[]>([])
const reviewConnectionState = ref<ReviewConnectionState>('disconnected')
const reviewConnectionMessage = ref('')
const lastEventSeq = ref(-1)
const fileList = ref<UploadUserFile[]>([])
const uploadRef = ref<UploadInstance>()
const loading = ref(true)
const uploading = ref(false)
const pollingReview = ref(false)
const uploadPhase = ref<'idle' | 'uploading' | 'reviewing'>('idle')
const loadError = ref('')
const actionError = ref('')
const controller = new AbortController()

const canUpload = computed(
  () =>
    !project.value?.review &&
    (project.value?.status === 'draft' || project.value?.status === 'uploading'),
)
const reportReady = computed(() => project.value?.status === 'completed')
const reviewProjection = computed(() => projectReviewActivity(reviewEvents.value))
const showHarnessActivity = computed(
  () => Boolean(project.value?.review) || uploadPhase.value === 'reviewing',
)
const runtimeStatus = computed<'reviewing' | 'completed' | 'failed'>(() => {
  if (reviewStatus.value) return reviewStatus.value.status
  if (project.value?.review) return project.value.review.status
  return 'reviewing'
})
const uploadActionText = computed(() =>
  uploadPhase.value === 'uploading' ? '正在上传材料' : '上传全部材料并开始审查',
)

async function loadMaterialAnalysisIfCompleted(): Promise<void> {
  if (project.value?.status !== 'completed') {
    materialAnalysis.value = undefined
    return
  }
  materialAnalysis.value = await getProjectMaterialAnalysis(projectId.value, controller.signal)
}

async function loadPage(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    project.value = await getProject(projectId.value, controller.signal)
    await loadMaterialAnalysisIfCompleted()

    if (project.value.review) {
      await replayReviewEvents()
      if (project.value.review.status === 'reviewing') {
        void pollReviewUntilTerminal(false)
      }
    }
  } catch (error) {
    if (isCancelled(error)) return
    loadError.value = error instanceof Error ? error.message : '项目材料加载失败'
  } finally {
    loading.value = false
  }
}

async function handleUpload(): Promise<void> {
  if (!canUpload.value || uploading.value) return

  const selectedFiles = fileList.value.filter(
    (item): item is UploadUserFile & { raw: File } => item.raw instanceof File,
  )
  if (selectedFiles.length === 0) {
    ElMessage.warning('请先选择至少一份材料')
    return
  }

  uploading.value = true
  uploadPhase.value = 'uploading'
  actionError.value = ''
  try {
    const session = await createUploadSession(
      projectId.value,
      selectedFiles.map((item) => ({
        fileName: item.name,
        mimeType: item.raw.type || 'application/octet-stream',
        sizeBytes: item.raw.size,
      })),
      controller.signal,
    )

    await Promise.all(
      session.files.map(async (target, index) => {
        const item = selectedFiles[index]
        if (!item) throw new Error('上传会话与本地文件数量不一致')
        item.status = 'uploading'
        item.percentage = 0
        try {
          await uploadProjectMaterial(
            target,
            item.raw,
            (progress) => { item.percentage = progress },
            controller.signal,
          )
          await confirmDocumentUpload(projectId.value, target.documentId, controller.signal)
          item.status = 'success'
          item.percentage = 100
        } catch (error) {
          item.status = 'fail'
          throw error
        }
      }),
    )

    uploadPhase.value = 'reviewing'
    resetReviewTrajectory()
    const submitted = await completeProjectUploads(projectId.value, controller.signal)
    project.value = await getProject(projectId.value, controller.signal)

    if (submitted.status === 'failed') {
      actionError.value =
        submitted.error?.message ?? project.value.review?.error?.message ?? '合规审查失败'
      await replayReviewEvents()
      return
    }

    if (submitted.status === 'completed') {
      await replayReviewEvents()
      await handleReviewCompleted()
      return
    }

    ElMessage.success('审查任务已提交，DeepSeek Harness 正在后台执行')
    await pollReviewUntilTerminal(true)
  } catch (error) {
    if (isCancelled(error)) return
    actionError.value = error instanceof Error ? error.message : '材料上传或合规审查启动失败'
    try {
      project.value = await getProject(projectId.value, controller.signal)
      await loadMaterialAnalysisIfCompleted()
      if (project.value.review) await replayReviewEvents()
    } catch {
      // Preserve the original action error.
    }
  } finally {
    uploading.value = false
    if (!pollingReview.value) uploadPhase.value = 'idle'
  }
}

function resetReviewTrajectory(): void {
  reviewEvents.value = []
  lastEventSeq.value = -1
  reviewConnectionMessage.value = ''
  reviewConnectionState.value = 'connecting'
}

async function replayReviewEvents(): Promise<void> {
  resetReviewTrajectory()
  await fetchReviewEvents(true)
}

async function fetchReviewEvents(drainAll = false): Promise<void> {
  if (!project.value?.review && uploadPhase.value !== 'reviewing') return
  if (reviewConnectionState.value === 'disconnected') reviewConnectionState.value = 'connecting'

  try {
    let hasMore = true
    let pages = 0
    while (hasMore && !controller.signal.aborted) {
      const page = await getProjectReviewEvents(
        projectId.value,
        lastEventSeq.value,
        controller.signal,
        EVENT_PAGE_LIMIT,
      )
      if (page.events.length > 0) mergeEvents(page.events)
      lastEventSeq.value = Math.max(lastEventSeq.value, page.nextSeq)
      hasMore = page.hasMore
      pages += 1
      if (!drainAll || pages >= 100) break
    }
    reviewConnectionState.value = 'connected'
    reviewConnectionMessage.value = ''
  } catch (error) {
    if (isCancelled(error)) return
    reviewConnectionState.value = 'reconnecting'
    reviewConnectionMessage.value =
      error instanceof Error ? error.message : '工作轨迹暂时无法读取'
  }
}

function mergeEvents(incoming: ReviewHarnessEvent[]): void {
  const merged = new Map<number, ReviewHarnessEvent>()
  reviewEvents.value.forEach((event) => merged.set(event.seq, event))
  incoming.forEach((event) => merged.set(event.seq, event))
  reviewEvents.value = [...merged.values()].sort((left, right) => left.seq - right.seq)
}

async function pollReviewUntilTerminal(showCompletionMessage: boolean): Promise<void> {
  if (pollingReview.value || controller.signal.aborted) return

  pollingReview.value = true
  uploadPhase.value = 'reviewing'
  reviewConnectionState.value = reviewEvents.value.length ? 'connected' : 'connecting'
  let tick = 0

  try {
    while (!controller.signal.aborted) {
      await fetchReviewEvents(false)

      if (tick % STATUS_POLL_EVERY_TICKS === 0) {
        try {
          const review = await getProjectReviewStatus(projectId.value, controller.signal)
          reviewStatus.value = review
          applyReviewStatus(review)
          actionError.value = ''

          if (review.status === 'completed') {
            await fetchReviewEvents(true)
            project.value = await getProject(projectId.value, controller.signal)
            await handleReviewCompleted(showCompletionMessage)
            return
          }

          if (review.status === 'failed') {
            await fetchReviewEvents(true)
            actionError.value = review.error?.message ?? '合规审查失败'
            project.value = await getProject(projectId.value, controller.signal)
            return
          }
        } catch (error) {
          if (isCancelled(error)) return
          if (isApiError(error) && error.status >= 400 && error.status < 500) throw error
          actionError.value = '审查状态查询暂时失败，后台 Harness 不会因此停止。'
        }
      }

      tick += 1
      await delay(EVENT_POLL_INTERVAL_MS, controller.signal)
    }
  } catch (error) {
    if (isCancelled(error)) return
    actionError.value = error instanceof Error ? error.message : '审查状态查询失败'
  } finally {
    pollingReview.value = false
    uploadPhase.value = 'idle'
    settleTrajectoryConnection()
  }
}

function settleTrajectoryConnection(): void {
  if (runtimeStatus.value !== 'reviewing' && reviewConnectionState.value !== 'connected') {
    reviewConnectionState.value = 'disconnected'
  }
}

function applyReviewStatus(review: ReviewStatusResponse): void {
  if (!project.value) return
  project.value.status = review.status
  project.value.stage = review.stage
  if (project.value.review) {
    project.value.review.status = review.status
    project.value.review.stage = review.stage
    project.value.review.progress = review.progress
    project.value.review.error = review.error
      ? { code: review.error.code, message: review.error.message }
      : null
  }
}

async function handleReviewCompleted(showMessage = true): Promise<void> {
  await loadMaterialAnalysisIfCompleted()
  uploadRef.value?.clearFiles()
  fileList.value = []
  if (showMessage) ElMessage.success('完整合规审查已完成')
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, ms)
    const handleAbort = () => {
      window.clearTimeout(timeoutId)
      resolve()
    }
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

function isCancelled(error: unknown): boolean {
  return isApiError(error) && error.code === 'REQUEST_CANCELLED'
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function goToReport(): void {
  void router.push({ name: 'project-report', params: { projectId: projectId.value } })
}

onMounted(() => void loadPage())
onBeforeUnmount(() => controller.abort())
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      :title="project?.projectTitle ?? '上传项目材料'"
      description="上传材料后由 DeepSeek Harness 执行完整合规审查，并保留可追溯的 Session 工作轨迹。"
      :breadcrumbs="[
        { label: '采购项目', to: { name: 'projects' } },
        { label: '上传项目材料' },
      ]"
    >
      <template #actions>
        <el-button @click="$router.push({ name: 'projects' })">返回项目列表</el-button>
        <el-button v-if="reportReady" type="primary" @click="goToReport">查看审查报告</el-button>
      </template>
    </PageHeader>

    <LoadingState v-if="loading" title="正在读取采购项目" :rows="5" />
    <ErrorState
      v-else-if="loadError"
      title="项目加载失败"
      :description="loadError"
      @retry="loadPage"
    />

    <template v-else-if="project">
      <InlineNotice
        v-if="canUpload"
        title="DeepSeek Harness 自动审查"
        description="材料上传完成后只创建一次 Harness Run；页面读取同一 Session 的状态与事件，不会因刷新或轮询重复发起审查。"
        tone="primary"
      />

      <InlineNotice
        v-if="actionError"
        title="运行提示"
        :description="actionError"
        :tone="runtimeStatus === 'failed' ? 'danger' : 'warning'"
      />

      <InlineNotice
        v-if="uploading"
        title="正在上传材料"
        description="这里显示的文件上传百分比来自真实网络字节进度；Harness 审查开始后不再显示伪完成百分比。"
        tone="primary"
      />

      <BaseCard
        v-if="canUpload"
        title="选择并上传材料"
        description="支持 PDF、图片、Office、CSV、TXT、MD 和 JSON；压缩包请先解压。"
      >
        <el-upload
          ref="uploadRef"
          v-model:file-list="fileList"
          drag
          multiple
          :auto-upload="false"
          :disabled="uploading"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.csv,.doc,.docx,.ppt,.pptx,.txt,.md,.json"
        >
          <el-icon class="project-upload__upload-icon"><component :is="AppIcons.action.upload" /></el-icon>
          <div class="el-upload__text">拖拽材料到此处，或<em>点击选择文件</em></div>
          <template #tip>
            <div class="el-upload__tip">单文件不超过 50 MB，项目总大小不超过 200 MB。</div>
          </template>
        </el-upload>

        <div class="project-upload__actions">
          <el-button
            class="project-upload__action-button"
            type="primary"
            :icon="AppIcons.action.upload"
            :loading="uploading"
            :disabled="fileList.length === 0"
            @click="handleUpload"
          >
            {{ uploadActionText }}
          </el-button>
        </div>
      </BaseCard>

      <HarnessActivityPanel
        v-if="showHarnessActivity"
        :status="runtimeStatus"
        :started-at="project.review?.startedAt"
        :finished-at="project.review?.finishedAt"
        :projection="reviewProjection"
        :events="reviewEvents"
        :connection-state="reviewConnectionState"
        :connection-message="reviewConnectionMessage"
        :report-ready="reportReady"
        @view-report="goToReport"
      />

      <BaseCard
        v-if="project.documents.length"
        title="已登记材料"
        :description="`共 ${project.documents.length} 份`"
      >
        <div class="project-upload__documents">
          <div
            v-for="document in project.documents"
            :key="document.documentId"
            class="project-upload__document"
          >
            <div>
              <strong>{{ document.fileName }}</strong>
              <span>{{ formatFileSize(document.sizeBytes) }}</span>
            </div>
            <StatusTag
              :label="document.uploadStatus === 'uploaded' ? '已上传' : document.uploadStatus === 'failed' ? '上传失败' : '待确认'"
              :tone="document.uploadStatus === 'uploaded' ? 'success' : document.uploadStatus === 'failed' ? 'danger' : 'warning'"
            />
          </div>
        </div>
      </BaseCard>

      <MaterialAnalysisPanel v-if="materialAnalysis" :analysis="materialAnalysis" />

      <InlineNotice
        v-if="reportReady"
        title="合规审查报告已生成"
        description="报告已可查看；本次 DeepSeek Harness Session 的工作轨迹仍会保留用于追溯。"
        tone="success"
      >
        <template #actions>
          <el-button type="primary" @click="goToReport">查看审查报告</el-button>
        </template>
      </InlineNotice>
    </template>
  </div>
</template>

<style scoped>
.project-upload__upload-icon {
  color: var(--rt-color-primary-600);
  font-size: var(--rt-icon-size-state);
}

.project-upload__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--rt-space-5);
}

.project-upload__documents {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-3);
}

.project-upload__document {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-4);
  padding: var(--rt-space-4);
  border: 1px solid var(--rt-border-subtle);
  border-radius: var(--rt-radius-md);
}

.project-upload__document strong,
.project-upload__document span { display: block; }
.project-upload__document strong { color: var(--rt-text-primary); }
.project-upload__document span {
  margin-top: var(--rt-space-1);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

@media (max-width: 720px) {
  .project-upload__action-button { width: 100%; }
}
</style>
