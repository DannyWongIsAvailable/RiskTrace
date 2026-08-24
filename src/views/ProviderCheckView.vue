<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, ref } from 'vue'

import { runProviderCheck } from '@/api/modules'
import { isApiError } from '@/api/request'
import { AppIcons } from '@/icons'
import type {
  ProviderDiagnosticCheckState,
  ProviderDiagnosticLevel,
  ProviderDiagnosticLogEntry,
  ProviderDiagnosticResult,
} from '@/api/modules/system'
import type { StatusTone } from '@/types/ui'

const result = ref<ProviderDiagnosticResult>()
const loading = ref(false)
const loadError = ref('')
let controller: AbortController | undefined

const overallTone = computed<StatusTone>(() => {
  if (loading.value) return 'warning'
  if (!result.value) return 'neutral'
  return result.value.ok ? 'success' : 'danger'
})

const overallLabel = computed(() => {
  if (loading.value) return '检查中'
  if (!result.value) return '未检查'
  return result.value.ok ? '全部通过' : '存在异常'
})

const checkItems = computed(() => {
  const checks = result.value?.checks
  return [
    {
      key: 'functions',
      label: 'Pages Functions',
      description: '浏览器 → Cloudflare Pages Functions',
      state: checks?.functions ?? 'skipped',
    },
    {
      key: 'fastApi',
      label: 'FastAPI',
      description: 'Pages Functions → ECS FastAPI /healthz',
      state: checks?.fastApi ?? 'skipped',
    },
    {
      key: 'asyncApi',
      label: '异步 Run API',
      description: 'FastAPI /runs 提交/查询契约',
      state: checks?.asyncApi ?? 'skipped',
    },
    {
      key: 'harness',
      label: 'DeepSeek Harness',
      description: 'FastAPI → Harness SDK → DeepSeek 模型',
      state: checks?.harness ?? 'skipped',
    },
  ]
})

function checkStateMeta(state: ProviderDiagnosticCheckState): {
  label: string
  tone: StatusTone
} {
  if (state === 'passed') return { label: '通过', tone: 'success' }
  if (state === 'failed') return { label: '失败', tone: 'danger' }
  return { label: '未执行', tone: 'neutral' }
}

function logTone(level: ProviderDiagnosticLevel): StatusTone {
  if (level === 'success') return 'success'
  if (level === 'warning') return 'warning'
  if (level === 'error') return 'danger'
  return 'neutral'
}

function logLevelLabel(level: ProviderDiagnosticLevel): string {
  const labels: Record<ProviderDiagnosticLevel, string> = {
    info: 'INFO',
    success: 'OK',
    warning: 'WARN',
    error: 'ERROR',
  }
  return labels[level]
}

function layerLabel(layer: ProviderDiagnosticLogEntry['layer']): string {
  const labels: Record<ProviderDiagnosticLogEntry['layer'], string> = {
    functions: 'FUNCTIONS',
    fastapi: 'FASTAPI',
    harness: 'HARNESS',
  }
  return labels[layer]
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(date)
}

