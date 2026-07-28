# RiskTrace AI 前端开发速查

本文件用于编码时快速查阅。完整且强制执行的规则见根目录 `AGENTS.md`。

## 1. 视觉方向

RiskTrace 是企业级采购合规与风险控制系统，界面应当：

- 克制；
- 结构清晰；
- 数据优先；
- 可追溯；
- 强调状态与操作结果；
- 避免营销化和娱乐化表达。

统一使用：

- `src/styles/tokens.css` 中的颜色、间距、圆角、阴影和布局令牌；
- `src/styles/element.css` 中的 Element Plus 主题覆盖；
- `src/components/common/` 中的基础组件；
- `src/layouts/AppLayout.vue` 提供的应用壳层；
- `@element-plus/icons-vue` 提供的唯一通用图标；
- `src/icons/index.ts` 提供的图标语义映射。

禁止使用 Emoji、Unicode 符号、文字首字、CSS 图形或临时内联 SVG 代替正式通用图标；禁止引入第二套图标库、随机渐变、无关插画、装饰性图片和临时拼凑的占位卡片。品牌标志、业务专属图形和正式插图可使用经过评审的 SVG 静态资源，但必须集中存放在 `public/` 或 `src/assets/`，不得散落在业务模板中。


## 2. 图标速查

- 唯一通用图标库：`@element-plus/icons-vue`；
- 唯一统一出口：`src/icons/index.ts`；
- 业务代码统一 `import { AppIcons } from '@/icons'`；
- 禁止业务文件直接导入 `@element-plus/icons-vue`；
- 禁止 Lucide、Heroicons、Material Icons、Font Awesome 和其他 Iconify 图标集；
- 导航、按钮、状态和账户等通用语义不得使用文字首字、CSS 图形或自制 SVG；
- 品牌、业务流程、证据链及领域专属图形可以使用正式 SVG 静态资源；
- 开发阶段可使用明确标注的 `*-placeholder.svg`，但正式发布前必须替换或移除；
- 纯图标按钮使用 `IconButton.vue`；
- 纯图标按钮必须有 Tooltip 与 `aria-label`；
- 图标默认继承 `currentColor`；
- 同一业务语义必须使用同一图标；
- 完整规范见 `docs/ICON_SYSTEM.md`。

## 3. 架构关系

```text
views
  -> components
  -> api/modules
  -> api/request

跨路由共享状态 -> stores
共享数据契约   -> types
演示数据       -> mocks
```

基本要求：

- 组件不得直接调用 `fetch`；
- 页面不得自行创造新的设计体系；
- 业务接口按领域放入 `src/api/modules/`；
- 页面局部状态不要滥用 Pinia；
- 演示数据必须放入 `src/mocks/`；
- 共享类型不得长期散落在 Vue 文件中。

## 4. 页面必须具备的状态

每个数据功能至少应明确：

- 加载状态；
- 成功状态；
- 空数据状态；
- 错误状态；
- 适用时的禁用、无权限和操作完成状态。

优先使用已有状态组件，不要为每个页面重新实现一套。

## 5. 新建文件前检查

1. 搜索是否已有相同组件、类型或 API 模块；
2. 明确新文件的单一职责和所属目录；
3. 确认不会制造重复抽象；
4. 确认公开接口具有完整类型；
5. 确认视觉使用现有设计令牌；
6. 确认图标来自 `@/icons`，没有直接导入图标库；
7. 确认没有用 Emoji、Unicode 符号、文字首字、CSS 图形、临时内联 SVG 或假数据填充页面；
8. 确认纯图标按钮具备 Tooltip 和 `aria-label`；
9. 确认功能具备加载、空数据和错误处理。

## 6. 交付前最低检查

```bash
pnpm type-check
pnpm type-check:functions
pnpm lint
pnpm format:check
pnpm build-only
```
