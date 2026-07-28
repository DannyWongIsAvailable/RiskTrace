# RiskTrace AI 工程协作契约

本文件是所有 AI 编程代理在本仓库中工作的**强制上下文**。
在新增、修改或删除代码之前，必须先阅读本文件。本文件中的项目约束优先于 AI 的通用前端偏好、默认模板和个人习惯。

## 1. 产品上下文

RiskTrace 是一套面向企业采购到付款流程的合规与风险控制平台，核心场景包括采购事件分析、合同义务核验、交易一致性检查、风险证据追溯、人工复核和处置闭环。

产品界面必须体现：

- 可信；
- 可审计；
- 可追溯；
- 信息清晰；
- 操作可控；
- 状态明确。

RiskTrace 不是营销落地页、游戏界面、社交应用，也不是视觉实验项目。默认界面语言为简体中文。

## 2. 编码前必须完成的上下文扫描

在创建或修改任何前端功能之前，AI 必须：

1. 阅读本文件；
2. 阅读 `docs/FRONTEND_DESIGN_SYSTEM.md`；
3. 阅读 `docs/FILE_STRUCTURE.md`；
4. 阅读 `docs/ICON_SYSTEM.md`；
5. 涉及接口时阅读 `docs/API_CONVENTIONS.md`；
6. 检查目标路由、相邻页面、相关组件、API 模块、Store、类型和静态资源；
7. 在 `src/components/` 中搜索是否已有可复用组件；
8. 在 `src/styles/tokens.css` 中搜索是否已有可用设计令牌；
9. 在 `src/icons/index.ts` 中搜索是否已有可用图标语义映射；
10. 在 `public/` 和 `src/assets/` 中搜索是否已有可复用静态资源；
11. 在实现数据页面前，明确加载、成功、空数据、错误、权限受限和操作成功等状态。

禁止只根据用户的一句话提示直接生成页面，而不读取仓库上下文。

## 3. 目录职责边界

```text
src/views/              路由级页面编排，不承担通用组件职责
src/layouts/            应用整体壳层与页面框架
src/components/common/  与业务领域无关的通用基础组件
src/components/<domain> 可被同一业务领域多个页面复用的组件
src/api/modules/        按业务领域划分的类型化接口契约
src/stores/             跨路由或远距离组件共享状态
src/types/              跨模块共享的数据类型
src/constants/          稳定的静态配置、枚举映射和导航定义
src/icons/              Element Plus Icons 的唯一统一出口与语义映射
src/mocks/              明确标识为演示用途的模拟数据
src/styles/             全局设计系统和第三方组件覆盖
functions/api/           Cloudflare Pages REST API 路由
functions/_shared/       后端共享工具与响应封装
```

严禁：

- 在 Vue 组件或 Pinia Store 中直接调用 `fetch`；
- 在前端实现数据库访问或后端安全逻辑；
- 在模板中堆叠复杂业务规则；
- 为单个弹窗、单个表单或仅在一个组件使用的状态创建 Store；
- 创建功能相同但命名略有差异的重复组件；
- 把无关工具全部堆入一个通用 `utils.ts`；
- 创建 `Temp.vue`、`Test.vue`、`NewComponent.vue`、`Common.vue`、`DataList.vue` 等职责含糊的文件；
- 未更新本文件与 `docs/FILE_STRUCTURE.md` 就新增顶层源码目录。

## 4. 视觉语言

批准使用的视觉方向是克制、专业、数据优先的企业级 SaaS：

- 中性页面背景；
- 白色信息承载面；
- 蓝色用于主操作、链接和当前选中状态；
- 绿色、黄色、橙色和红色仅用于明确的语义状态；
- 间距紧凑但可读；
- 主要依靠字体层级、对齐和留白建立秩序；
- 边框和阴影保持轻量；
- 动效简短、必要且可关闭。

必须使用 `src/styles/tokens.css` 中已有设计令牌。
业务组件中不得随意写入原始颜色值。确需新增颜色时，先定义具有清晰语义的全局令牌，再使用该令牌。

## 5. Emoji、图标与静态资源

### 5.1 唯一批准的图标库

RiskTrace 通用界面图标只允许使用：

```text
@element-plus/icons-vue
```

所有通用图标必须通过以下统一出口访问：

```text
src/icons/index.ts
```

业务组件、页面、布局、Store 和常量文件禁止直接从 `@element-plus/icons-vue` 导入图标。统一使用：

```ts
import { AppIcons } from '@/icons'
```

除非用户明确要求并完成架构评审，禁止引入或混用 Lucide、Heroicons、Material Icons、Font Awesome、Iconify 其他图标集或任何第二套图标库。

### 5.2 禁止行为

产品界面中的标题、按钮、菜单、空状态、提示、标签和告警中禁止使用 Emoji。
禁止用 Unicode 符号、文字首字、CSS 图形或临时内联 SVG 代替正式通用图标。

禁止：

