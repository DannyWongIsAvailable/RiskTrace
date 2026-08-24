<script setup lang="ts">
import { computed } from 'vue'
import { AppIcons } from '@/icons'
import type { ReviewTodoItem } from '@/types/review-activity'

const props = defineProps<{ todos: ReviewTodoItem[] }>()
const statusText = (status: ReviewTodoItem['status']) =>
  status === 'completed' ? '已完成' : status === 'in_progress' ? '进行中' : '待处理'
const statusIcon = computed(() => AppIcons.status.success)
</script>

<template>
  <section v-if="props.todos.length" class="harness-todo" aria-label="审查计划">
    <h3>审查计划</h3>
    <div class="harness-todo__list">
      <div v-for="(todo, index) in props.todos" :key="`${index}:${todo.content}`" class="harness-todo__item">
        <el-icon v-if="todo.status === 'completed'" class="harness-todo__icon is-completed"><component :is="statusIcon" /></el-icon>
        <span v-else class="harness-todo__marker" :class="`is-${todo.status}`" aria-hidden="true" />
        <div class="harness-todo__content"><strong>{{ statusText(todo.status) }}</strong><span>{{ todo.content }}</span></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.harness-todo { padding: var(--rt-space-5) 0; border-bottom: 1px solid var(--rt-border-subtle); }
.harness-todo h3 { margin: 0 0 var(--rt-space-3); color: var(--rt-text-primary); font-size: var(--rt-font-size-sm); }
.harness-todo__list { display: grid; gap: var(--rt-space-2); }
.harness-todo__item { display: grid; grid-template-columns: 20px minmax(0,1fr); align-items: start; gap: var(--rt-space-2); }
.harness-todo__icon { margin-top: 2px; color: var(--rt-color-success-600); }
.harness-todo__marker { width: 8px; height: 8px; margin: 6px; border-radius: 50%; background: var(--rt-border-strong); }
.harness-todo__marker.is-in_progress { background: var(--rt-color-primary-600); }
.harness-todo__content { display: flex; gap: var(--rt-space-3); min-width: 0; }
.harness-todo__content strong { flex: 0 0 52px; color: var(--rt-text-secondary); font-size: var(--rt-font-size-xs); }
.harness-todo__content span { color: var(--rt-text-primary); font-size: var(--rt-font-size-sm); overflow-wrap: anywhere; }
@media (max-width: 600px) { .harness-todo__content { flex-direction: column; gap: 2px; } }
</style>
