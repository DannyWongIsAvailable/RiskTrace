<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
    padding?: 'none' | 'sm' | 'md' | 'lg'
    bordered?: boolean
    interactive?: boolean
  }>(),
  {
    title: undefined,
    description: undefined,
    padding: 'md',
    bordered: true,
    interactive: false,
  },
)
</script>

<template>
  <section
    class="base-card"
    :class="[
      `base-card--padding-${padding}`,
      {
        'base-card--borderless': !bordered,
        'base-card--interactive': interactive,
      },
    ]"
  >
    <header v-if="title || description || $slots.header || $slots.actions" class="base-card__header">
      <slot name="header">
        <div class="base-card__heading">
          <h2 v-if="title" class="base-card__title">{{ title }}</h2>
          <p v-if="description" class="base-card__description">{{ description }}</p>
        </div>
      </slot>
      <div v-if="$slots.actions" class="base-card__actions">
        <slot name="actions" />
      </div>
    </header>

    <div class="base-card__body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="base-card__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.base-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--rt-border-subtle);
  border-radius: var(--rt-radius-lg);
  background: var(--rt-bg-panel);
  box-shadow: var(--rt-shadow-xs);
}

.base-card--borderless {
  border-color: transparent;
}

.base-card--interactive {
  transition:
    border-color var(--rt-duration-base) var(--rt-ease-standard),
    box-shadow var(--rt-duration-base) var(--rt-ease-standard),
    transform var(--rt-duration-base) var(--rt-ease-standard);
}

.base-card--interactive:hover {
  border-color: var(--rt-color-primary-200);
  box-shadow: var(--rt-shadow-md);
  transform: translateY(-1px);
}

.base-card--padding-none .base-card__body {
  padding-right: 0;
  padding-bottom: 0;
  padding-left: 0;
}

.base-card--padding-sm .base-card__header,
.base-card--padding-sm .base-card__body,
.base-card--padding-sm .base-card__footer {
  padding-right: var(--rt-space-4);
  padding-left: var(--rt-space-4);
}

.base-card--padding-md .base-card__header,
.base-card--padding-md .base-card__body,
.base-card--padding-md .base-card__footer,
.base-card--padding-none .base-card__header,
.base-card--padding-none .base-card__footer {
  padding-right: var(--rt-space-5);
  padding-left: var(--rt-space-5);
}

.base-card--padding-lg .base-card__header,
.base-card--padding-lg .base-card__body,
.base-card--padding-lg .base-card__footer {
  padding-right: var(--rt-space-6);
  padding-left: var(--rt-space-6);
}

.base-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--rt-space-4);
  padding-top: var(--rt-space-5);
  padding-bottom: var(--rt-space-4);
}

.base-card__heading {
  min-width: 0;
}

.base-card__title {
  color: var(--rt-text-primary);
  font-size: var(--rt-font-size-lg);
  font-weight: 700;
  line-height: var(--rt-line-height-tight);
}

.base-card__description {
  margin-top: var(--rt-space-2);
  color: var(--rt-text-tertiary);
  font-size: var(--rt-font-size-sm);
}

.base-card__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--rt-space-2);
}

.base-card__body {
  padding-bottom: var(--rt-space-5);
}

.base-card__header + .base-card__body {
  padding-top: 0;
}

.base-card__footer {
  border-top: 1px solid var(--rt-border-subtle);
  padding-top: var(--rt-space-4);
  padding-bottom: var(--rt-space-4);
  background: var(--rt-bg-subtle);
}

@media (max-width: 720px) {
  .base-card__header {
    flex-direction: column;
  }

  .base-card__actions {
    width: 100%;
  }
}
</style>
