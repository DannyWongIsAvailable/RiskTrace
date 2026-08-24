<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getDashboardSummary } from '@/api/modules'
import { isApiError } from '@/api/request'
import { AppIcons } from '@/icons'
import type { DashboardRecentProject, DashboardSummary } from '@/types/dashboard'
import type { ProjectStage, ProjectStatus, RiskLevel } from '@/types/project'
import type { StatusTone } from '@/types/ui'

const router = useRouter()
const summary = ref<DashboardSummary>()
const loading = ref(true)
const loadError = ref('')
let loadController: AbortController | undefined

const statusMeta: Record<ProjectStatus, { label: string; tone: StatusTone }> = {
  draft: { label: '待上传', tone: 'neutral' },
  uploading: { label: '上传中', tone: 'primary' },
  reviewing: { label: '审查中', tone: 'warning' },
  completed: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
}

const stageLabels: Record<ProjectStage, string> = {
  waiting_for_upload: '等待上传材料',
  uploading_files: '材料上传中',
  material_analysis_running: '完整合规审查中',
  material_analysis_completed: '完整合规审查中',
  domain_review_running: '完整合规审查中',
  report_aggregating: '完整合规审查中',
  report_completed: '报告已生成',
  failed: '审查失败',
}

const riskMeta: Record<RiskLevel, { label: string; tone: StatusTone }> = {
  low: { label: '低风险', tone: 'success' },
  medium: { label: '中风险', tone: 'warning' },
  high: { label: '高风险', tone: 'danger' },
  critical: { label: '重大风险', tone: 'danger' },
}

const projectStatusItems = computed(() => {
  if (!summary.value) return []

  return [
    {
      key: 'completed' as const,
      ...statusMeta.completed,
      count: summary.value.projectStatus.completed,
    },
    {
      key: 'reviewing' as const,
      ...statusMeta.reviewing,
      count: summary.value.projectStatus.reviewing,
    },
    {
      key: 'uploading' as const,
      ...statusMeta.uploading,
      count: summary.value.projectStatus.uploading,
    },
    { key: 'draft' as const, ...statusMeta.draft, count: summary.value.projectStatus.draft },
    { key: 'failed' as const, ...statusMeta.failed, count: summary.value.projectStatus.failed },
  ]
})

const findingRiskItems = computed(() => {
  if (!summary.value) return []

  return [
    {
      key: 'critical' as const,
      ...riskMeta.critical,
      count: summary.value.findingRiskDistribution.critical,
    },
    { key: 'high' as const, ...riskMeta.high, count: summary.value.findingRiskDistribution.high },
    {
      key: 'medium' as const,
      ...riskMeta.medium,
      count: summary.value.findingRiskDistribution.medium,
    },
    { key: 'low' as const, ...riskMeta.low, count: summary.value.findingRiskDistribution.low },
  ]
})

const metricCards = computed(() => {
  if (!summary.value) return []

  const metrics = summary.value.metrics
  return [
    {
      key: 'projects',
      label: '采购项目',
      value: metrics.totalProjects,
      description: `已确认上传 ${metrics.totalDocuments} 份材料`,
      trend: `${summary.value.projectStatus.reviewing} 个审查中`,
      tone: 'primary' as StatusTone,
    },
    {
      key: 'reviewing',
      label: '正在审查',
      value: summary.value.projectStatus.reviewing,
      description: '完整合规审查工作流正在执行的项目',
      trend: `${summary.value.projectStatus.failed} 个失败`,
      tone:
        summary.value.projectStatus.failed > 0
          ? ('warning' as StatusTone)
          : ('neutral' as StatusTone),
    },
    {
      key: 'reports',
      label: '已生成报告',
      value: metrics.completedReports,
      description: '已完成并保存最终合规审查报告',
      trend: `${
        summary.value.reportRiskDistribution.high + summary.value.reportRiskDistribution.critical
      } 个高风险项目`,
      tone: 'success' as StatusTone,
    },
    {
      key: 'findings',
      label: '风险事项',
      value: metrics.totalFindings,
      description: `高风险及重大风险 ${metrics.highRiskFindings} 项`,
      trend: `重大风险 ${metrics.criticalRiskFindings} 项`,
      tone: metrics.highRiskFindings > 0 ? ('danger' as StatusTone) : ('neutral' as StatusTone),
    },
  ]
})

