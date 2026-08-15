<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { createProject } from '@/api/modules'
import { isApiError } from '@/api/request'

const router = useRouter()
const formRef = ref<FormInstance>()
const form = reactive({ projectTitle: '' })
const submitting = ref(false)
const submitError = ref('')
const controller = new AbortController()

const rules: FormRules<typeof form> = {
  projectTitle: [
    { required: true, message: '请输入采购项目标题', trigger: 'blur' },
    { min: 2, max: 120, message: '项目标题长度应为 2 到 120 个字符', trigger: 'blur' },
  ],
}

async function handleSubmit(): Promise<void> {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  submitError.value = ''
  try {
    const project = await createProject(
      { projectTitle: form.projectTitle.trim() },
      controller.signal,
    )
    ElMessage.success('采购项目已创建，请上传全部已有材料')
    await router.push({ name: 'project-upload', params: { projectId: project.projectId } })
  } catch (error) {
    if (isApiError(error) && error.code === 'REQUEST_CANCELLED') return
    submitError.value = error instanceof Error ? error.message : '采购项目创建失败'
  } finally {
    submitting.value = false
  }
}

onBeforeUnmount(() => controller.abort())
</script>

<template>
  <div class="rt-page rt-page-stack">
    <PageHeader
      title="新建采购项目"
      description="填写采购项目标题后，在下一步一次性上传当前已有材料。"
      :breadcrumbs="[
        { label: '采购项目', to: { name: 'projects' } },
        { label: '新建采购项目' },
      ]"
    />

    <InlineNotice
      title="自动审查流程"
      description="上传完成后，系统会自动完成材料理解、领域审查和报告生成。"
      tone="primary"
    />

    <BaseCard title="项目基本信息" description="项目标题由用户填写，自动审查过程不会修改。">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="采购项目标题" prop="projectTitle">
          <el-input
            v-model="form.projectTitle"
            maxlength="120"
            show-word-limit
            clearable
            placeholder="例如：海岳精密设备采购付款审查"
            :disabled="submitting"
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <InlineNotice
          v-if="submitError"
          title="项目创建失败"
          :description="submitError"
          tone="danger"
        />

        <div class="project-create__actions">
          <el-button
            class="project-create__action-button"
            :disabled="submitting"
            @click="$router.push({ name: 'projects' })"
          >
            返回项目列表
          </el-button>
          <el-button
            class="project-create__action-button"
            type="primary"
            native-type="submit"
            :loading="submitting"
          >
            创建并上传材料
          </el-button>
        </div>
      </el-form>
    </BaseCard>
  </div>
</template>

<style scoped>
.project-create__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--rt-space-3);
  margin-top: var(--rt-space-5);
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
