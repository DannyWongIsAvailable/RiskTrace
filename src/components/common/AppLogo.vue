<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean
    inverse?: boolean
  }>(),
  {
    compact: false,
    inverse: false,
  },
)
</script>

<template>
  <RouterLink
    class="app-logo"
    :class="{ 'app-logo--inverse': inverse }"
    to="/dashboard"
    :aria-label="compact ? 'RiskTrace 首页' : undefined"
  >
    <img
      class="app-logo__mark"
      src="/brand/risktrace-mark.svg"
      width="36"
      height="36"
      alt=""
      aria-hidden="true"
    />
    <span v-if="!compact" class="app-logo__copy">
      <strong class="app-logo__name">RiskTrace</strong>
      <span class="app-logo__descriptor">合规风控平台</span>
    </span>
  </RouterLink>
</template>

<style scoped>
.app-logo {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: var(--rt-space-3);
  color: var(--rt-text-primary);
}

.app-logo__mark {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
}

.app-logo__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: 1.15;
}

.app-logo__name {
  overflow: hidden;
  font-size: 17px;
  font-weight: 760;
  letter-spacing: -0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-logo__descriptor {
  margin-top: 4px;
  color: var(--rt-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.app-logo--inverse {
  color: var(--rt-text-inverse);
}

.app-logo--inverse .app-logo__descriptor {
  color: var(--rt-text-inverse-muted);
}
</style>
