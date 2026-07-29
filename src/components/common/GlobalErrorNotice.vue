<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { subscribeToErrors, type ObservabilityEvent } from '@/observability'

const TRANSITION_DURATION_MS = 160
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const currentError = ref<ObservabilityEvent | null>(null)
let unsubscribe: (() => void) | undefined

function dismiss(): void {
  currentError.value = null
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function runTransition(element: Element, keyframes: Keyframe[], done: () => void): void {
  if (!(element instanceof HTMLElement) || prefersReducedMotion()) {
    done()
    return
  }

  const animation = element.animate(keyframes, {
    duration: TRANSITION_DURATION_MS,
    easing: 'ease',
    fill: 'both',
  })

  let completed = false
  const complete = (): void => {
    if (completed) return
    completed = true
    done()
  }

  animation.addEventListener('finish', complete, { once: true })
  animation.addEventListener('cancel', complete, { once: true })
}

function enterNotice(element: Element, done: () => void): void {
  runTransition(
    element,
    [
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    done,
  )
}

function leaveNotice(element: Element, done: () => void): void {
  runTransition(
    element,
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(12px)' },
    ],
    done,
  )
}

onMounted(() => {
  unsubscribe = subscribeToErrors((event) => {
    if (event.userVisible) {
      currentError.value = event
    }
  })
})

onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <Transition :css="false" @enter="enterNotice" @leave="leaveNotice">
    <div v-if="currentError" class="global-error-notice" role="alert" aria-live="assertive">
      <div class="global-error-notice__copy">
        <strong>系统发生未预期异常</strong>
        <span>错误编号：{{ currentError.id }}</span>
      </div>
      <button type="button" class="global-error-notice__close" @click="dismiss">关闭</button>
    </div>
  </Transition>
</template>

<style scoped>
.global-error-notice {
  position: fixed;
  z-index: calc(var(--rt-z-overlay) + 10);
  right: var(--rt-space-5);
  bottom: var(--rt-space-5);
  display: flex;
  width: min(440px, calc(100vw - var(--rt-space-8)));
  align-items: center;
  justify-content: space-between;
  gap: var(--rt-space-4);
  padding: var(--rt-space-4);
  border: 1px solid var(--rt-color-danger-200);
  border-radius: var(--rt-radius-lg);
  background: var(--rt-color-danger-50);
  box-shadow: var(--rt-shadow-lg);
  color: var(--rt-color-danger-800);
}

.global-error-notice__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--rt-space-1);
}

.global-error-notice__copy strong {
  font-size: var(--rt-font-size-sm);
}

.global-error-notice__copy span {
  overflow: hidden;
  font-size: var(--rt-font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-error-notice__close {
  flex: 0 0 auto;
  padding: var(--rt-space-2) var(--rt-space-3);
  border-radius: var(--rt-radius-md);
  background: var(--rt-color-danger-600);
  color: var(--rt-text-inverse);
  cursor: pointer;
  font-size: var(--rt-font-size-xs);
  font-weight: 700;
}
</style>
