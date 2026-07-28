<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { reactive, ref } from 'vue'

const model = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  confirm: [reason: string]
  cancel: []
}>()

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmText?: string
    cancelText?: string
    confirmType?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
    loading?: boolean
    requireReason?: boolean
    reasonLabel?: string
    reasonPlaceholder?: string
  }>(),
  {
    description: undefined,
    confirmText: '确认',
    cancelText: '取消',
    confirmType: 'primary',
    loading: false,
    requireReason: false,
    reasonLabel: '处理说明',
    reasonPlaceholder: '请输入本次操作的业务依据或处理说明',
  },
)

interface ReasonFormModel {
  reason: string
}

const formRef = ref<FormInstance>()
const formModel = reactive<ReasonFormModel>({
  reason: '',
})

const formRules: FormRules<typeof formModel> = {
  reason: [
    {
      required: true,
      message: '请填写处理说明',
      trigger: ['blur', 'change'],
    },
  ],
}

function resetForm(): void {
  formModel.reason = ''
  formRef.value?.clearValidate()
}

function handleCancel(): void {
  if (props.loading) {
    return
  }

  model.value = false
  emit('cancel')
}

function handleBeforeClose(done: () => void): void {
  if (props.loading) {
    return
  }

  emit('cancel')
  done()
}

async function handleConfirm(): Promise<void> {
  if (props.requireReason) {
    try {
      await formRef.value?.validate()
    } catch {
      return
    }
  }

  emit('confirm', formModel.reason.trim())
}
</script>

<template>
  <el-dialog
    v-model="model"
    :title="title"
    width="min(92vw, 520px)"
    :before-close="handleBeforeClose"
    :close-on-click-modal="!loading"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    destroy-on-close
    @closed="resetForm"
  >
    <p v-if="description" class="confirm-action-dialog__description">{{ description }}</p>

    <el-form
      v-if="requireReason"
      ref="formRef"
      :model="formModel"
      :rules="formRules"
      label-position="top"
      class="confirm-action-dialog__form"
    >
      <el-form-item :label="reasonLabel" prop="reason" required>
        <el-input
          v-model="formModel.reason"
          type="textarea"
          :rows="4"
          :placeholder="reasonPlaceholder"
          maxlength="500"
          show-word-limit
          :disabled="loading"
        />
      </el-form-item>
    </el-form>

    <slot />

    <template #footer>
      <div class="confirm-action-dialog__footer">
        <el-button :disabled="loading" @click="handleCancel">{{ cancelText }}</el-button>
        <el-button :type="confirmType" :loading="loading" @click="handleConfirm">
          {{ confirmText }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.confirm-action-dialog__description {
  color: var(--el-text-color-regular);
  font-size: var(--rt-font-size-sm);
}

.confirm-action-dialog__form {
  margin-top: var(--rt-space-5);
}

.confirm-action-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--rt-space-2);
}
</style>
