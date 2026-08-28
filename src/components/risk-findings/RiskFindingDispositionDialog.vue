<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'

import type {
  RiskFinding,
  RiskFindingDispositionSubmission,
} from '@/types/risk-finding'

const props = defineProps<{
  modelValue: boolean
  finding?: RiskFinding
  submitting?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [submission: RiskFindingDispositionSubmission]
}>()

const MAX_FILES = 5
const MAX_FILE_SIZE = 20 * 1024 * 1024
const fileInput = ref<HTMLInputElement>()
const selectedFiles = ref<File[]>([])
const form = reactive({
  dispositionMethod: '',
  responsiblePerson: '',
  rectificationMeasures: '',
  rectificationDescription: '',
  rectifiedAt: '',
})

const existingAttachmentCount = computed(() => props.finding?.attachments.length ?? 0)
const remainingSlots = computed(() => Math.max(0, MAX_FILES - existingAttachmentCount.value))
const canSubmit = computed(
  () =>
    form.dispositionMethod.trim().length >= 2 &&
    form.responsiblePerson.trim().length >= 1 &&
    form.rectificationMeasures.trim().length >= 2 &&
    form.rectificationDescription.trim().length >= 2 &&
    Boolean(form.rectifiedAt) &&
    existingAttachmentCount.value + selectedFiles.value.length > 0,
)

watch(
  () => [props.modelValue, props.finding?.findingId] as const,
  ([open]) => {
    if (!open) return
    form.dispositionMethod = ''
    form.responsiblePerson = ''
    form.rectificationMeasures = ''
    form.rectificationDescription = ''
    form.rectifiedAt = ''
    selectedFiles.value = []
    if (fileInput.value) fileInput.value.value = ''
  },
)

function chooseFiles(): void {
  if (remainingSlots.value <= 0) {
    ElMessage.warning(`每个风险事项最多上传 ${MAX_FILES} 份证明材料`)
    return
  }
  fileInput.value?.click()
}

function handleFileSelection(event: Event): void {
  const target = event.target as HTMLInputElement
  const incoming = Array.from(target.files ?? [])
  target.value = ''
  if (incoming.length === 0) return

  const next = [...selectedFiles.value]
  for (const file of incoming) {
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      ElMessage.warning(`${file.name} 大小无效或超过 20 MB`)
      continue
    }
    if (next.some((item) => item.name === file.name && item.size === file.size)) continue
    if (existingAttachmentCount.value + next.length >= MAX_FILES) {
      ElMessage.warning(`每个风险事项最多上传 ${MAX_FILES} 份证明材料`)
      break
    }
    next.push(file)
  }
  selectedFiles.value = next
}

function removeFile(index: number): void {
  selectedFiles.value = selectedFiles.value.filter((_, itemIndex) => itemIndex !== index)
}

function submit(): void {
  if (!canSubmit.value || props.submitting) {
    ElMessage.warning('请完整填写处置与整改信息，并至少上传一份证明材料')
    return
  }

  const parsedDate = new Date(form.rectifiedAt)
  if (Number.isNaN(parsedDate.getTime())) {
    ElMessage.warning('整改完成时间格式无效')
    return
  }

  emit('submit', {
    input: {
      dispositionMethod: form.dispositionMethod.trim(),
      responsiblePerson: form.responsiblePerson.trim(),
      rectificationMeasures: form.rectificationMeasures.trim(),
      rectificationDescription: form.rectificationDescription.trim(),
      rectifiedAt: parsedDate.toISOString(),
    },
    files: [...selectedFiles.value],
  })
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="处置与整改"
    width="min(720px, 92vw)"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="finding" class="risk-disposition-dialog">
      <InlineNotice
        title="风险事项"
        :description="`${finding.projectTitle} · ${finding.title}`"
        tone="neutral"
      />

      <el-form label-position="top" class="risk-disposition-dialog__form">
        <el-form-item label="处置方式" required>
          <el-input
            v-model="form.dispositionMethod"
            maxlength="200"
            show-word-limit
            placeholder="例如：暂停付款并要求补充履约材料"
            :disabled="submitting"
          />
        </el-form-item>

        <div class="risk-disposition-dialog__two-column">
          <el-form-item label="责任人" required>
            <el-input
              v-model="form.responsiblePerson"
              maxlength="80"
              placeholder="填写责任人姓名或岗位"
              :disabled="submitting"
            />
          </el-form-item>
          <el-form-item label="整改完成时间" required>
            <el-date-picker
              v-model="form.rectifiedAt"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm:ss"
              format="YYYY-MM-DD HH:mm"
              placeholder="选择实际整改完成时间"
              :disabled="submitting"
            />
          </el-form-item>
        </div>

        <el-form-item label="整改措施" required>
          <el-input
            v-model="form.rectificationMeasures"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
            placeholder="填写已经采取的整改措施"
            :disabled="submitting"
          />
        </el-form-item>

        <el-form-item label="整改说明" required>
          <el-input
            v-model="form.rectificationDescription"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
            placeholder="说明整改结果、补充事实或其他必要信息"
            :disabled="submitting"
          />
        </el-form-item>

        <el-form-item label="证明材料" required>
          <div class="risk-disposition-dialog__upload-area">
            <input
              ref="fileInput"
              class="risk-disposition-dialog__file-input"
              type="file"
              multiple
              :disabled="submitting"
              @change="handleFileSelection"
            />
            <div class="risk-disposition-dialog__upload-actions">
              <el-button
                :disabled="submitting || remainingSlots <= 0"
                @click="chooseFiles"
              >
                选择证明材料
              </el-button>
              <span class="rt-muted">最多 5 份，单文件不超过 20 MB。MVP 仅保存文件，不校验材料内容。</span>
            </div>

            <div
              v-if="finding.attachments.length || selectedFiles.length"
              class="risk-disposition-dialog__file-list"
            >
              <div
                v-for="attachment in finding.attachments"
                :key="attachment.attachmentId"
                class="risk-disposition-dialog__file-row"
              >
                <span>{{ attachment.fileName }}</span>
                <StatusTag label="已上传" tone="success" :dot="false" />
              </div>
              <div
                v-for="(file, index) in selectedFiles"
                :key="`${file.name}-${file.size}-${index}`"
                class="risk-disposition-dialog__file-row"
              >
                <span>{{ file.name }}</span>
                <el-button link type="danger" :disabled="submitting" @click="removeFile(index)">
                  移除
                </el-button>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button :disabled="submitting" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">
        提交并完成
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.risk-disposition-dialog__form {
  margin-top: var(--rt-space-5);
}

.risk-disposition-dialog__two-column {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--rt-space-4);
}

.risk-disposition-dialog__two-column :deep(.el-date-editor) {
  width: 100%;
}

.risk-disposition-dialog__upload-area {
  width: 100%;
}

.risk-disposition-dialog__file-input {
  display: none;
}

.risk-disposition-dialog__upload-actions {
  display: flex;
  align-items: center;
  gap: var(--rt-space-3);
}

.risk-disposition-dialog__file-list {
  display: flex;
  flex-direction: column;
  gap: var(--rt-space-2);
  margin-top: var(--rt-space-3);
}

.risk-disposition-dialog__file-row {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-3);
  padding: var(--rt-space-2) var(--rt-space-3);
  border: 1px solid var(--rt-border-subtle);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-bg-subtle);
}

.risk-disposition-dialog__file-row span:first-child {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 680px) {
  .risk-disposition-dialog__two-column {
    grid-template-columns: 1fr;
  }

  .risk-disposition-dialog__upload-actions {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
