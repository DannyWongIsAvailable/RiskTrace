<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getProject,
  getProjectMaterialAnalysis,
  getProjectReviewEvents,
  getProjectReviewStatus,
} from '@/api/modules'
import { isApiError } from '@/api/request'
import MaterialAnalysisPanel from '@/components/projects/MaterialAnalysisPanel.vue'
import ProjectDetailTabs from '@/components/projects/ProjectDetailTabs.vue'
import HarnessActivityPanel from '@/components/review/HarnessActivityPanel.vue'
import { projectReviewActivity } from '@/components/review/review-activity-projector'
import type { ReviewConnectionState, ReviewHarnessEvent } from '@/types/review-activity'
import type { MaterialAnalysis, ProjectDetail, ReviewStatusResponse } from '@/types/project'

const EVENT_POLL_INTERVAL_MS = 1250
const STATUS_POLL_EVERY_TICKS = 2
const EVENT_PAGE_LIMIT = 200
const COMPLETED_EVENT_PAGE_LIMIT = 5000
const RAW_EVENT_PAGE_LIMIT = 500

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId ?? ''))
const project = ref<ProjectDetail>()
const materialAnalysis = ref<MaterialAnalysis>()
const reviewStatus = ref<ReviewStatusResponse>()
const reviewEvents = ref<ReviewHarnessEvent[]>([])
const rawReviewEvents = ref<ReviewHarnessEvent[]>([])
const rawLastEventSeq = ref(-1)
const rawEventsHasMore = ref(false)
const rawEventsLoading = ref(false)
const rawEventsError = ref('')
const harnessRunId = ref<string | null>(null)
const harnessSessionId = ref<string | null>(null)
const reviewConnectionState = ref<ReviewConnectionState>('disconnected')
const reviewConnectionMessage = ref('')
const lastEventSeq = ref(-1)
const loading = ref(true)
const pollingReview = ref(false)
const loadError = ref('')
const actionError = ref('')
const controller = new AbortController()

const reportReady = computed(() => project.value?.status === 'completed')
const reviewProjection = computed(() => projectReviewActivity(reviewEvents.value))
const runtimeStatus = computed<'reviewing' | 'completed' | 'failed'>(() => {
  if (reviewStatus.value) return reviewStatus.value.status
  if (project.value?.review) return project.value.review.status
  return 'reviewing'
})

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
    actionError.value = project.value.review?.error?.message ?? ''

    if (!project.value.review) return

    await loadMaterialAnalysisIfCompleted()
    await replayReviewEvents()
    if (project.value.review.status === 'reviewing') {
      void pollReviewUntilTerminal(false)
    }
  } catch (error) {
    if (isCancelled(error)) return
    loadError.value = error instanceof Error ? error.message : '执行过程加载失败'
  } finally {
    loading.value = false
  }
}

function resetReviewTrajectory(): void {
  reviewEvents.value = []
  rawReviewEvents.value = []
  rawLastEventSeq.value = -1
  rawEventsHasMore.value = false
  rawEventsLoading.value = false
  rawEventsError.value = ''
  harnessRunId.value = null
  harnessSessionId.value = null
  lastEventSeq.value = -1
  reviewConnectionMessage.value = ''
  reviewConnectionState.value = 'connecting'
}

async function replayReviewEvents(): Promise<void> {
  resetReviewTrajectory()
  if (project.value?.review?.status !== 'reviewing') {
    await fetchReviewEvents(true, COMPLETED_EVENT_PAGE_LIMIT)
    return
  }
  await fetchReviewEvents(true)
}

