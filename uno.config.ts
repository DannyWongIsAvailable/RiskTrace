import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [presetWind3(), presetAttributify(), presetIcons()],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  shortcuts: {
    'rt-flex-center': 'flex items-center justify-center',
    'rt-flex-between': 'flex items-center justify-between',
    'rt-truncate': 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
    'rt-form-row': 'grid gap-4 md:grid-cols-2 xl:grid-cols-3',
  },
  theme: {
    colors: {
      primary: 'var(--rt-color-primary-600)',
      success: 'var(--rt-color-success-600)',
      warning: 'var(--rt-color-warning-600)',
      danger: 'var(--rt-color-danger-600)',
      surface: 'var(--rt-bg-panel)',
      page: 'var(--rt-bg-page)',
      text: 'var(--rt-text-primary)',
      muted: 'var(--rt-text-tertiary)',
    },
  },
})
