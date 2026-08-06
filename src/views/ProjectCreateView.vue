<script setup lang="ts">
import { ElButton, ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { createProject } from '@/api/modules'
import { isApiError } from '@/api/request'

interface ProjectForm {
  projectTitle: string
}

const router = useRouter()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const submitError = ref('')
const form = reactive<ProjectForm>({ projectTitle: '' })
const rules: FormRules<ProjectForm> = {
  projectTitle: [
    { required: true, message: '请输入项目标题', trigger: 'blur' },
    { min: 2, max: 120, message: '项目标题长度应为 2–120 个字符', trigger: 'blur' },
  ],
}

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  submitError.value = ''
  try {
    const project = await createProject({ projectTitle: form.projectTitle.trim() })
    ElMessage.success('采购项目已创建')
    await router.push({ name: 'project-upload', params: { projectId: project.projectId } })
  } catch (error) {
    submitError.value = isApiError(error) ? error.message : '项目创建失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="rt-page rt-page-stack project-create">
    <PageHeader
      title="新建采购项目"
      description="当前 MVP 只需要填写项目标题。创建后进入材料上传步骤。"
      :breadcrumbs="[
        { label: '采购项目', to: { name: 'projects' } },
        { label: '新建项目' },
      ]"
    />

    <BaseCard class="project-create__card" title="项目信息" description="请使用能够清晰识别本次采购事项的标题。">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="handleSubmit">
        <el-form-item label="项目标题" prop="projectTitle">
          <el-input
            v-model="form.projectTitle"
            maxlength="120"
            show-word-limit
            clearable
            placeholder="例如：海岳精密设备采购付款审查"
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <InlineNotice
          v-if="submitError"
          title="创建失败"
          :description="submitError"
          tone="danger"
        />

        <div class="project-create__actions">
          <ElButton
            class="project-create__action-button"
            :disabled="submitting"
            @click="$router.push({ name: 'projects' })"
          >
            取消
          </ElButton>
          <ElButton
            class="project-create__action-button"
            type="primary"
            :loading="submitting"
            @click="handleSubmit"
          >
            创建并上传材料
          </ElButton>
        </div>
      </el-form>
    </BaseCard>
  </div>
</template>

<style scoped>
.project-create__card {
  width: min(720px, 100%);
}

.project-create__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--rt-space-3);
  margin-top: var(--rt-space-6);
  padding-top: var(--rt-space-5);
  border-top: 1px solid var(--rt-border-subtle);
}

@media (max-width: 640px) {
  .project-create__actions {
    flex-direction: column-reverse;
  }

  .project-create__action-button {
    width: 100%;
    margin-left: 0;
  }
}
</style>
