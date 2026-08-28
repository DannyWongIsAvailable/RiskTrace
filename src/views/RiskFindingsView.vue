<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  completeRiskFinding,
  confirmRiskFindingAttachmentUpload,
  createRiskFindingAttachmentUploadSession,
  listRiskFindings,
  uploadRiskFindingAttachment,
} from '@/api/modules'
import { isApiError } from '@/api/request'
import RiskFindingCard from '@/components/risk-findings/RiskFindingCard.vue'
import RiskFindingDispositionDialog from '@/components/risk-findings/RiskFindingDispositionDialog.vue'
import { AppIcons } from '@/icons'
import type {
  RiskFinding,
  RiskFindingDispositionSubmission,
  RiskFindingListData,
  RiskFindingStatus,
} from '@/types/risk-finding'

const page = ref(1)
const pageSize = ref(20)
const status = ref<'all' | RiskFindingStatus>('all')
const data = ref<RiskFindingListData>()
const loading = ref(true)
const loadError = ref('')
const dialogOpen = ref(false)
const selectedFinding = ref<RiskFinding>()
const submitting = ref(false)
const uploadProgress = ref(0)
let loadController: AbortController | undefined
let mutationController: AbortController | undefined

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.pagination.total ?? 0)

async function loadFindings(showSuccessMessage = false): Promise<void> {
  loadController?.abort()
  loadController = new AbortController()
  loading.value = true
  loadError.value = ''

  try {
    data.value = await listRiskFindings(
      {
        page: page.value,
        pageSize: pageSize.value,
        status: status.value === 'all' ? undefined : status.value,
      },
      loadController.signal,
    )
    if (showSuccessMessage) ElMessage.success('风险事项已刷新')
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    loadError.value = error instanceof Error ? error.message : '风险事项加载失败'
  } finally {
    loading.value = false
  }
}

function handleStatusChange(value: string | number | boolean | undefined): void {
  if (value !== 'all' && value !== 'pending' && value !== 'completed') return
  status.value = value
  page.value = 1
  void loadFindings()
}

function handlePageChange(value: number): void {
  page.value = value
  void loadFindings()
}

function handlePageSizeChange(value: number): void {
  pageSize.value = value
  page.value = 1
  void loadFindings()
}

function openDisposition(finding: RiskFinding): void {
  selectedFinding.value = finding
  uploadProgress.value = 0
  dialogOpen.value = true
}

async function handleDispositionSubmit(
  submission: RiskFindingDispositionSubmission,
): Promise<void> {
  const finding = selectedFinding.value
  if (!finding || submitting.value) return

  mutationController?.abort()
  mutationController = new AbortController()
  submitting.value = true
  uploadProgress.value = 0

  try {
    if (submission.files.length > 0) {
      const session = await createRiskFindingAttachmentUploadSession(
        finding.findingId,
        submission.files.map((file) => ({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        })),
        mutationController.signal,
      )

      for (let index = 0; index < session.files.length; index += 1) {
        const target = session.files[index]
        const file = submission.files[index]
        if (!target || !file) continue

        await uploadRiskFindingAttachment(
          target,
          file,
          (progress) => {
            const base = (index / session.files.length) * 100
            uploadProgress.value = Math.round(base + progress / session.files.length)
          },
          mutationController.signal,
        )
        await confirmRiskFindingAttachmentUpload(
          finding.findingId,
          target.attachmentId,
          mutationController.signal,
        )
      }
    }

    await completeRiskFinding(finding.findingId, submission.input, mutationController.signal)
    dialogOpen.value = false
    selectedFinding.value = undefined
    ElMessage.success('风险事项已完成处置与整改')
    await loadFindings()
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    ElMessage.error(error instanceof Error ? error.message : '风险事项提交失败')
  } finally {
    submitting.value = false
    uploadProgress.value = 0
  }
}

onMounted(() => void loadFindings())
onBeforeUnmount(() => {
  loadController?.abort()
  mutationController?.abort()
})
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      title="风险事项"
      description="集中查看合规审查识别出的风险事项，并完成基础处置、整改和证明材料留存。"
    >
      <template #actions>
        <el-button :icon="AppIcons.action.refresh" :loading="loading" @click="loadFindings(true)">
          刷新
        </el-button>
      </template>
    </PageHeader>

    <FilterBar title="状态筛选" description="按风险事项当前处理状态查看">
      <el-radio-group :model-value="status" @update:model-value="handleStatusChange">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="pending">待处置与整改</el-radio-button>
        <el-radio-button value="completed">已完成</el-radio-button>
      </el-radio-group>
    </FilterBar>

    <LoadingState v-if="loading && !data" title="正在读取风险事项" :rows="6" />
    <ErrorState
      v-else-if="loadError && !data"
      title="风险事项加载失败"
      :description="loadError"
      retry-label="重新加载"
      @retry="loadFindings()"
    />

    <template v-else>
      <InlineNotice
        v-if="loadError"
        title="数据刷新失败"
        :description="loadError"
        tone="warning"
      />

      <div class="risk-findings-view__summary">
        <span>共 {{ total }} 项</span>
        <span v-if="status === 'pending'">当前仅显示待处置与整改事项</span>
        <span v-else-if="status === 'completed'">当前仅显示已完成事项</span>
        <span v-else>按风险等级优先展示</span>
      </div>

      <EmptyState
        v-if="items.length === 0"
        title="暂无风险事项"
        description="完成采购项目合规审查后，报告中的风险事项会自动进入这里。"
      />

      <div v-else class="risk-findings-view__list">
        <RiskFindingCard
          v-for="finding in items"
          :key="finding.findingId"
          :finding="finding"
          @handle="openDisposition"
        />
      </div>

      <PaginationBar
        v-if="data && total > 0"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :disabled="loading"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </template>

    <RiskFindingDispositionDialog
      v-model="dialogOpen"
      :finding="selectedFinding"
      :submitting="submitting"
      @submit="handleDispositionSubmit"
    />

    <div v-if="submitting && uploadProgress > 0" class="risk-findings-view__upload-progress">
      <span>证明材料上传 {{ uploadProgress }}%</span>
      <el-progress :percentage="uploadProgress" :show-text="false" />
    </div>
  </div>
</template>

<style scoped>
.risk-findings-view__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-4);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-sm);
}

.risk-findings-view__list {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-4);
}

.risk-findings-view__upload-progress {
  position: fixed;
  right: var(--rt-space-6);
  bottom: var(--rt-space-6);
  z-index: 20;
  width: min(360px, calc(100vw - var(--rt-space-8)));
  padding: var(--rt-space-4);
  border: 1px solid var(--rt-border-default);
  border-radius: var(--rt-radius-md);
  background: var(--rt-bg-panel);
  box-shadow: var(--rt-shadow-md);
  color: var(--rt-text-secondary);
  font-size: var(--rt-font-size-sm);
}

.risk-findings-view__upload-progress :deep(.el-progress) {
  margin-top: var(--rt-space-2);
}

@media (max-width: 680px) {
  .risk-findings-view__summary {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
