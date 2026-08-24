<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { deleteProject, listProjects } from '@/api/modules'
import { isApiError } from '@/api/request'
import { AppIcons } from '@/icons'
import type { ProjectStage, ProjectStatus, ProjectSummary } from '@/types/project'
import type { StatusTone } from '@/types/ui'

const router = useRouter()
const projects = ref<ProjectSummary[]>([])
const loading = ref(false)
const loadError = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const deleteDialogOpen = ref(false)
const projectPendingDelete = ref<ProjectSummary>()
const deletingProjectId = ref('')
let loadController: AbortController | undefined

const isEmpty = computed(() => !loading.value && !loadError.value && projects.value.length === 0)

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

async function loadProjects(): Promise<void> {
  loadController?.abort()
  loadController = new AbortController()
  loading.value = true
  loadError.value = ''

  try {
    const result = await listProjects(
      { page: page.value, pageSize: pageSize.value },
      loadController.signal,
    )
    projects.value = result.items
    total.value = result.pagination.total
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    loadError.value = error instanceof Error ? error.message : '采购项目加载失败'
  } finally {
    loading.value = false
  }
}

function asProjectSummary(row: unknown): ProjectSummary {
  return row as ProjectSummary
}

function getProjectStatusMeta(row: unknown): { label: string; tone: StatusTone } {
  return statusMeta[asProjectSummary(row).status]
}

function getProjectStageLabel(row: unknown): string {
  return stageLabels[asProjectSummary(row).stage]
}

function canUploadProject(row: unknown): boolean {
  const status = asProjectSummary(row).status
  return status === 'draft' || status === 'uploading'
}

function canViewReview(row: unknown): boolean {
  const status = asProjectSummary(row).status
  return status === 'reviewing' || status === 'completed' || status === 'failed'
}

function canViewReport(row: unknown): boolean {
  return asProjectSummary(row).status === 'completed'
}

function openProject(row: unknown): void {
  const project = asProjectSummary(row)
  let routeName: 'project-upload' | 'project-review' | 'project-report' = 'project-upload'
  if (project.status === 'completed') routeName = 'project-report'
  else if (project.status === 'reviewing' || project.status === 'failed') routeName = 'project-review'
  void router.push({ name: routeName, params: { projectId: project.projectId } })
}

function openProjectUpload(row: unknown): void {
  const project = asProjectSummary(row)
  void router.push({ name: 'project-upload', params: { projectId: project.projectId } })
}

function openProjectReview(row: unknown): void {
  const project = asProjectSummary(row)
  void router.push({ name: 'project-review', params: { projectId: project.projectId } })
}

function openProjectReport(row: unknown): void {
  const project = asProjectSummary(row)
  void router.push({ name: 'project-report', params: { projectId: project.projectId } })
}

function requestProjectDelete(row: unknown): void {
  projectPendingDelete.value = asProjectSummary(row)
  deleteDialogOpen.value = true
}

async function confirmProjectDelete(): Promise<void> {
  const target = projectPendingDelete.value
  if (!target || deletingProjectId.value) return

  deletingProjectId.value = target.projectId
  try {
    await deleteProject(target.projectId)
    deleteDialogOpen.value = false
    projectPendingDelete.value = undefined
    ElMessage.success('采购项目已删除，远端文件正在后台清理')

    const nextTotal = Math.max(0, total.value - 1)
    const maxPage = Math.max(1, Math.ceil(nextTotal / pageSize.value))
    if (page.value > maxPage) {
      page.value = maxPage
    } else {
      await loadProjects()
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '采购项目删除失败')
  } finally {
    deletingProjectId.value = ''
  }
}

function clearPendingDelete(): void {
  if (!deletingProjectId.value) projectPendingDelete.value = undefined
}

function formatDate(value: string): string {
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

async function handleRefresh(): Promise<void> {
  await loadProjects()
  if (!loadError.value) ElMessage.success('项目列表已刷新')
}

watch([page, pageSize], () => void loadProjects())
onMounted(() => void loadProjects())
onBeforeUnmount(() => loadController?.abort())
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      title="采购项目"
      description="创建采购项目、上传材料并持续查看自动合规审查进度与报告。"
    >
      <template #actions>
        <el-button :icon="AppIcons.action.refresh" :loading="loading" @click="handleRefresh">
          刷新
        </el-button>
        <el-button type="primary" @click="$router.push({ name: 'project-create' })">
          新建项目
        </el-button>
      </template>
    </PageHeader>

    <BaseTableCard
      title="项目列表"
      description="按最近更新时间排序"
      :loading="loading"
      :empty="isEmpty"
      :error="Boolean(loadError)"
      empty-title="暂无采购项目"
      empty-description="创建第一个项目后，即可上传材料并生成报告。"
      :error-description="loadError"
      @retry="loadProjects"
    >
      <template #emptyAction>
        <el-button type="primary" @click="$router.push({ name: 'project-create' })">
          新建项目
        </el-button>
      </template>

      <el-table :data="projects" row-key="projectId">
        <el-table-column label="项目名称" min-width="260">
          <template #default="{ row }">
            <button class="project-list__title" type="button" @click="openProject(row)">
              {{ row.projectTitle }}
            </button>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <StatusTag
              :label="getProjectStatusMeta(row).label"
              :tone="getProjectStatusMeta(row).tone"
            />
          </template>
        </el-table-column>
        <el-table-column label="当前阶段" min-width="180">
          <template #default="{ row }">
            {{ getProjectStageLabel(row) }}
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="190">
          <template #default="{ row }">
            {{ formatDate(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="310" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canUploadProject(row)" type="primary" link @click="openProjectUpload(row)">
              上传材料
            </el-button>
            <el-button v-if="canViewReport(row)" type="primary" link @click="openProjectReport(row)">
              查看报告
            </el-button>
            <el-button v-if="canViewReview(row)" link @click="openProjectReview(row)">
              查看执行过程
            </el-button>
            <el-button
              type="danger"
              link
              :icon="AppIcons.action.delete"
              :loading="deletingProjectId === row.projectId"
              @click="requestProjectDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <PaginationBar
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          :disabled="loading"
          :page-sizes="[10, 20, 50]"
        />
      </template>
    </BaseTableCard>

    <ConfirmActionDialog
      v-model="deleteDialogOpen"
      title="删除采购项目"
      :description="`删除“${projectPendingDelete?.projectTitle ?? ''}”后，项目、文件记录和审查报告将立即删除，远端文件将在后台清理。`"
      confirm-text="删除项目"
      confirm-type="danger"
      :loading="Boolean(deletingProjectId)"
      @confirm="confirmProjectDelete"
      @cancel="clearPendingDelete"
    />
  </div>
</template>

<style scoped>
.project-list__title {
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

.project-list__title:hover {
  color: var(--rt-color-primary-800);
}
</style>