async function loadDashboard(showSuccessMessage = false): Promise<void> {
  loadController?.abort()
  loadController = new AbortController()
  loading.value = true
  loadError.value = ''

  try {
    summary.value = await getDashboardSummary(loadController.signal)
    if (showSuccessMessage) ElMessage.success('审查总览已刷新')
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    loadError.value = error instanceof Error ? error.message : '审查总览加载失败'
  } finally {
    loading.value = false
  }
}

function asRecentProject(row: unknown): DashboardRecentProject {
  return row as DashboardRecentProject
}

function recentProjectStageLabel(row: unknown): string {
  return stageLabels[asRecentProject(row).stage]
}

function recentProjectStatusMeta(row: unknown): { label: string; tone: StatusTone } {
  return statusMeta[asRecentProject(row).status]
}

function recentProjectRiskMeta(row: unknown): { label: string; tone: StatusTone } | null {
  const riskLevel = asRecentProject(row).overallRiskLevel
  return riskLevel ? riskMeta[riskLevel] : null
}

function recentProjectRiskLabel(row: unknown): string {
  return recentProjectRiskMeta(row)?.label ?? '未知风险'
}

function recentProjectRiskTone(row: unknown): StatusTone {
  return recentProjectRiskMeta(row)?.tone ?? 'neutral'
}

function openProject(project: DashboardRecentProject): void {
  const routeName = project.status === 'completed' ? 'project-report' : 'project-upload'
  void router.push({ name: routeName, params: { projectId: project.projectId } })
}

function projectActionLabel(project: DashboardRecentProject): string {
  if (project.status === 'completed') return '查看报告'
  if (project.status === 'reviewing') return '查看进度'
  if (project.status === 'failed') return '查看详情'
  return '继续上传'
}

