<script setup lang="ts">
import { ref, watch } from 'vue'

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

const reason = ref('')
const validationMessage = ref('')

function closeDialog(): void {
  model.value = false
  emit('cancel')
}

function confirmAction(): void {
  const normalizedReason = reason.value.trim()

  if (props.requireReason && !normalizedReason) {
    validationMessage.value = '请填写处理说明'
    return
  }

  validationMessage.value = ''
  emit('confirm', normalizedReason)
}

watch(model, (visible) => {
  if (!visible) {
    reason.value = ''
    validationMessage.value = ''
  }
})
</script>

<template>
  <el-dialog
    v-model="model"
    :title="title"
    width="min(92vw, 520px)"
    :close-on-click-modal="!loading"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    destroy-on-close
  >
    <p v-if="description" class="confirm-action-dialog__description">{{ description }}</p>

    <el-form v-if="requireReason" label-position="top" class="confirm-action-dialog__form">
      <el-form-item :label="reasonLabel" :error="validationMessage" required>
        <el-input
          v-model="reason"
          type="textarea"
          :rows="4"
          :placeholder="reasonPlaceholder"
          maxlength="500"
          show-word-limit
          :disabled="loading"
          @input="validationMessage = ''"
        />
      </el-form-item>
    </el-form>

    <slot />

    <template #footer>
      <div class="confirm-action-dialog__footer">
        <el-button :disabled="loading" @click="closeDialog">{{ cancelText }}</el-button>
        <el-button :type="confirmType" :loading="loading" @click="confirmAction">
          {{ confirmText }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.confirm-action-dialog__description {
  color: var(--rt-text-secondary);
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
