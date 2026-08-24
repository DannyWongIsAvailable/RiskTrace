<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  deleteProjectDocument,
  getProject,
  getProjectMaterialAnalysis,
  getProjectReport,
} from '@/api/modules'
import { isApiError } from '@/api/request'
import MaterialAnalysisPanel from '@/components/projects/MaterialAnalysisPanel.vue'
import { AppIcons } from '@/icons'
import type {
  MaterialAnalysis,
  ProjectDetail,
  ProjectDocument,
  ReviewReport,
  RiskLevel,
} from '@/types/project'
import type { StatusTone } from '@/types/ui'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId ?? ''))
const project = ref<ProjectDetail>()
const materialAnalysis = ref<MaterialAnalysis>()
const report = ref<ReviewReport>()
const loading = ref(true)
const loadError = ref('')
const deleteDialogOpen = ref(false)
const documentPendingDelete = ref<ProjectDocument>()
const deletingDocumentId = ref('')
const controller = new AbortController()
const projectDocuments = computed(() => project.value?.documents ?? [])
const materialsExpanded = ref(false)

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === fileName.length - 1) return 'FILE'
  return fileName.slice(lastDot + 1).toUpperCase().slice(0, 5)
}

const riskMeta: Record<RiskLevel, { label: string; tone: StatusTone }> = {
  low: { label: '低风险', tone: 'success' },
  medium: { label: '中风险', tone: 'warning' },
  high: { label: '高风险', tone: 'danger' },
  critical: { label: '重大风险', tone: 'danger' },
}

const completenessMeta = {
  complete: { label: '材料基本完整', tone: 'success' as StatusTone },
  incomplete: { label: '材料不完整', tone: 'warning' as StatusTone },
  uncertain: { label: '完整性待确认', tone: 'neutral' as StatusTone },
}

async function loadReport(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const [projectResult, materialAnalysisResult, reportResult] = await Promise.all([
      getProject(projectId.value, controller.signal),
      getProjectMaterialAnalysis(projectId.value, controller.signal),
      getProjectReport(projectId.value, controller.signal),
    ])
    project.value = projectResult
    materialAnalysis.value = materialAnalysisResult
    report.value = reportResult
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    loadError.value = error instanceof Error ? error.message : '报告加载失败'
  } finally {
    loading.value = false
  }
}

function requestDocumentDelete(document: ProjectDocument): void {
  documentPendingDelete.value = document
  deleteDialogOpen.value = true
}

async function confirmDocumentDelete(): Promise<void> {
  const target = documentPendingDelete.value
  if (!target || deletingDocumentId.value) return

  deletingDocumentId.value = target.documentId
  try {
    await deleteProjectDocument(projectId.value, target.documentId, controller.signal)
    deleteDialogOpen.value = false
    documentPendingDelete.value = undefined
    ElMessage.success('文件记录已删除，远端文件正在后台清理，原审查报告已失效')
    await router.replace({ name: 'project-upload', params: { projectId: projectId.value } })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '项目材料删除失败')
  } finally {
    deletingDocumentId.value = ''
  }
}