function percentage(value: number, total: number): number {
  if (total <= 0 || value <= 0) return 0
  return Math.max(3, Math.round((value / total) * 100))
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

onMounted(() => void loadDashboard())
onBeforeUnmount(() => loadController?.abort())
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      eyebrow="RiskTrace"
      title="审查总览"
      description="集中查看采购项目、自动合规审查进度与已生成报告中的风险统计。"
    >
      <template #actions>
        <el-button
          :icon="AppIcons.action.refresh"
          :loading="loading"
          @click="loadDashboard(true)"
        >
          刷新
        </el-button>
        <el-button type="primary" @click="$router.push({ name: 'project-create' })">
          新建采购项目
        </el-button>
      </template>
    </PageHeader>

    <BaseCard v-if="loading && !summary" padding="lg">
      <LoadingState title="正在汇总审查数据" :rows="6" />
    </BaseCard>

    <ErrorState
      v-else-if="loadError && !summary"
      title="审查总览加载失败"
      :description="loadError"
      retry-label="重新加载"
      @retry="loadDashboard()"
    />

    <template v-else-if="summary">
      <InlineNotice
        v-if="loadError"
        title="数据刷新失败"
        :description="loadError"
        tone="warning"
      />

      <div class="rt-grid rt-grid--metrics">
        <MetricCard
          v-for="metric in metricCards"
          :key="metric.key"
          :label="metric.label"
          :value="metric.value"
          :description="metric.description"
          :trend="metric.trend"
          :tone="metric.tone"
        />
      </div>

      <div class="dashboard__summary-grid">
        <BaseCard
          title="项目状态"
          description="当前采购项目在自动审查主链路中的分布"
        >
          <div class="dashboard__distribution-list">
            <div
              v-for="item in projectStatusItems"
              :key="item.key"
              class="dashboard__distribution-item"
            >
              <div class="dashboard__distribution-heading">
                <StatusTag :label="item.label" :tone="item.tone" :dot="false" />
                <strong>{{ item.count }}</strong>
              </div>
              <div class="dashboard__bar" aria-hidden="true">
                <span
                  class="dashboard__bar-fill"
                  :class="`dashboard__bar-fill--${item.tone}`"
                  :style="{ width: `${percentage(item.count, summary.metrics.totalProjects)}%` }"
                />
              </div>
            </div>
          </div>
        </BaseCard>

        <BaseCard
          title="风险事项等级分布"
          description="基于已完成报告中的风险事项统计"
        >
          <div v-if="summary.metrics.totalFindings" class="dashboard__distribution-list">
            <div
              v-for="item in findingRiskItems"
              :key="item.key"
              class="dashboard__distribution-item"
            >
              <div class="dashboard__distribution-heading">
                <StatusTag :label="item.label" :tone="item.tone" :dot="false" />
                <strong>{{ item.count }}</strong>
              </div>
              <div class="dashboard__bar" aria-hidden="true">
                <span
                  class="dashboard__bar-fill"
                  :class="`dashboard__bar-fill--${item.tone}`"
                  :style="{ width: `${percentage(item.count, summary.metrics.totalFindings)}%` }"
                />
              </div>
            </div>
          </div>
          <EmptyState
            v-else
            compact
            title="暂无风险事项"
            description="完成至少一个采购项目的合规审查后，这里会展示风险等级分布。"
          />
        </BaseCard>
      </div>

      <BaseTableCard
        title="最近采购项目"
        description="按最近更新时间展示，可直接进入上传、审查进度或最终报告"
        :empty="summary.recentProjects.length === 0"
        empty-title="暂无采购项目"
        empty-description="创建第一个采购项目并上传材料后，Dashboard 会自动汇总其审查状态。"
      >
        <template #actions>
          <span class="dashboard__updated-at">
            统计更新时间：{{ formatGeneratedAt(summary.generatedAt) }}
          </span>
        </template>

        <template #emptyAction>
          <el-button type="primary" @click="$router.push({ name: 'project-create' })">
            新建采购项目
          </el-button>
        </template>

        <el-table :data="summary.recentProjects" row-key="projectId">
          <el-table-column label="项目名称" min-width="260">
            <template #default="{ row }">
              <button
                class="dashboard__project-title"
                type="button"
                @click="openProject(asRecentProject(row))"
              >
                {{ row.projectTitle }}
              </button>
              <div class="dashboard__project-stage">{{ recentProjectStageLabel(row) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <StatusTag
                :label="recentProjectStatusMeta(row).label"
                :tone="recentProjectStatusMeta(row).tone"
              />
            </template>
          </el-table-column>
          <el-table-column label="材料" width="90" align="right">
            <template #default="{ row }">{{ row.documentCount }} 份</template>
          </el-table-column>
          <el-table-column label="总体风险" width="120">
            <template #default="{ row }">
              <StatusTag
                v-if="row.overallRiskLevel"
                :label="recentProjectRiskLabel(row)"
                :tone="recentProjectRiskTone(row)"
                :dot="false"
              />
              <span v-else class="rt-muted">尚无报告</span>
            </template>
          </el-table-column>
          <el-table-column label="风险事项" width="100" align="right">
            <template #default="{ row }">{{ row.findingCount }}</template>
          </el-table-column>
          <el-table-column label="更新时间" width="150">
            <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link @click="openProject(asRecentProject(row))">
                {{ projectActionLabel(asRecentProject(row)) }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </BaseTableCard>
    </template>
  </div>
</template>

<style scoped>
.dashboard__summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--rt-space-4);
}

.dashboard__distribution-list {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-4);
}

.dashboard__distribution-item {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-2);
}

.dashboard__distribution-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-3);
}

.dashboard__distribution-heading strong {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-md);
}

.dashboard__bar {
  height: var(--rt-space-2);
  overflow: hidden;
  border-radius: var(--rt-radius-round);
  background: var(--rt-bg-hover);
}

.dashboard__bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width var(--rt-duration-base) var(--rt-ease-standard);
}

.dashboard__bar-fill--neutral {
  background: var(--rt-color-info-500);
}

.dashboard__bar-fill--primary {
  background: var(--rt-color-primary-600);
}

.dashboard__bar-fill--success {
  background: var(--rt-color-success-600);
}

.dashboard__bar-fill--warning {
  background: var(--rt-color-warning-600);
}

.dashboard__bar-fill--danger {
  background: var(--rt-color-danger-600);
}

.dashboard__updated-at {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  white-space: nowrap;
}

.dashboard__project-title {
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  background: transparent;
  color: var(--rt-text-link);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard__project-title:hover {
  color: var(--rt-color-primary-800);
}

.dashboard__project-stage {
  margin-top: var(--rt-space-1);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

@media (max-width: 900px) {
  .dashboard__summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .dashboard__updated-at {
    white-space: normal;
  }
}
</style>
