<script setup lang="ts">
import { ElButton, ElMessage, ElProgress } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  completeProjectUploads,
  confirmDocumentUpload,
  createUploadSession,
  deleteProjectDocument,
  getProject,
  uploadFileToSignedUrl,
} from '@/api/modules'
import { isApiError } from '@/api/request'
import { AppIcons } from '@/icons'
import type {
  ProjectDetail,
  ProjectDocument,
  UploadFileStatus,
  UploadSessionFile,
} from '@/types/project'
import type { StatusTone } from '@/types/ui'

interface QueuedFile {
  key: string
  file: File
  status: UploadFileStatus
  progress: number
  error: string
  target?: UploadSessionFile
}

interface DocumentDeleteTarget {
  documentId: string
  fileName: string
  queuedFileKey?: string
}

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId ?? ''))
const fileInput = ref<HTMLInputElement>()
const project = ref<ProjectDetail>()
const queuedFiles = ref<QueuedFile[]>([])
const loadingProject = ref(true)
const uploading = ref(false)
const finalizing = ref(false)
const pageError = ref('')
const deleteDialogOpen = ref(false)
const documentPendingDelete = ref<DocumentDeleteTarget>()
const deletingDocumentId = ref('')
const controller = new AbortController()

const acceptedExtensions = '.pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.csv,.doc,.docx,.ppt,.pptx,.txt,.md,.json'
const hasQueuedFiles = computed(() => queuedFiles.value.length > 0)
const hasStoredDocuments = computed(() => Boolean(project.value?.documents.length))
const hasFailures = computed(() => queuedFiles.value.some((item) => item.status === 'failed'))
const allUploaded = computed(
  () => hasQueuedFiles.value && queuedFiles.value.every((item) => item.status === 'uploaded'),
)
const canEditSelection = computed(() => !uploading.value && !queuedFiles.value.some((item) => item.target))

const uploadStatusMeta: Record<UploadFileStatus, { label: string; tone: StatusTone }> = {
  queued: { label: '待上传', tone: 'neutral' },
  uploading: { label: '上传中', tone: 'primary' },
  uploaded: { label: '已上传', tone: 'success' },
  failed: { label: '上传失败', tone: 'danger' },
}

async function loadProject(): Promise<void> {
  loadingProject.value = true
  pageError.value = ''
  try {
    project.value = await getProject(projectId.value, controller.signal)
    if (project.value.status === 'completed') {
      await router.replace({ name: 'project-report', params: { projectId: projectId.value } })
    }
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    pageError.value = error instanceof Error ? error.message : '项目信息加载失败'
  } finally {
    loadingProject.value = false
  }
}

function openFilePicker(): void {
  if (canEditSelection.value) fileInput.value?.click()
}

function handleFileSelection(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  const existingKeys = new Set(queuedFiles.value.map((item) => item.key))

  for (const file of files) {
    const key = `${file.name}-${file.size}-${file.lastModified}`
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    queuedFiles.value.push({ key, file, status: 'queued', progress: 0, error: '' })
  }
  input.value = ''
}

function removeFile(index: number): void {
  if (canEditSelection.value) queuedFiles.value.splice(index, 1)
}

function requestStoredDocumentDelete(document: ProjectDocument): void {
  documentPendingDelete.value = {
    documentId: document.documentId,
    fileName: document.fileName,
  }
  deleteDialogOpen.value = true
}

function requestQueuedDocumentDelete(item: QueuedFile): void {
  if (!item.target) return
  documentPendingDelete.value = {
    documentId: item.target.documentId,
    fileName: item.file.name,
    queuedFileKey: item.key,
  }
  deleteDialogOpen.value = true
}