function clearPendingDocumentDelete(): void {
  if (!deletingDocumentId.value) documentPendingDelete.value = undefined
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(() => void loadReport())
onBeforeUnmount(() => controller.abort())
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      :title="project?.projectTitle ?? report?.projectTitle ?? '合规审查报告'"
      description="只读合规审查报告，集中展示材料理解、风险事项、关联材料与分析限制。"
      :breadcrumbs="[
        { label: '采购项目', to: { name: 'projects' } },
        { label: '合规审查报告' },
      ]"
    >
      <template #actions>
        <el-button @click="$router.push({ name: 'projects' })">返回项目列表</el-button>
      </template>
    </PageHeader>

    <LoadingState v-if="loading" title="正在读取合规审查报告" :rows="7" />
    <ErrorState
      v-else-if="loadError"
      title="报告加载失败"
      :description="loadError"
      @retry="loadReport"
    />

    <template v-else-if="report">

      <MaterialAnalysisPanel v-if="materialAnalysis" :analysis="materialAnalysis" />

      <div class="project-report__summary-grid">
        <BaseCard title="总体风险等级">
          <div class="project-report__metric">
            <StatusTag
              :label="riskMeta[report.overallRiskLevel].label"
              :tone="riskMeta[report.overallRiskLevel].tone"
              size="large"
            />
            <span>共识别 {{ report.findings.length }} 项风险事项</span>
          </div>
        </BaseCard>
        <BaseCard title="材料完整性">
          <div class="project-report__metric">
            <StatusTag
              :label="completenessMeta[report.completeness.result].label"
              :tone="completenessMeta[report.completeness.result].tone"
              size="large"
            />
            <span>{{ report.completeness.summary }}</span>
          </div>
        </BaseCard>
      </div>

      <BaseCard title="报告摘要">
        <p class="project-report__summary">{{ report.summary }}</p>
      </BaseCard>

      <BaseCard
        v-if="report.completeness.missingMaterials.length"
        title="缺失材料"
        description="建议补充以下材料后重新执行合规审查。"
      >
        <div class="project-report__tag-list">
          <el-tag v-for="item in report.completeness.missingMaterials" :key="item" type="warning" effect="light">
            {{ item }}
          </el-tag>
        </div>
      </BaseCard>

      <section>
        <SectionHeader title="风险事项" description="风险事项关联当前项目中已上传的文件。" />
        <div class="project-report__finding-list">
          <BaseCard
            v-for="(finding, index) in report.findings"
            :key="finding.findingId"
            :title="`${index + 1}. ${finding.title}`"
          >
            <template #actions>
              <StatusTag
                :label="riskMeta[finding.riskLevel].label"
                :tone="riskMeta[finding.riskLevel].tone"
              />
            </template>

            <div class="project-report__finding-grid">
              <div>
                <span class="project-report__label">审查领域</span>
                <p>{{ finding.domain }}</p>
              </div>
              <div>
                <span class="project-report__label">风险说明</span>
                <p>{{ finding.description }}</p>
              </div>
              <div>
                <span class="project-report__label">建议</span>
                <p>{{ finding.recommendation }}</p>
              </div>
              <div>
                <span class="project-report__label">关联文件</span>
                <div v-if="finding.relatedDocuments.length" class="project-report__tag-list">
                  <el-tag v-for="document in finding.relatedDocuments" :key="document.documentId" effect="plain">
                    {{ document.fileName }}
                  </el-tag>
                </div>
                <p v-else class="rt-muted">暂无关联文件</p>
              </div>
            </div>
          </BaseCard>
        </div>
      </section>

      <BaseCard v-if="report.limitations.length" title="分析限制">
        <ul class="project-report__limitations">
          <li v-for="item in report.limitations" :key="item">{{ item }}</li>
        </ul>
      </BaseCard>

      <BaseCard
        v-if="projectDocuments.length"
        title="项目材料"
        description="原始材料统一收纳在报告末尾。展开后可查看文件名称、大小并执行删除操作。"
      >
        <template #actions>
          <el-button link @click="materialsExpanded = !materialsExpanded">
            {{ materialsExpanded ? '收起' : `展开（${projectDocuments.length}）` }}
          </el-button>
        </template>

        <div v-show="materialsExpanded" class="project-report__file-grid">
          <div
            v-for="document in projectDocuments"
            :key="document.documentId"
            class="project-report__file-tile"
          >
            <div class="project-report__file-icon" aria-hidden="true">
              <span>{{ getFileExtension(document.fileName) }}</span>
            </div>

            <div class="project-report__file-name" :title="document.fileName">
              {{ document.fileName }}
            </div>

            <div class="project-report__file-meta">
              <span>{{ formatFileSize(document.sizeBytes) }}</span>
              <el-button
                type="danger"
                link
                :icon="AppIcons.action.delete"
                :loading="deletingDocumentId === document.documentId"
                @click="requestDocumentDelete(document)"
              >
                删除
              </el-button>
            </div>
          </div>
        </div>
      </BaseCard>
    </template>

    <ConfirmActionDialog
      v-model="deleteDialogOpen"
      title="删除项目材料"
      :description="`删除“${documentPendingDelete?.fileName ?? ''}”后，材料记录将立即删除，远端文件将在后台清理，当前审查报告也会失效。`"
      confirm-text="删除文件"
      confirm-type="danger"
      :loading="Boolean(deletingDocumentId)"
      @confirm="confirmDocumentDelete"
      @cancel="clearPendingDocumentDelete"
    />
  </div>
</template>

<style scoped>
.project-report__file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: var(--rt-space-5) var(--rt-space-4);
  padding-top: var(--rt-space-2);
}

.project-report__file-tile {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-direction: column;
  padding: var(--rt-space-3);
  border: 1px solid transparent;
  border-radius: var(--rt-radius-md);
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease;
}

.project-report__file-tile:hover {
  border-color: var(--rt-border-subtle);
}

.project-report__file-icon {
  display: flex;
  width: 58px;
  height: 68px;
  align-items: flex-end;
  justify-content: center;
  padding: 0 6px 9px;
  border: 1px solid var(--rt-border-subtle);
  border-radius: var(--rt-radius-md);
}

.project-report__file-icon span {
  overflow: hidden;
  width: 100%;
  color: var(--rt-text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-report__file-name {
  display: -webkit-box;
  overflow: hidden;
  width: 100%;
  min-height: 38px;
  margin-top: var(--rt-space-2);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
  line-height: 19px;
  text-align: center;
  word-break: break-all;
}

.project-report__file-meta {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: var(--rt-space-2);
  margin-top: var(--rt-space-1);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.project-report__summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--rt-space-4);
}

.project-report__metric {
  display: flex;
  align-items: center;
  gap: var(--rt-space-4);
}

.project-report__metric span:last-child {
  color: var(--rt-text-secondary);
  font-size: var(--rt-font-size-sm);
}

.project-report__summary,
.project-report__finding-grid p,
.project-report__limitations {
  color: var(--rt-text-secondary);
  line-height: var(--rt-line-height-base);
}

.project-report__finding-list {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-4);
  margin-top: var(--rt-space-4);
}

.project-report__finding-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--rt-space-5);
}

.project-report__label {
  display: block;
  margin-bottom: var(--rt-space-2);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
  font-weight: 700;
}

.project-report__tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--rt-space-2);
}

.project-report__limitations {
  padding-left: var(--rt-space-5);
}

.project-report__limitations li + li {
  margin-top: var(--rt-space-2);
}

@media (max-width: 760px) {
  .project-report__file-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .project-report__summary-grid,
  .project-report__finding-grid {
    grid-template-columns: 1fr;
  }

  .project-report__metric {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
