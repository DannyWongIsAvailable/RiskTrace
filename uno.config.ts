import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons(),
  ],

  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],

  shortcuts: {
    'page-container': 'mx-auto max-w-7xl px-4 py-6',
    'panel-card': 'rounded-xl bg-white p-5 shadow-sm',
    'flex-center': 'flex items-center justify-center',
  },

  theme: {
    colors: {
      primary: '#409eff',
      danger: '#f56c6c',
      warning: '#e6a23c',
      success: '#67c23a',
    },
  },
})