async function confirmDocumentDelete(): Promise<void> {
  const target = documentPendingDelete.value
  if (!target || deletingDocumentId.value) return

  deletingDocumentId.value = target.documentId
  pageError.value = ''
  try {
    const result = await deleteProjectDocument(
      projectId.value,
      target.documentId,
      controller.signal,
    )

    if (target.queuedFileKey) {
      queuedFiles.value = queuedFiles.value.filter((item) => item.key !== target.queuedFileKey)
    } else if (project.value) {
      project.value.documents = project.value.documents.filter(
        (document) => document.documentId !== target.documentId,
      )
    }

    if (project.value) {
      project.value.status = result.projectStatus
      project.value.stage = result.projectStage
      project.value.review = null
      project.value.updatedAt = new Date().toISOString()
    }

    deleteDialogOpen.value = false
    documentPendingDelete.value = undefined
    ElMessage.success('文件记录已删除，远端文件正在后台清理')
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '项目材料删除失败'
  } finally {
    deletingDocumentId.value = ''
  }
}

function clearPendingDocumentDelete(): void {
  if (!deletingDocumentId.value) documentPendingDelete.value = undefined
}

async function handlePrimaryAction(): Promise<void> {
  if (allUploaded.value) {
    await finalizeReport()
    return
  }

  await handleUpload()
}

async function handleUpload(): Promise<void> {
  if (!hasQueuedFiles.value) {
    ElMessage.warning('请先选择至少一份材料')
    return
  }

  uploading.value = true
  pageError.value = ''
  try {
    const session = await createUploadSession(
      projectId.value,
      queuedFiles.value.map(({ file }) => ({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      })),
      controller.signal,
    )

    session.files.forEach((target, index) => {
      const queued = queuedFiles.value[index]
      if (queued) queued.target = target
    })

    for (const item of queuedFiles.value) {
      await uploadOne(item)
    }

    if (allUploaded.value) await finalizeReport()
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    pageError.value = error instanceof Error ? error.message : '材料上传失败'
  } finally {
    uploading.value = false
  }
}

async function uploadOne(item: QueuedFile): Promise<void> {
  if (!item.target || item.status === 'uploaded') return
  item.status = 'uploading'
  item.error = ''
  item.progress = 0

  try {
    await uploadFileToSignedUrl(
      item.target,
      item.file,
      (progress) => {
        item.progress = progress
      },
      controller.signal,
    )
    await confirmDocumentUpload(projectId.value, item.target.documentId, controller.signal)
    item.status = 'uploaded'
    item.progress = 100
  } catch (error) {
    item.status = 'failed'
    item.error = error instanceof Error ? error.message : '上传失败'
  }
}

async function retryFile(item: QueuedFile): Promise<void> {
  if (!item.target || uploading.value || finalizing.value) return
  uploading.value = true
  try {
    await uploadOne(item)
    if (allUploaded.value) await finalizeReport()
  } finally {
    uploading.value = false
  }
}

