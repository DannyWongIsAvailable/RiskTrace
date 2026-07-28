<script setup lang="ts">
import type { Component } from 'vue'

type IconButtonType = 'primary' | 'success' | 'warning' | 'danger' | 'info'
type IconButtonSize = 'small' | 'default' | 'large'
type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type TooltipPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end'

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

withDefaults(
  defineProps<{
    icon: Component
    label: string
    type?: IconButtonType
    size?: IconButtonSize
    iconSize?: IconSize
    plain?: boolean
    circle?: boolean
    disabled?: boolean
    loading?: boolean
    nativeType?: 'button' | 'submit' | 'reset'
    tooltipPlacement?: TooltipPlacement
    showTooltip?: boolean
    teleported?: boolean
  }>(),
  {
    type: undefined,
    size: 'default',
    iconSize: 'sm',
    plain: false,
    circle: true,
    disabled: false,
    loading: false,
    nativeType: 'button',
    tooltipPlacement: 'top',
    showTooltip: true,
    teleported: true,
  },
)
</script>

<template>
  <el-tooltip
    :content="label"
    :placement="tooltipPlacement"
    :disabled="!showTooltip"
    :teleported="teleported"
  >
    <span class="icon-button__trigger">
      <el-button
        :type="type"
        :size="size"
        :plain="plain"
        :circle="circle"
        :disabled="disabled"
        :loading="loading"
        :native-type="nativeType"
        :aria-label="label"
        @click="emit('click', $event)"
      >
        <el-icon
          v-if="!loading"
          class="icon-button__icon"
          :class="`icon-button__icon--${iconSize}`"
          aria-hidden="true"
        >
          <component :is="icon" />
        </el-icon>
      </el-button>
    </span>
  </el-tooltip>
</template>

<style scoped>
.icon-button__trigger {
  display: inline-flex;
  vertical-align: middle;
}

.icon-button__icon {
  color: currentColor;
}

.icon-button__icon--xs {
  font-size: var(--rt-icon-size-xs);
}

.icon-button__icon--sm {
  font-size: var(--rt-icon-size-sm);
}

.icon-button__icon--md {
  font-size: var(--rt-icon-size-md);
}

.icon-button__icon--lg {
  font-size: var(--rt-icon-size-lg);
}

.icon-button__icon--xl {
  font-size: var(--rt-icon-size-xl);
}
</style>
