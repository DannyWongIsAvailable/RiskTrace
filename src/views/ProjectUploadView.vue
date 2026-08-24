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
  uploadProjectMaterial,
} from '@/api/modules'
import { isApiError } from '@/api/request'
import { AppIcons } from '@/icons'
import type { ProjectDetail } from '@/types/project'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => String(route.params.projectId ?? ''))
const project = ref<ProjectDetail>()
const fileList = ref<UploadUserFile[]>([])
const uploadRef = ref<UploadInstance>()
const loading = ref(true)
const uploading = ref(false)
const loadError = ref('')
const actionError = ref('')
const controller = new AbortController()

const canUpload = computed(
  () =>
    !project.value?.review &&
    (project.value?.status === 'draft' || project.value?.status === 'uploading'),
)

async function loadPage(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const result = await getProject(projectId.value, controller.signal)
    if (result.review) {
      await router.replace({ name: 'project-review', params: { projectId: projectId.value } })
      return
    }
    project.value = result
  } catch (error) {
    if (isCancelled(error)) return
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
          await confirmDocumentUpload(projectId.value, target.documentId, controller.signal)
          item.status = 'success'
          item.percentage = 100
        } catch (error) {
          item.status = 'fail'
          throw error
        }
      }),
    )

    const submitted = await completeProjectUploads(projectId.value, controller.signal)
    uploadRef.value?.clearFiles()
    fileList.value = []

    if (submitted.status === 'failed') {
      ElMessage.warning('材料已上传，合规审查启动后返回失败，请查看执行过程')
    } else if (submitted.status === 'completed') {
      ElMessage.success('材料已上传，合规审查已完成')
    } else {
      ElMessage.success('材料已上传，DeepSeek Harness 已开始执行合规审查')
    }

    await router.replace({ name: 'project-review', params: { projectId: projectId.value } })
  } catch (error) {
    if (isCancelled(error)) return
    actionError.value = error instanceof Error ? error.message : '材料上传或合规审查启动失败'

    try {
      const latestProject = await getProject(projectId.value, controller.signal)
      project.value = latestProject
      if (latestProject.review) {
        await router.replace({ name: 'project-review', params: { projectId: projectId.value } })
      }
    } catch {
      // Preserve the original action error.
    }
  } finally {
    uploading.value = false
  }
}

function isCancelled(error: unknown): boolean {
  return isApiError(error) && error.code === 'REQUEST_CANCELLED'
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(() => void loadPage())
onBeforeUnmount(() => controller.abort())
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      :title="project?.projectTitle ?? '上传项目材料'"
      description="选择并上传采购项目材料；提交后将进入独立的执行过程页面持续查看 DeepSeek Harness 工作轨迹。"
      :breadcrumbs="[
        { label: '采购项目', to: { name: 'projects' } },
        { label: '上传项目材料' },
      ]"
    >
      <template #actions>
        <el-button @click="$router.push({ name: 'projects' })">返回项目列表</el-button>
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
        v-if="actionError"
        title="上传提示"
        :description="actionError"
        tone="warning"
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
          <el-icon class="project-upload__upload-icon">
            <component :is="AppIcons.action.upload" />
          </el-icon>
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
            上传全部材料并开始审查
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
              :label="
                document.uploadStatus === 'uploaded'
                  ? '已上传'
                  : document.uploadStatus === 'failed'
                    ? '上传失败'
                    : '待确认'
              "
              :tone="
                document.uploadStatus === 'uploaded'
                  ? 'success'
                  : document.uploadStatus === 'failed'
                    ? 'danger'
                    : 'warning'
              "
            />
          </div>
        </div>
      </BaseCard>
    </template>
  </div>
</template>

<style scoped>
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
  .project-upload__action-button {
    width: 100%;
  }
}
</style>
