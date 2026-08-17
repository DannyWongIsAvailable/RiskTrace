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
  getProjectReviewStatus,
  uploadProjectMaterial,
} from '@/api/modules'
import { isApiError } from '@/api/request'
import MaterialAnalysisPanel from '@/components/projects/MaterialAnalysisPanel.vue'
import { AppIcons } from '@/icons'
import type {
  MaterialAnalysis,
  ProjectDetail,
  ProjectStage,
  ReviewStatusResult,
} from '@/types/project'
import type { StatusTone } from '@/types/ui'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId ?? ''))
const project = ref<ProjectDetail>()
const reviewStatus = ref<ReviewStatusResult>()
const materialAnalysis = ref<MaterialAnalysis>()
const fileList = ref<UploadUserFile[]>([])
const uploadRef = ref<UploadInstance>()
const loading = ref(true)
const uploading = ref(false)
const uploadPhase = ref<'idle' | 'uploading' | 'reviewing'>('idle')
const loadError = ref('')
const actionError = ref('')
const controller = new AbortController()
let pollTimer: ReturnType<typeof globalThis.setTimeout> | undefined

const canUpload = computed(
  () =>
    !project.value?.review &&
    (project.value?.status === 'draft' || project.value?.status === 'uploading'),
)
const currentStage = computed<ProjectStage>(
  () => reviewStatus.value?.stage ?? project.value?.stage ?? 'waiting_for_upload',
)
const activeStep = computed(() => {
  switch (currentStage.value) {
    case 'waiting_for_upload':
    case 'uploading_files':
      return 0
    case 'material_analysis_running':
      return 1
    case 'material_analysis_completed':
    case 'domain_review_running':
    case 'failed':
      return 2
    case 'report_aggregating':
      return 3
    case 'report_completed':
      return 4
  }
})
const reviewProgress = computed(
  () => reviewStatus.value?.progress ?? project.value?.review?.progress ?? 0,
)
const reviewMessage = computed(
  () => reviewStatus.value?.message ?? stageLabel(currentStage.value),
)
const reviewTone = computed<StatusTone>(() => {
  if (reviewStatus.value?.status === 'failed' || currentStage.value === 'failed') return 'danger'
  if (reviewStatus.value?.status === 'completed' || currentStage.value === 'report_completed') {
    return 'success'
  }
  return 'warning'
})
const reportReady = computed(
  () => reviewStatus.value?.reportAvailable || project.value?.status === 'completed',
)
const uploadActionText = computed(() => {
  if (uploadPhase.value === 'uploading') return '正在上传材料'
  if (uploadPhase.value === 'reviewing') return '正在执行合规审查，请勿关闭页面'
  return '上传全部材料并开始审查'
})
const uploadNotice = computed(() => {
  if (uploadPhase.value === 'reviewing') {
    return {
      title: '正在执行同步合规审查',
      description:
        '材料已上传完成，服务器正在等待 Workflow 返回材料分类与最终报告。该请求可能持续数分钟，请勿关闭或刷新当前页面。',
    }
  }

  return {
    title: '正在上传材料',
    description: '正在上传并确认项目材料，完成后将立即开始同步合规审查。',
  }
})

async function loadPage(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    project.value = await getProject(projectId.value, controller.signal)
    if (project.value.review) {
      await refreshReview()
      if (reviewStatus.value?.status === 'reviewing') schedulePoll()
    }
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
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
            (progress) => {
              item.percentage = progress
            },
            controller.signal,
          )
          await confirmDocumentUpload(
            projectId.value,
            target.documentId,
            controller.signal,
          )
          item.status = 'success'
          item.percentage = 100
        } catch (error) {
          item.status = 'fail'
          throw error
        }
      }),
    )

    uploadPhase.value = 'reviewing'

    // /uploads/complete 会先在后端落审查阶段，再执行 Provider。
    // POST 请求进行期间持续读取后端状态，步骤条只以后端 stage 为准。
    const completeReviewRequest = completeProjectUploads(projectId.value, controller.signal)
    schedulePoll(true)
    const review = await completeReviewRequest

    ElMessage.success(
      review.status === 'completed'
        ? '完整合规审查已完成'
        : '合规审查已启动，正在等待结果',
    )
    uploadRef.value?.clearFiles()
    fileList.value = []
    project.value = await getProject(projectId.value, controller.signal)
    await refreshReview()

    // 星辰同步 Provider 正常会在 /uploads/complete 返回前完成审查。
    // 保留 reviewing 轮询仅用于刷新旧任务或其他异步 Provider 的兼容场景。
    if (reviewStatus.value?.status === 'reviewing') {
      schedulePoll()
    }
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    clearPoll()
    actionError.value = error instanceof Error ? error.message : '材料上传或同步合规审查失败'
  } finally {
    uploading.value = false
    uploadPhase.value = 'idle'
  }
}