- 使用火箭、火焰、星星、警告符号、文件夹、对勾等 Emoji；
- 为填充空白随机生成 SVG 插画或图标；
- 在业务文件中直接导入 `@element-plus/icons-vue`；
- 同一业务语义在不同页面使用不同图标；
- 为普通搜索、查看、编辑图标单独设置彩色；
- 为了视觉丰富给每张卡片、标题、数字和说明都添加图标；
- 将远程图片 URL 作为核心界面资源；
- 嵌入大体积 Base64 图片；
- 在业务操作页面放置无关图库图片。

### 5.3 图标使用规则

- 导航、按钮、筛选和表格操作默认使用线性图标；
- 填充图标只用于成功、警告、错误等明确状态；
- 图标默认继承 `currentColor`；
- 图标尺寸必须使用全局图标设计令牌；
- 状态不能只通过图标和颜色表达，必须同时提供文字；
- 纯图标按钮必须使用 `IconButton.vue`；
- 纯图标按钮必须提供 Tooltip、`aria-label` 和键盘焦点状态；
- 图标旁已有明确文字时，图标应作为装饰性内容处理，避免重复朗读。

完整规范见 `docs/ICON_SYSTEM.md`。

### 5.4 静态资源选择顺序

新增视觉元素时必须按以下顺序选择：

1. 复用 `public/` 或 `src/assets/` 中已有资源；
2. 复用已有组件；
3. 在 `src/icons/index.ts` 中复用已批准的 Element Plus Icons 语义映射；
4. 确认通用图标库无法表达后，新增语义明确、命名清晰并记录用途的正式 SVG 或图片静态资源。

缺少数据时使用 `EmptyState.vue`；
正在加载时使用 `LoadingState.vue` 或中性骨架；
请求失败时使用 `ErrorState.vue`；
品牌标识统一复用 `/public/brand/risktrace-mark.svg`。
正式 SVG 静态资源仅用于品牌、业务流程、证据链、关系拓扑、领域专属符号或报告插图；应存放在 `public/` 或 `src/assets/`，不得将 SVG 源码散落在业务模板中，也不得替代 `AppIcons` 已覆盖的通用界面图标。开发阶段允许使用文件名带 `-placeholder` 的明确占位资源，但必须标注待人工补充，并在正式发布前替换或移除。

## 6. 组件设计规则

一个 Vue 组件通常应当：

- 只承担一个清晰职责；
- 在可行情况下控制在约 300 行以内；
- 使用完整类型的 Props 和 Emits；
- 通过具名插槽开放合理扩展点；
- 处理必要的无障碍标签和键盘行为；
- 使用 Scoped CSS 编写组件专属结构；
- 优先组合现有基础组件，而不是重新实现。

满足以下任一条件时，考虑抽取可复用组件：

- 相同结构已出现两次或预计会重复出现；
- 某种模式需要统一交互、状态或无障碍行为；
- 页面区域具备独立状态模型；
- 统一视觉与行为比页面自由度更重要。

不要创建只包裹一个原生标签、却没有增加行为、语义或设计一致性的空洞抽象。

## 7. 已批准的基础组件

创建替代品之前，必须优先评估以下组件：

- `AppLogo.vue`
- `PageHeader.vue`
- `SectionHeader.vue`
- `BaseCard.vue`
- `BaseTableCard.vue`
- `MetricCard.vue`
- `FilterBar.vue`
- `StatusTag.vue`
- `InlineNotice.vue`
- `DescriptionList.vue`
- `PaginationBar.vue`
- `ConfirmActionDialog.vue`
- `LoadingState.vue`
- `EmptyState.vue`
- `ErrorState.vue`
- `IconButton.vue`

禁止未经论证就新增 `PanelCard`、`InfoCard`、`ContentCard`、`TablePanel`、另一套状态标签或同类重复基础组件。

## 8. TypeScript 规则

必须遵守：

- 启用并尊重严格 TypeScript；
- 禁止显式 `any`；
- 对不可信输入使用 `unknown`；
- 导入类型时使用 `import type`；
- API 模型、组件 Props、Emits 和公开函数必须显式标注类型；
- 有限状态使用联合类型或枚举表达；
- 多处共享的领域契约必须移出 Vue 文件；
- 对外部输入先验证、再缩小类型范围。

尽量避免非空断言。
禁止通过错误的类型断言掩盖真实数据结构问题。

## 9. API 规则

所有浏览器请求必须经过：

```text
src/api/request.ts
src/api/modules/<domain>.ts
```

统一响应结构：

```ts
type ApiResponse<T> =
  | { success: true; data: T; message?: string; meta?: ApiMeta }
  | { success: false; code: string; message: string; details?: unknown; meta?: ApiMeta }
```

每个业务 API 模块负责：

- 接口路径；
- 请求参数类型；
- 查询参数类型；
- 响应类型；
- 必要时完成传输模型到领域模型的转换。

严禁：

- 让 Vue 组件解析原始后端响应；
- 静默吞掉接口错误；
- 向用户展示堆栈、SQL、密钥或内部错误对象；
- 依赖可读错误文案进行程序分支；
- 在多个页面重复拼接同一接口地址。

新增或修改接口前，先阅读 `docs/API_CONVENTIONS.md`。

## 10. 状态管理规则

以下状态默认使用组件或页面本地状态：

