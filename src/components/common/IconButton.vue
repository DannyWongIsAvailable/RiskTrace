<script setup lang="ts">
import type { Component } from 'vue'

type IconButtonType = 'primary' | 'success' | 'warning' | 'danger' | 'info'
type IconButtonSize = 'small' | 'default' | 'large'
type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const iconSizeStyles: Record<IconSize, { fontSize: string }> = {
  xs: { fontSize: 'var(--rt-icon-size-xs)' },
  sm: { fontSize: 'var(--rt-icon-size-sm)' },
  md: { fontSize: 'var(--rt-icon-size-md)' },
  lg: { fontSize: 'var(--rt-icon-size-lg)' },
  xl: { fontSize: 'var(--rt-icon-size-xl)' },
}

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

withDefaults(
  defineProps<{
    icon: Component
    type?: IconButtonType
    size?: IconButtonSize
    iconSize?: IconSize
    plain?: boolean
    circle?: boolean
    disabled?: boolean
    loading?: boolean
    nativeType?: 'button' | 'submit' | 'reset'
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
  },
)
</script>

<template>
  <el-button
    :type="type"
    :size="size"
    :plain="plain"
    :circle="circle"
    :disabled="disabled"
    :loading="loading"
    :native-type="nativeType"
    @click="emit('click', $event)"
  >
    <el-icon v-if="!loading" class="icon-button__icon" :style="iconSizeStyles[iconSize]">
      <component :is="icon" />
    </el-icon>
  </el-button>
</template>

<style scoped>
.icon-button__icon {
  color: currentColor;
}
</style>
