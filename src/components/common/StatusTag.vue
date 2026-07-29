<script setup lang="ts">
import { computed } from 'vue'

import type { StatusTone } from '@/types/ui'

type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger'

const props = withDefaults(
  defineProps<{
    label: string
    tone?: StatusTone
    dot?: boolean
    size?: 'small' | 'default' | 'large'
    effect?: 'dark' | 'light' | 'plain'
    round?: boolean
  }>(),
  {
    tone: 'neutral',
    dot: true,
    size: 'small',
    effect: 'light',
    round: true,
  },
)

const tagType = computed<TagType>(() => (props.tone === 'neutral' ? 'info' : props.tone))
</script>

<template>
  <el-tag
    class="status-tag"
    :type="tagType"
    :size="size"
    :effect="effect"
    :round="round"
    disable-transitions
  >
    <span v-if="dot" class="status-tag__dot" />
    <span>{{ label }}</span>
  </el-tag>
</template>

<style scoped>
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--rt-space-2);
  font-weight: 700;
}

.status-tag__dot {
  width: var(--rt-space-1);
  height: var(--rt-space-1);
  flex: 0 0 auto;
  border-radius: var(--rt-radius-round);
  background: currentColor;
}
</style>