async function finalizeReport(): Promise<void> {
  if (!allUploaded.value || finalizing.value) return
  finalizing.value = true
  pageError.value = ''
  try {
    await completeProjectUploads(projectId.value, controller.signal)
    ElMessage.success('材料上传完成，报告已生成')
    await router.push({ name: 'project-report', params: { projectId: projectId.value } })
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    pageError.value = error instanceof Error ? error.message : '报告生成失败'
  } finally {
    finalizing.value = false
  }
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(() => void loadProject())
onBeforeUnmount(() => controller.abort())
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      :title="project?.projectTitle ?? '上传项目材料'"
      description="一次选择并上传当前已有的全部材料。上传完成后，系统将立即生成 MVP Mock 报告。"
      :breadcrumbs="[
        { label: '采购项目', to: { name: 'projects' } },
        { label: project?.projectTitle ?? '材料上传' },
      ]"
    >
      <template #actions>
        <ElButton @click="$router.push({ name: 'projects' })">返回列表</ElButton>
      </template>
    </PageHeader>

    <LoadingState v-if="loadingProject" title="正在读取项目信息" :rows="4" />
    <ErrorState
      v-else-if="pageError && !project"
      title="项目信息加载失败"
      :description="pageError"
      @retry="loadProject"
    />

    <template v-else>
      <InlineNotice
        title="上传说明"
        description="支持 PDF、图片、Office、CSV、TXT、Markdown 和 JSON；单文件不超过 50 MiB，项目总大小不超过 200 MiB。压缩包请先解压。"
        tone="neutral"
      />

      <BaseCard title="项目材料" description="文件将直接上传至私有 Cloudflare R2。">
        <div v-if="hasStoredDocuments" class="project-upload__stored-section">
          <SectionHeader
            title="已保存材料"
            description="删除后将立即移除数据库记录、使已有审查结果失效，并在后台清理 R2 对象。"
          />
          <div class="project-upload__file-list project-upload__file-list--stored">
            <article
              v-for="document in project?.documents ?? []"
              :key="document.documentId"
              class="project-upload__file-row"
            >
              <div class="project-upload__file-main">
                <div class="project-upload__file-heading">
                  <strong>{{ document.fileName }}</strong>
                  <StatusTag
                    :label="uploadStatusMeta[document.uploadStatus].label"
                    :tone="uploadStatusMeta[document.uploadStatus].tone"
                  />
                </div>
                <span>{{ formatFileSize(document.sizeBytes) }}</span>
              </div>
              <div class="project-upload__file-actions">
                <ElButton
                  type="danger"
                  link
                  :icon="AppIcons.action.delete"
                  :loading="deletingDocumentId === document.documentId"
                  :disabled="uploading || finalizing"
                  @click="requestStoredDocumentDelete(document)"
                >
                  删除
                </ElButton>
              </div>
            </article>
          </div>
        </div>

        <SectionHeader
          :title="hasStoredDocuments ? '新增材料' : '选择材料'"
          description="可一次选择多份文件，不需要手工分类。"
        />

        <input
          ref="fileInput"
          class="project-upload__file-input"
          type="file"
          multiple
          :accept="acceptedExtensions"
          @change="handleFileSelection"
        />

        <button
          class="project-upload__drop-zone"
          type="button"
          :disabled="!canEditSelection"
          @click="openFilePicker"
        >
          <el-icon class="project-upload__drop-icon">
            <component :is="AppIcons.action.upload" />
          </el-icon>
          <strong>选择项目材料</strong>
          <span>可一次选择多份文件，不需要手工分类</span>
        </button>

        <div v-if="hasQueuedFiles" class="project-upload__file-list">
          <article v-for="(item, index) in queuedFiles" :key="item.key" class="project-upload__file-row">
            <div class="project-upload__file-main">
              <div class="project-upload__file-heading">
                <strong>{{ item.file.name }}</strong>
                <StatusTag
                  :label="uploadStatusMeta[item.status].label"
                  :tone="uploadStatusMeta[item.status].tone"
                />
              </div>
              <span>{{ formatFileSize(item.file.size) }}</span>
              <ElProgress
                v-if="item.status !== 'queued'"
                class="project-upload__progress"
                :percentage="item.progress"
                :status="item.status === 'failed' ? 'exception' : item.status === 'uploaded' ? 'success' : undefined"
              />
              <p v-if="item.error" class="project-upload__file-error">{{ item.error }}</p>
            </div>

            <div class="project-upload__file-actions">
              <ElButton
                v-if="item.status === 'failed'"
                type="primary"
                link
                :disabled="uploading || finalizing"
                @click="retryFile(item)"
              >
                重试
              </ElButton>
              <ElButton
                v-if="item.status === 'queued' && !item.target"
                type="danger"
                link
                :disabled="!canEditSelection"
                @click="removeFile(index)"
              >
                移除
              </ElButton>
              <ElButton
                v-else-if="item.target && item.status !== 'uploading'"
                type="danger"
                link
                :icon="AppIcons.action.delete"
                :loading="deletingDocumentId === item.target.documentId"
                :disabled="uploading || finalizing"
                @click="requestQueuedDocumentDelete(item)"
              >
                删除
              </ElButton>
            </div>
          </article>
        </div>

        <EmptyState
          v-else
          compact
          title="尚未选择材料"
          description="选择当前已有的全部材料后，点击“上传并生成报告”。"
        />

        <InlineNotice
          v-if="pageError && project"
          title="操作未完成"
          :description="pageError"
          tone="danger"
        />

        <div class="project-upload__footer">
          <span v-if="hasFailures" class="project-upload__failure-copy">
            请重试失败文件，全部上传成功后将自动生成报告。
          </span>
          <ElButton
            class="project-upload__footer-button"
            type="primary"
            :loading="uploading || finalizing"
            :disabled="!hasQueuedFiles || hasFailures"
            @click="handlePrimaryAction"
          >
            {{ finalizing ? '正在生成报告' : allUploaded ? '重新生成报告' : '上传并生成报告' }}
          </ElButton>
        </div>
      </BaseCard>
    </template>

    <ConfirmActionDialog
      v-model="deleteDialogOpen"
      title="删除项目材料"
      :description="`删除“${documentPendingDelete?.fileName ?? ''}”后，数据库记录将立即删除，R2 远端文件将在后台清理；已有审查报告也会失效。`"
      confirm-text="删除文件"
      confirm-type="danger"
      :loading="Boolean(deletingDocumentId)"
      @confirm="confirmDocumentDelete"
      @cancel="clearPendingDocumentDelete"
    />
  </div>
