import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from 'eslint-config-prettier/flat'
import { globalIgnores } from 'eslint/config'
import pluginOxlint from 'eslint-plugin-oxlint'
import pluginVue from 'eslint-plugin-vue'

export default defineConfigWithVueTs(
  {
    name: 'risktrace/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    '**/.wrangler/**',
    '**/node_modules/**',
    'src/auto-imports.d.ts',
    'src/components.d.ts',
    'functions/types.d.ts',
  ]),
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    name: 'risktrace/project-rules',
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'curly': ['error', 'all'],
      'eqeqeq': ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@element-plus/icons-vue',
              message: '请统一从 @/icons 导入图标，禁止在业务文件中直接导入图标库。',
            },
          ],
        },
      ],
      'prefer-const': 'error',
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/html-self-closing': [
        'error',
        {
          html: {
            void: 'always',
            normal: 'always',
            component: 'always',
          },
          svg: 'always',
          math: 'always',
        },
      ],
      'vue/multi-word-component-names': [
        'error',
        {
          ignores: ['App'],
        },
      ],
      'vue/no-mutating-props': 'error',
      'vue/no-unused-components': 'error',
      'vue/no-v-html': 'error',
    },
  },
  {
    name: 'risktrace/icon-entry-exception',
    files: ['src/icons/index.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),
  skipFormatting,
)