async function refreshReview(): Promise<void> {
  const status = await getProjectReviewStatus(projectId.value, controller.signal)
  reviewStatus.value = status

  if (
    status.status === 'completed' &&
    status.materialAnalysisAvailable &&
    !materialAnalysis.value
  ) {
    materialAnalysis.value = await getProjectMaterialAnalysis(
      projectId.value,
      controller.signal,
    )
  }

  if (status.status === 'completed' || status.status === 'failed') {
    clearPoll()
    project.value = await getProject(projectId.value, controller.signal)
  }
}

function schedulePoll(waitForReviewStart = false): void {
  clearPoll()
  if (!waitForReviewStart && reviewStatus.value?.status !== 'reviewing') return

  const delayMs = waitForReviewStart ? 500 : 2_000
  pollTimer = globalThis.setTimeout(async () => {
    try {
      await refreshReview()
      if (reviewStatus.value?.status === 'reviewing') schedulePoll()
    } catch (error) {
      if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
      if (waitForReviewStart && isApiError(error) && error.code === 'REVIEW_RUN_NOT_FOUND') {
        schedulePoll(true)
        return
      }
      actionError.value = error instanceof Error ? error.message : '审查状态刷新失败'
      if (waitForReviewStart || reviewStatus.value?.status === 'reviewing') {
        schedulePoll(waitForReviewStart)
      }
    }
  }, delayMs)
}

function clearPoll(): void {
  if (pollTimer !== undefined) {
    globalThis.clearTimeout(pollTimer)
    pollTimer = undefined
  }
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function stageLabel(stage: ProjectStage): string {
  const labels: Record<ProjectStage, string> = {
    waiting_for_upload: '等待上传材料',
    uploading_files: '材料上传中',
    material_analysis_running: '正在理解项目材料',
    material_analysis_completed: '材料理解已完成，准备开始自动合规审查',
    domain_review_running: '材料理解已完成，正在执行自动合规审查',
    report_aggregating: '自动合规审查已完成，正在生成结果',
    report_completed: '合规审查报告已生成',
    failed: '合规审查失败',
  }
  return labels[stage]
}

onMounted(() => void loadPage())
onBeforeUnmount(() => {
  clearPoll()
  controller.abort()
})
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      :title="project?.projectTitle ?? '上传项目材料'"
      description="一次性上传当前已有材料；上传完成后系统将自动执行材料理解、领域审查和报告生成。"
      :breadcrumbs="[
        { label: '采购项目', to: { name: 'projects' } },
        { label: '上传项目材料' },
      ]"
    >
      <template #actions>
        <el-button @click="$router.push({ name: 'projects' })">返回项目列表</el-button>
        <el-button v-if="reportReady" type="primary" @click="router.push({ name: 'project-report', params: { projectId } })">
          查看审查报告
        </el-button>
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
        title="自动审查流程"
        description="材料上传完成后，系统会启动一条完整工作流；工作流结束后一次性生成材料分类与最终报告。"
        tone="primary"
      />

      <BaseCard title="自动审查进度" :description="reviewMessage">
        <el-steps :active="activeStep" finish-status="success" align-center>
          <el-step title="上传材料" />
          <el-step title="材料理解" />
          <el-step title="自动合规审查" />
          <el-step title="生成结果" />
        </el-steps>
        <div v-if="project.review" class="project-upload__progress">
          <StatusTag :label="stageLabel(currentStage)" :tone="reviewTone" />
          <el-progress :percentage="reviewProgress" :status="reviewProgress === 100 ? 'success' : undefined" />
        </div>
      </BaseCard>

      <InlineNotice
        v-if="actionError"
        title="操作未完成"
        :description="actionError"
        tone="danger"
      />

      <InlineNotice
        v-if="uploading"
        :title="uploadNotice.title"
        :description="uploadNotice.description"
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
        description="工作流已一次性返回材料分类与最终报告；可进入只读报告统一查看材料理解结果、风险事项和关联文件。"
        tone="success"
      >
        <template #actions>
          <el-button type="primary" @click="router.push({ name: 'project-report', params: { projectId } })">
            查看审查报告
          </el-button>
        </template>
      </InlineNotice>
    </template>
  </div>
</template>

<style scoped>
.project-upload__progress {
  display: grid;
  grid-template-columns: auto minmax(220px, 1fr);
  align-items: center;
  gap: var(--rt-space-4);
  margin-top: var(--rt-space-6);
}

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
.project-upload__document span {
  display: block;
}

.project-upload__document strong {
  color: var(--rt-text-primary);
}

.project-upload__document span {
  margin-top: var(--rt-space-1);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

@media (max-width: 720px) {
  .project-upload__progress {
    grid-template-columns: 1fr;
  }

  .project-upload__action-button {
    width: 100%;
  }
}
</style>