- 表单输入；
- 弹窗显示状态；
- 单页面拥有的加载状态；
- 本地表格筛选条件；
- 临时选中项；
- 单页面步骤状态。

仅在跨路由或远距离组件树共享时使用 Pinia，例如：

- 当前登录用户；
- 全局应用设置；
- 当前租户；
- 持久化导航状态；
- 多个路由共同依赖的当前风险事件。

Store 不得成为接口函数堆放区。业务 API 函数始终放在 `src/api/modules/` 中。

## 11. CSS 与 UnoCSS 规则

实现样式时按以下优先级选择：

1. 已有通用组件；
2. 已有设计令牌；
3. 使用 UnoCSS 完成小型布局工具；
4. 使用 Scoped CSS 完成组件专属结构；
5. 仅当规则真正跨应用复用时新增全局样式。

禁止：

- 使用内联 `style` 或样式对象处理普通布局；
- 在多个组件重复魔法数字；
- 随意创建颜色、阴影和圆角；
- 过度使用渐变；
- 使用全局选择器修改单个页面；
- 无说明地使用 `!important`；
- 在业务组件中覆盖 Element Plus 全局风格。

Element Plus 的统一视觉覆盖必须写入 `src/styles/element.css`。

## 12. 页面状态要求

所有数据型页面必须主动设计并实现：

- 初始或加载状态；
- 成功状态；
- 空数据状态；
- 可恢复错误状态；
- 适用时的危险操作确认；
- 适用时的禁用或权限受限状态；
- 操作完成后的明确反馈。

永久展示的骨架、假图表或无法结束的加载动画不算有效实现。
演示数据必须放在 `src/mocks/`，并明确标识为演示用途。

## 13. 表单与表格

### 表单

- 使用 Element Plus 表单控件；
- 风险、金额、供应商和审批等业务字段必须保留清晰标签；
- 字段校验信息应靠近对应字段；
- 提交期间禁用重复提交；
- 可恢复错误发生后保留用户已填写内容；
- 风险放行、覆盖判断和危险操作必须填写业务理由；
- 一个表单原则上只保留一个主操作。

### 表格

- 使用稳定的行键；
- 关键身份字段应优先显示；
- 金额和数值保持统一对齐；
- 状态统一使用 `StatusTag.vue`；
- 必须支持加载、空数据和错误状态；
- 每行尽量不超过一个主操作；
- 不能只依赖颜色表达状态；
- 窄屏下应允许合理横向滚动或降级展示。

## 14. 命名规则

- Vue 组件使用 PascalCase；
- TypeScript 模块统一使用 kebab-case，或遵循当前业务域已建立的命名方式；
- Store 使用 `useXxxStore`；
- Composable 以 `use` 开头；
- 布尔变量以 `is`、`has`、`can` 或 `should` 开头；
- 事件处理函数使用动词，例如 `handleSubmit`、`openDialog`；
- 业务组件名称必须明确，例如 `RiskCaseTable.vue`，禁止使用 `DataList.vue` 这类含糊名称。

## 15. 依赖管理规则

当项目现有能力已经能满足需求时，不得新增依赖。

新增依赖前必须说明：

- 当前缺失的具体能力；
- 为什么 Vue、Element Plus、UnoCSS 或浏览器原生 API 无法满足；
- 对包体积和运行时的影响；
- 若用于服务端，是否兼容 Cloudflare Workers Runtime；
- 是否会造成同类能力重复。

禁止引入第二套 UI 框架、第二套状态管理库或第二个 HTTP 客户端。

## 16. AI 生成内容特别约束

AI 不得：

- 用大段虚构指标制造“看起来完整”的页面；
- 为未定义功能创建无意义卡片；
- 用随机英文副标题、品牌口号或装饰性短句填充版面；
- 自动创建不存在的用户、供应商、金额或风险结论并当作真实数据；
- 为了视觉丰富而添加与业务无关的图标、插画或渐变背景；
- 在没有接口或 Mock 说明时伪造已完成的数据联动；
- 绕过已有组件，仅为快速完成而复制样式；
- 未经说明修改全局视觉、接口规范或目录边界。

需要占位时，必须使用明确标识的中性占位内容，或在 `src/mocks/` 中提供可追踪的演示数据。

## 17. 完成前检查清单

提交或交付改动前，必须确认：

- 目录职责边界未被破坏；
- 未新增重复基础组件；
- 未添加 Emoji 或装饰性占位内容；
- 已复用或有意识地新增静态资源；
- 类型完整且未引入 `any`；
- API 调用已集中管理；
- 加载、空数据和错误状态已覆盖；
- 桌面端和移动端布局可接受；
- 通用图标全部来自 `@element-plus/icons-vue` 并通过 `@/icons` 访问；
- 未引入第二套图标库；
- 纯图标按钮统一使用 `IconButton.vue`，并具备 Tooltip 与无障碍标签；
- 危险操作具备确认机制和业务理由；
- `pnpm type-check` 通过；
- `pnpm type-check:functions` 通过；
- `pnpm lint` 通过；
- `pnpm format:check` 通过；
- `pnpm build-only` 通过；
- 新增规范时同步更新相关文档。
