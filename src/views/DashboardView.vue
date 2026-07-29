<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { getHealth, type HealthInfo } from '@/api/modules'
import { recentActivities, dashboardMetrics, topRiskCases } from '@/mocks/dashboard'
import type { RiskCaseSummary } from '@/types/dashboard'
import type { StatusTone } from '@/types/ui'
import { showPendingIntegration } from '@/utils/interaction'

const health = ref<HealthInfo | null>(null)
const healthLoading = ref(true)
const healthError = ref(false)
const controller = new AbortController()

const activityToneStyles: Record<StatusTone, { background: string }> = {
  neutral: { background: 'var(--rt-color-info-500)' },
  primary: { background: 'var(--rt-color-primary-600)' },
  success: { background: 'var(--rt-color-success-600)' },
  warning: { background: 'var(--rt-color-warning-600)' },
  danger: { background: 'var(--rt-color-danger-600)' },
}

function riskLevelTone(level: RiskCaseSummary['riskLevel']): StatusTone {
  if (level === '重大风险') {
    return 'danger'
  }

  if (level === '高风险') {
    return 'warning'
  }

  return 'primary'
}

function taskStatusTone(status: RiskCaseSummary['status']): StatusTone {
  if (status === '处理中') {
    return 'primary'
  }

  if (status === '待补件') {
    return 'warning'
  }

  return 'neutral'
}

async function loadHealth(): Promise<void> {
  healthLoading.value = true
  healthError.value = false

  try {
    health.value = await getHealth(controller.signal)
  } catch {
    healthError.value = true
  } finally {
    healthLoading.value = false
  }
}

onMounted(loadHealth)
onBeforeUnmount(() => controller.abort())
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      eyebrow="Procure-to-pay risk control"
      title="风险驾驶舱"
      description="统一查看采购事件、风险等级、处置进度与系统分析活动。当前页面使用集中维护的演示数据，用于验证设计系统和组件边界。"
    >
      <template #actions>
        <el-button @click="showPendingIntegration">导出报告</el-button>
        <el-button type="primary" @click="showPendingIntegration">导入演示案例</el-button>
      </template>
    </PageHeader>

    <div class="rt-grid rt-grid--metrics">
      <MetricCard
        v-for="metric in dashboardMetrics"
        :key="metric.key"
        :label="metric.label"
        :value="metric.value"
        :description="metric.description"
        :trend="metric.trend"
        :trend-direction="metric.trendDirection"
        :tone="metric.tone"
      />
    </div>

    <div class="rt-grid rt-grid--two-columns">
      <BaseTableCard
        title="重点风险事件"
        description="按综合风险分数与待处理时长排序"
      >
        <template #actions>
          <el-button text @click="showPendingIntegration">查看全部</el-button>
        </template>

        <el-table :data="topRiskCases" table-layout="fixed">
          <el-table-column prop="caseNo" label="事件编号" width="170" />
          <el-table-column label="风险事件" min-width="260">
            <template #default="scope">
              <div class="dashboard__case-title">{{ scope.row.title }}</div>
              <div class="dashboard__case-supplier">{{ scope.row.supplier }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="amount" label="涉及金额" width="130" />
          <el-table-column label="风险等级" width="110">
            <template #default="scope">
              <StatusTag
                :label="scope.row.riskLevel"
                :tone="riskLevelTone(scope.row.riskLevel)"
              />
            </template>
          </el-table-column>
          <el-table-column label="分数" width="80" align="right">
            <template #default="scope">
              <strong class="dashboard__score">{{ scope.row.riskScore }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="scope">
              <StatusTag
                :label="scope.row.status"
                :tone="taskStatusTone(scope.row.status)"
                :dot="false"
              />
            </template>
          </el-table-column>
        </el-table>

        <template #footer>
          <div class="dashboard__table-footer">
            <span>数据更新时间：今日 10:22</span>
            <span>共 8 个风险事件</span>
          </div>
        </template>
      </BaseTableCard>

      <div class="dashboard__side-stack">
        <BaseCard title="系统状态" description="Pages Functions 与 API 健康检查">
          <LoadingState v-if="healthLoading" title="正在检查服务状态" :rows="3" />
          <ErrorState
            v-else-if="healthError"
            compact
            title="健康检查不可用"
            description="本地仅启动 Vite 时不会运行 Pages Functions。请使用 Wrangler 联调，或确认 API 地址配置。"
            retry-label="重新检查"
            @retry="loadHealth"
          />
          <div v-else-if="health" class="dashboard__health">
            <div class="dashboard__health-row">
              <span>运行状态</span>
              <StatusTag label="正常" tone="success" />
            </div>
            <div class="dashboard__health-row">
              <span>应用名称</span>
              <strong>{{ health.appName }}</strong>
            </div>
            <div class="dashboard__health-row">
              <span>运行环境</span>
              <strong>{{ health.environment }}</strong>
            </div>
            <div class="dashboard__health-row">
              <span>检查时间</span>
              <strong>{{ new Date(health.timestamp).toLocaleTimeString('zh-CN') }}</strong>
            </div>
          </div>
        </BaseCard>

        <BaseCard title="最近分析活动" description="Agent 与人工处置的统一时间线">
          <ul class="dashboard__activity-list">
            <li v-for="activity in recentActivities" :key="activity.id" class="dashboard__activity">
              <span
                class="dashboard__activity-line"
                :style="activityToneStyles[activity.tone]"
              />
              <div class="dashboard__activity-copy">
                <div class="dashboard__activity-title-row">
                  <strong>{{ activity.title }}</strong>
                  <time>{{ activity.time }}</time>
                </div>
                <p>{{ activity.description }}</p>
              </div>
            </li>
          </ul>
        </BaseCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard__side-stack {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--rt-space-4);
}

.dashboard__case-title {
  overflow: hidden;
  color: var(--rt-text-primary);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard__case-supplier {
  overflow: hidden;
  margin-top: 3px;
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard__score {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-lg);
}

.dashboard__table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-3);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.dashboard__health {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-3);
}

.dashboard__health-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-4);
  padding-bottom: var(--rt-space-3);
  border-bottom: 1px solid var(--rt-border-subtle);
  color: var(--rt-text-secondary);
  font-size: var(--rt-font-size-sm);
}

.dashboard__health-row:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.dashboard__health-row strong {
  color: var(--rt-text-primary);
  font-weight: 700;
}

.dashboard__activity-list {
  display: flex;
  flex-direction: column;
}

.dashboard__activity {
  display: flex;
  gap: var(--rt-space-3);
  padding: var(--rt-space-3) 0;
  border-bottom: 1px solid var(--rt-border-subtle);
}

.dashboard__activity:first-child {
  padding-top: 0;
}

.dashboard__activity:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.dashboard__activity-line {
  width: 3px;
  flex: 0 0 auto;
  border-radius: var(--rt-radius-round);
  background: var(--rt-color-info-500);
}

.dashboard__activity-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.dashboard__activity-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-3);
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
}

.dashboard__activity-title-row time {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  font-weight: 500;
}

.dashboard__activity-copy p {
  margin-top: 4px;
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

@media (max-width: 720px) {
  .dashboard__table-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