</template>

<style scoped>
.project-upload__stored-section {
  margin-bottom: var(--rt-space-6);
  padding-bottom: var(--rt-space-6);
  border-bottom: 1px solid var(--rt-border-subtle);
}

.project-upload__file-list--stored {
  margin-top: var(--rt-space-4);
}

.project-upload__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.project-upload__drop-zone {
  display: flex;
  width: 100%;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--rt-space-2);
  border: 1px dashed var(--rt-border-strong);
  border-radius: var(--rt-radius-lg);
  background: var(--rt-bg-subtle);
  color: var(--rt-text-secondary);
  cursor: pointer;
}

.project-upload__drop-zone:hover:not(:disabled) {
  border-color: var(--rt-color-primary-400);
  background: var(--rt-color-primary-50);
}

.project-upload__drop-zone:disabled {
  cursor: not-allowed;
  opacity: 0.66;
}

.project-upload__drop-zone strong {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-lg);
}

.project-upload__drop-zone span {
  font-size: var(--rt-font-size-sm);
}

.project-upload__drop-icon {
  color: var(--rt-color-primary-700);
  font-size: var(--rt-icon-size-state);
}

.project-upload__file-list {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-3);
  margin-top: var(--rt-space-5);
}

.project-upload__file-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rt-space-4);
  padding: var(--rt-space-4);
  border: 1px solid var(--rt-border-subtle);
  border-radius: var(--rt-radius-md);
}

.project-upload__file-main {
  min-width: 0;
  flex: 1 1 auto;
}

.project-upload__file-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-3);
}

.project-upload__file-heading strong {
  overflow: hidden;
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-upload__file-main > span {
  display: block;
  margin-top: var(--rt-space-1);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-xs);
}

.project-upload__progress {
  margin-top: var(--rt-space-3);
}

.project-upload__file-error,
.project-upload__failure-copy {
  color: var(--rt-color-danger-600);
  font-size: var(--rt-font-size-sm);
}

.project-upload__file-error {
  margin-top: var(--rt-space-2);
}

.project-upload__file-actions {
  flex: 0 0 auto;
}

.project-upload__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--rt-space-4);
  margin-top: var(--rt-space-6);
  padding-top: var(--rt-space-5);
  border-top: 1px solid var(--rt-border-subtle);
}

.project-upload__failure-copy {
  margin-right: auto;
}

@media (max-width: 640px) {
  .project-upload__file-row,
  .project-upload__file-heading,
  .project-upload__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .project-upload__footer-button {
    width: 100%;
    margin-left: 0;
  }
}
</style>