function formatDuration(value: number): string {
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(2)} s`
}

function prettyDetails(details: Record<string, unknown>): string {
  return JSON.stringify(details, null, 2)
}

async function executeCheck(): Promise<void> {
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  loadError.value = ''

  try {
    result.value = await runProviderCheck(controller.signal)
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    loadError.value = error instanceof Error ? error.message : 'Provider 检查请求失败'
  } finally {
    loading.value = false
  }
}

async function copyLogs(): Promise<void> {
  if (!result.value) return

  try {
    await navigator.clipboard.writeText(JSON.stringify(result.value, null, 2))
    ElMessage.success('检查日志已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择日志内容')
  }
}

onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <div class="rt-page rt-page-stack provider-check">
    <PageHeader
      title="DeepSeek Harness 检查"
      description="从当前页面检查 Pages Functions、FastAPI Run/Event API、DeepSeek Harness SDK 与模型调用，并展示诊断日志。"
    >
      <template #actions>
        <el-button
          :icon="result ? AppIcons.action.refresh : undefined"
          type="primary"
          :loading="loading"
          @click="executeCheck"
        >
          {{ result ? '重新检查' : '开始检查' }}
        </el-button>
        <el-button :disabled="!result" @click="copyLogs">复制日志</el-button>
      </template>
    </PageHeader>

    <InlineNotice
      v-if="loadError"
      title="Harness 检查接口调用失败"
      :description="loadError"
      tone="danger"
    />

    <InlineNotice
      v-else-if="loading"
      title="正在执行 DeepSeek Harness 检查"
      description="诊断会验证异步 Run/Event API 契约，并执行一次 Harness 模型探针；完成后展示 Functions、FastAPI 与 Harness 日志。"
      tone="warning"
    />

    <BaseCard title="检查结果" description="当前 DeepSeek Harness 全链路状态">
      <template #actions>
        <StatusTag :label="overallLabel" :tone="overallTone" />
      </template>

      <div class="provider-check__status-grid">
        <div v-for="item in checkItems" :key="item.key" class="provider-check__status-item">
          <div class="provider-check__status-copy">
            <strong>{{ item.label }}</strong>
            <span>{{ item.description }}</span>
          </div>
          <StatusTag
            :label="checkStateMeta(item.state).label"
            :tone="checkStateMeta(item.state).tone"
          />
        </div>
      </div>
    </BaseCard>

    <BaseCard v-if="result" title="运行信息" description="本次检查使用的公开诊断配置，不展示任何密钥值。">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="Check ID">
          <code>{{ result.checkId }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="总耗时">
          {{ formatDuration(result.durationMs) }}
        </el-descriptions-item>
        <el-descriptions-item label="Agent Runtime">
          {{ result.provider.configuredProvider }}
        </el-descriptions-item>
        <el-descriptions-item label="Harness API Key">
          {{ result.provider.apiKeyConfigured ? '已配置' : '未配置' }}
        </el-descriptions-item>
        <el-descriptions-item label="Harness Base URL" :span="2">
          <code>{{ result.provider.baseUrl ?? '未配置' }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="开始时间">
          {{ formatTime(result.startedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="完成时间">
          {{ formatTime(result.finishedAt) }}
        </el-descriptions-item>
      </el-descriptions>
    </BaseCard>

    <BaseCard
      title="详细日志"
      description="日志按实际执行顺序返回，可直接用于定位 Functions → FastAPI → Harness 的断点。"
      padding="none"
    >
      <div v-if="loading && !result" class="provider-check__empty-log">
        正在等待同步检查结果…
      </div>
      <div v-else-if="!result?.logs.length" class="provider-check__empty-log">
        暂无日志。点击“开始检查”启动 Harness 诊断。
      </div>
      <div v-else class="provider-check__logs">
        <article
          v-for="(entry, index) in result.logs"
          :key="`${entry.timestamp}-${index}`"
          class="provider-check__log-entry"
          :class="`provider-check__log-entry--${entry.level}`"
        >
          <div class="provider-check__log-header">
            <div class="provider-check__log-meta">
              <span class="provider-check__log-index">#{{ index + 1 }}</span>
              <code>{{ formatTime(entry.timestamp) }}</code>
              <span class="provider-check__layer">{{ layerLabel(entry.layer) }}</span>
              <StatusTag
                :label="logLevelLabel(entry.level)"
                :tone="logTone(entry.level)"
                :dot="false"
              />
            </div>
          </div>

          <p class="provider-check__log-message">{{ entry.message }}</p>
          <pre v-if="entry.details" class="provider-check__log-details">{{ prettyDetails(entry.details) }}</pre>
        </article>
      </div>
    </BaseCard>
  </div>
</template>

<style scoped>
.provider-check__status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--rt-space-3);
}

.provider-check__status-item {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-3);
  padding: var(--rt-space-4);
  border: 1px solid var(--rt-border-subtle);
  border-radius: var(--rt-radius-md);
  background: var(--rt-bg-page);
}

.provider-check__status-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--rt-space-1);
}

.provider-check__status-copy strong {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
}

.provider-check__status-copy span {
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.provider-check :deep(.el-descriptions__label) {
  width: 170px;
}

.provider-check code,
.provider-check__log-details {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.provider-check__logs {
  display: flex;
  flex-direction: column;
}

.provider-check__log-entry {
  padding: var(--rt-space-4) var(--rt-space-5);
  border-left: 3px solid transparent;
  border-bottom: 1px solid var(--rt-border-subtle);
  background: var(--rt-bg-panel);
}

.provider-check__log-entry:last-child {
  border-bottom: 0;
}

.provider-check__log-entry--success {
  border-left-color: var(--el-color-success);
}

.provider-check__log-entry--warning {
  border-left-color: var(--el-color-warning);
}

.provider-check__log-entry--error {
  border-left-color: var(--el-color-danger);
}

.provider-check__log-entry--info {
  border-left-color: var(--el-color-info);
}

.provider-check__log-header,
.provider-check__log-meta {
  display: flex;
  align-items: center;
  gap: var(--rt-space-2);
}

.provider-check__log-header {
  justify-content: space-between;
  flex-wrap: wrap;
}

.provider-check__log-meta {
  min-width: 0;
  flex-wrap: wrap;
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.provider-check__log-index {
  min-width: 32px;
  color: var(--rt-text-tertiary);
  font-weight: 700;
}

.provider-check__layer {
  padding: 2px 7px;
  border-radius: var(--rt-radius-round);
  background: var(--rt-bg-hover);
  color: var(--rt-text-secondary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.provider-check__log-message {
  margin-top: var(--rt-space-2);
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
  font-weight: 650;
}

.provider-check__log-details {
  overflow-x: auto;
  max-height: 360px;
  margin-top: var(--rt-space-3);
  padding: var(--rt-space-3);
  border: 1px solid var(--rt-border-subtle);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-bg-page);
  color: var(--rt-text-secondary);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.provider-check__empty-log {
  padding: var(--rt-space-6);
  color: var(--rt-text-tertiary);
  text-align: center;
}

@media (max-width: 960px) {
  .provider-check__status-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .provider-check :deep(.el-descriptions__label) {
    width: auto;
  }

  .provider-check__log-entry {
    padding: var(--rt-space-4);
  }
}
</style>
