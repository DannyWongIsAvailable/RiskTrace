<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import HarnessTurnGroup from './HarnessTurnGroup.vue'
import type { ReviewActivity, ReviewTurnBoundary } from '@/types/review-activity'

const props = defineProps<{ turns: ReviewTurnBoundary[]; activities: ReviewActivity[] }>()
const emit = defineEmits<{ select: [activity: ReviewActivity] }>()
const container = ref<HTMLElement>()
const autoFollow = ref(true)
const unseenCount = ref(0)

function turnActivities(turn: number): ReviewActivity[] {
  return props.activities.filter((activity) => activity.turn === turn)
}

function handleScroll(): void {
  const element = container.value
  if (!element) return
  const nearTail = element.scrollHeight - element.scrollTop - element.clientHeight < 80
  autoFollow.value = nearTail
  if (nearTail) unseenCount.value = 0
}

async function scrollToTail(): Promise<void> {
  autoFollow.value = true
  unseenCount.value = 0
  await nextTick()
  const element = container.value
  if (element) element.scrollTop = element.scrollHeight
}

watch(
  () => props.activities.length,
  async (next, previous) => {
    if (next <= previous) return
    if (!autoFollow.value) {
      unseenCount.value += next - previous
      return
    }
    await scrollToTail()
  },
)
</script>

<template>
  <div class="harness-list-wrap">
    <div ref="container" class="harness-list" @scroll.passive="handleScroll">
      <HarnessTurnGroup
        v-for="turn in props.turns"
        :key="turn.turn"
        :turn="turn"
        :activities="turnActivities(turn.turn)"
        @select="emit('select', $event)"
      />
      <div v-if="props.turns.length === 0" class="harness-list__empty">
        Harness 正在运行，暂未产生新的可展示活动
      </div>
    </div>
    <button v-if="unseenCount > 0" type="button" class="harness-list__new" @click="scrollToTail">
      有 {{ unseenCount }} 条新活动 · 回到最新
    </button>
  </div>
</template>

<style scoped>
.harness-list-wrap { position: relative; min-width: 0; }
.harness-list { max-height: 560px; overflow-y: auto; padding: var(--rt-space-4) var(--rt-space-2) var(--rt-space-4) 0; overscroll-behavior: contain; }
.harness-list__empty { padding: var(--rt-space-8) var(--rt-space-4); color: var(--rt-text-tertiary); text-align: center; font-size: var(--rt-font-size-sm); }
.harness-list__new { position: sticky; bottom: var(--rt-space-2); display: block; margin: calc(-1 * var(--rt-space-8)) auto var(--rt-space-2); padding: var(--rt-space-2) var(--rt-space-3); border: 1px solid var(--rt-color-primary-300); border-radius: var(--rt-radius-md); background: var(--rt-bg-panel); color: var(--rt-color-primary-700); cursor: pointer; }
.harness-list__new:focus-visible { outline: 2px solid var(--rt-color-primary-500); outline-offset: 2px; }
</style>
