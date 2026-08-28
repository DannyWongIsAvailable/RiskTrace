<script setup lang="ts">
import type { RiskFinding } from '@/types/risk-finding'
import type { RiskLevel } from '@/types/project'
import type { StatusTone } from '@/types/ui'

const emit = defineEmits<{
  handle: [finding: RiskFinding]
}>()

defineProps<{
  finding: RiskFinding
}>()

const riskMeta: Record<RiskLevel, { label: string; tone: StatusTone }> = {
  low: { label: '低风险', tone: 'success' },
  medium: { label: '中风险', tone: 'warning' },
  high: { label: '高风险', tone: 'danger' },
  critical: { label: '重大风险', tone: 'danger' },
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
</script>

<template>
  <BaseCard :title="finding.title">
    <template #actions>
      <div class="risk-finding-card__tags">
        <StatusTag
          :label="riskMeta[finding.riskLevel].label"
          :tone="riskMeta[finding.riskLevel].tone"
        />
        <StatusTag
          :label="finding.status === 'pending' ? '待处置与整改' : '已完成'"
          :tone="finding.status === 'pending' ? 'warning' : 'success'"
        />
      </div>
    </template>

    <div class="risk-finding-card__meta">
      <span>{{ finding.projectTitle }}</span>
      <span>{{ finding.domain }}</span>
    </div>

    <div class="risk-finding-card__grid">
      <div>
        <span class="risk-finding-card__label">风险说明</span>
        <p>{{ finding.description }}</p>
      </div>
      <div>
        <span class="risk-finding-card__label">审查建议</span>
        <p>{{ finding.recommendation }}</p>
      </div>
    </div>

    <div class="risk-finding-card__documents">
      <span class="risk-finding-card__label">关联文件</span>
      <div v-if="finding.relatedDocuments.length" class="risk-finding-card__tag-list">
        <el-tag
          v-for="document in finding.relatedDocuments"
          :key="document.documentId"
          effect="plain"
        >
          {{ document.fileName }}
        </el-tag>
      </div>
      <span v-else class="rt-muted">暂无关联文件</span>
    </div>

    <template v-if="finding.status === 'completed'">
      <el-divider />
      <div class="risk-finding-card__completion-grid">
        <div>
          <span class="risk-finding-card__label">处置方式</span>
          <p>{{ finding.dispositionMethod ?? '—' }}</p>
        </div>
        <div>
          <span class="risk-finding-card__label">责任人</span>
          <p>{{ finding.responsiblePerson ?? '—' }}</p>
        </div>
        <div>
          <span class="risk-finding-card__label">整改完成时间</span>
          <p>{{ formatDateTime(finding.rectifiedAt) }}</p>
        </div>
        <div>
          <span class="risk-finding-card__label">系统完成时间</span>
          <p>{{ formatDateTime(finding.completedAt) }}</p>
        </div>
        <div class="risk-finding-card__full-row">
          <span class="risk-finding-card__label">整改措施</span>
          <p>{{ finding.rectificationMeasures ?? '—' }}</p>
        </div>
        <div class="risk-finding-card__full-row">
          <span class="risk-finding-card__label">整改说明</span>
          <p>{{ finding.rectificationDescription ?? '—' }}</p>
        </div>
        <div class="risk-finding-card__full-row">
          <span class="risk-finding-card__label">证明材料</span>
          <div v-if="finding.attachments.length" class="risk-finding-card__tag-list">
            <el-tag
              v-for="attachment in finding.attachments"
              :key="attachment.attachmentId"
              type="success"
              effect="plain"
            >
              {{ attachment.fileName }}
            </el-tag>
          </div>
          <span v-else class="rt-muted">暂无证明材料</span>
        </div>
      </div>
    </template>

    <template v-if="finding.status === 'pending'" #footer>
      <div class="risk-finding-card__footer">
        <span class="rt-muted">填写处置与整改信息并上传证明材料后，即可完成该风险事项。</span>
        <el-button type="primary" @click="emit('handle', finding)">处置与整改</el-button>
      </div>
    </template>
  </BaseCard>
</template>

<style scoped>
.risk-finding-card__tags,
.risk-finding-card__tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rt-space-2);
}

.risk-finding-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rt-space-2) var(--rt-space-5);
  margin-bottom: var(--rt-space-5);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.risk-finding-card__grid,
.risk-finding-card__completion-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--rt-space-5);
}

.risk-finding-card__grid p,
.risk-finding-card__completion-grid p {
  color: var(--rt-text-secondary);
  line-height: var(--rt-line-height-base);
  white-space: pre-wrap;
}

.risk-finding-card__label {
  display: block;
  margin-bottom: var(--rt-space-2);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  font-weight: 700;
}

.risk-finding-card__documents {
  margin-top: var(--rt-space-5);
}

.risk-finding-card__full-row {
  grid-column: 1 / -1;
}

.risk-finding-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-4);
}

@media (max-width: 760px) {
  .risk-finding-card__grid,
  .risk-finding-card__completion-grid {
    grid-template-columns: 1fr;
  }

  .risk-finding-card__full-row {
    grid-column: auto;
  }

  .risk-finding-card__footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
