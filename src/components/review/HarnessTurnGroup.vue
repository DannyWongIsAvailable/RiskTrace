<script setup lang="ts">
import { computed } from 'vue'
import HarnessAssistantActivity from './HarnessAssistantActivity.vue'
import HarnessErrorActivity from './HarnessErrorActivity.vue'
import HarnessToolActivity from './HarnessToolActivity.vue'
import type { ReviewActivity, ReviewTurnBoundary } from '@/types/review-activity'

const props = defineProps<{ turn: ReviewTurnBoundary; activities: ReviewActivity[] }>()
const emit = defineEmits<{ select: [activity: ReviewActivity] }>()

const grouped = computed(() => {
  const stepNumbers = new Set<number>()
  props.turn.steps.forEach((step) => stepNumbers.add(step.step))
  props.activities.forEach((activity) => {
    if (activity.step !== null) stepNumbers.add(activity.step)
  })
  return [...stepNumbers].sort((a, b) => a - b).map((step) => ({
    step,
    activities: props.activities.filter((activity) => activity.step === step),
  }))
})

const unscoped = computed(() => props.activities.filter((activity) => activity.step === null))
</script>

<template>
  <section class="harness-turn">
    <header class="harness-turn__header">
      <strong>Turn {{ props.turn.turn }}</strong>
      <span>{{ props.turn.status === 'running' ? '进行中' : props.turn.status === 'completed' ? '已完成' : props.turn.status === 'failed' ? '失败' : '已中断' }}</span>
    </header>

    <div v-for="group in grouped" :key="group.step" class="harness-turn__step">
      <div class="harness-turn__step-label">Step {{ group.step }}</div>
      <template v-for="activity in group.activities" :key="activity.id">
        <HarnessAssistantActivity v-if="activity.kind === 'assistant'" :activity="activity" @select="emit('select', activity)" />
        <HarnessToolActivity v-else-if="activity.kind === 'tool'" :activity="activity" @select="emit('select', activity)" />
        <HarnessErrorActivity v-else-if="activity.kind === 'error'" :activity="activity" @select="emit('select', activity)" />
      </template>
      <p v-if="group.activities.length === 0" class="harness-turn__empty">该 Step 暂无可公开展示的活动</p>
    </div>

    <template v-for="activity in unscoped" :key="activity.id">
      <HarnessAssistantActivity v-if="activity.kind === 'assistant'" :activity="activity" @select="emit('select', activity)" />
      <HarnessToolActivity v-else-if="activity.kind === 'tool'" :activity="activity" @select="emit('select', activity)" />
      <HarnessErrorActivity v-else-if="activity.kind === 'error'" :activity="activity" @select="emit('select', activity)" />
    </template>
  </section>
</template>

<style scoped>
.harness-turn + .harness-turn { margin-top: var(--rt-space-6); }
.harness-turn__header { display: flex; align-items: center; justify-content: space-between; gap: var(--rt-space-3); padding-bottom: var(--rt-space-2); border-bottom: 1px solid var(--rt-border-strong); }
.harness-turn__header strong { color: var(--rt-text-primary); font-size: var(--rt-font-size-sm); }
.harness-turn__header span, .harness-turn__step-label, .harness-turn__empty { color: var(--rt-text-tertiary); font-size: var(--rt-font-size-xs); }
.harness-turn__step { margin-top: var(--rt-space-3); }
.harness-turn__step-label { padding: var(--rt-space-1) 0; font-weight: 600; }
.harness-turn__empty { margin: var(--rt-space-2) 0 0; }
</style>