async function fetchReviewEvents(
  drainAll = false,
  pageLimit = EVENT_PAGE_LIMIT,
): Promise<void> {
  if (!project.value?.review) return
  if (reviewConnectionState.value === 'disconnected') reviewConnectionState.value = 'connecting'

  try {
    let hasMore = true
    let pages = 0
    while (hasMore && !controller.signal.aborted) {
      const page = await getProjectReviewEvents(
        projectId.value,
        lastEventSeq.value,
        controller.signal,
        pageLimit,
        'trajectory',
      )
      if (page.runId) harnessRunId.value = page.runId
      if (page.sessionId) harnessSessionId.value = page.sessionId
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

function mergeEventList(
  current: readonly ReviewHarnessEvent[],
  incoming: readonly ReviewHarnessEvent[],
): ReviewHarnessEvent[] {
  const merged = new Map<number, ReviewHarnessEvent>()
  current.forEach((event) => merged.set(event.seq, event))
  incoming.forEach((event) => merged.set(event.seq, event))
  return [...merged.values()].sort((left, right) => left.seq - right.seq)
}

function mergeEvents(incoming: ReviewHarnessEvent[]): void {
  reviewEvents.value = mergeEventList(reviewEvents.value, incoming)
}

async function loadMoreRawEvents(): Promise<void> {
  if (!project.value?.review || rawEventsLoading.value || controller.signal.aborted) return

  rawEventsLoading.value = true
  rawEventsError.value = ''
  try {
    const page = await getProjectReviewEvents(
      projectId.value,
      rawLastEventSeq.value,
      controller.signal,
      RAW_EVENT_PAGE_LIMIT,
      'raw',
    )
    if (page.runId) harnessRunId.value = page.runId
    if (page.sessionId) harnessSessionId.value = page.sessionId
    if (page.events.length > 0) {
      rawReviewEvents.value = mergeEventList(rawReviewEvents.value, page.events)
    }
    rawLastEventSeq.value = Math.max(rawLastEventSeq.value, page.nextSeq)
    rawEventsHasMore.value = page.hasMore
  } catch (error) {
    if (isCancelled(error)) return
    rawEventsError.value = error instanceof Error ? error.message : '原始事件暂时无法读取'
  } finally {
    rawEventsLoading.value = false
  }
}

async function pollReviewUntilTerminal(showCompletionMessage: boolean): Promise<void> {
  if (pollingReview.value || controller.signal.aborted || !project.value?.review) return

  pollingReview.value = true
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
            await fetchReviewEvents(true, COMPLETED_EVENT_PAGE_LIMIT)
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

function goToReport(): void {
  void router.push({ name: 'project-report', params: { projectId: projectId.value } })
}

function goToUpload(): void {
  void router.push({ name: 'project-upload', params: { projectId: projectId.value } })
}

onMounted(() => void loadPage())
onBeforeUnmount(() => controller.abort())
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      :title="project?.projectTitle ?? '合规审查执行过程'"
      description="查看 DeepSeek Harness Session 的真实工作轨迹；审查完成后仍可从项目列表重新进入追溯。"
      :breadcrumbs="[
        { label: '采购项目', to: { name: 'projects' } },
        { label: '执行过程' },
      ]"
    >
      <template #actions>
        <el-button @click="$router.push({ name: 'projects' })">返回项目列表</el-button>
      </template>
    </PageHeader>

    <ProjectDetailTabs :project-id="projectId" :report-ready="reportReady" />

    <LoadingState v-if="loading" title="正在读取合规审查执行过程" :rows="6" />
    <ErrorState
      v-else-if="loadError"
      title="执行过程加载失败"
      :description="loadError"
      @retry="loadPage"
    />

    <template v-else-if="project">
      <InlineNotice
        v-if="!project.review"
        title="尚未开始合规审查"
        description="该项目还没有可追溯的 Harness Session。请先上传材料并启动审查。"
        tone="neutral"
      >
        <template #actions>
          <el-button type="primary" @click="goToUpload">上传项目材料</el-button>
        </template>
      </InlineNotice>

      <template v-else>
        <InlineNotice
          v-if="actionError"
          title="运行提示"
          :description="actionError"
          :tone="runtimeStatus === 'failed' ? 'danger' : 'warning'"
        />

        <HarnessActivityPanel
          :status="runtimeStatus"
          :started-at="project.review.startedAt"
          :finished-at="project.review.finishedAt"
          :projection="reviewProjection"
          :events="reviewEvents"
          :raw-events="rawReviewEvents"
          :raw-events-has-more="rawEventsHasMore"
          :raw-events-loading="rawEventsLoading"
          :raw-events-error="rawEventsError"
          :connection-state="reviewConnectionState"
          :connection-message="reviewConnectionMessage"
          :report-ready="reportReady"
          :review-run-id="project.review.reviewRunId"
          :run-id="harnessRunId"
          :session-id="harnessSessionId"
          @view-report="goToReport"
          @load-raw-events="loadMoreRawEvents"
        />

        <MaterialAnalysisPanel v-if="materialAnalysis" :analysis="materialAnalysis" />

        <InlineNotice
          v-if="reportReady"
          title="合规审查报告已生成"
          description="本次 DeepSeek Harness Session 的执行过程会持续保留，可随时从项目列表返回查看。"
          tone="success"
        >
          <template #actions>
            <el-button type="primary" @click="goToReport">查看审查报告</el-button>
          </template>
        </InlineNotice>
      </template>
    </template>
  </div>
</template>
