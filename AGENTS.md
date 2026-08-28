# RiskTrace AI 工程协作契约

本文件是所有 AI 编程代理在本仓库中工作的**强制上下文**。
在新增、修改或删除代码之前，必须先阅读本文件。本文件中的项目约束优先于 AI 的通用前端偏好、默认模板和个人习惯。

## 1. 产品上下文

RiskTrace 当前是一套面向企业采购项目的智能合规审查 Demo。用户填写项目标题并上传材料后，系统只创建一个 DeepSeek Harness Run，连续完成材料理解、完整性检查、领域路由、领域审查和报告聚合。DeepSeek Harness 是唯一 Agent Runtime；Session Event 是工作过程事实源。

当前版本的核心链路是：

```text
项目标题
→ 全部材料上传
→ 创建一个 RiskTrace 审查运行
→ 创建一次 DeepSeek Harness Run
→ Python gateway 持久化完整 append-only Session Event
→ 页面增量 replay 同一 Run 的 Turn / Step / Assistant / Tool / Todo
→ Harness root turn 明确 completed 后返回最终输出
→ 一次性校验并保存材料理解结果和最终报告
```

产品界面必须体现：

- 可信；
- 可追溯；
- 信息清晰；
- 自动流程状态明确；
- 工作流执行中与最终结果边界明确；
- 错误与重试状态明确。

当前 Demo 在自动审查之外增加轻量风险事项闭环：最终报告中的风险事项会进入独立风险事项列表，状态仅包含待处置与整改和已完成；用户可手工填写处置与整改信息并上传 R2 证明材料。当前仍不建设 AI 复核、规则中心、付款控制、复杂审批流、复杂事实模型或组织权限体系。RiskTrace 不是营销落地页、聊天机器人外壳、游戏界面或视觉实验项目。默认界面语言为简体中文。


## 2. 领域术语与代码命名

- 顶层业务对象在界面中统一称为“采购项目”，代码中统一使用 `project`、`Project`、`projectId` 和 `/projects`；
- 一次材料核验与风险研判统一称为“合规审查”，代码中使用 `review`、`Review`、`reviewRun` 或 `reviewRunId`；
- 合规审查检出的实体统一称为“风险事项”，代码中使用 `riskFinding`、`RiskFinding` 和 `findingId`；“风险发现”仅用于描述识别动作或能力，不作为实体名称；
- 禁止使用“标案”“采购事件”“风险事件”或 `case` 表示采购项目或风险事项；
- 招标阶段存在独立层级时，按实际业务结构使用“招标项目”“标段”或“采购包”，不得将三者混作采购项目的同义词。

## 3. 核心业务边界

### 3.1 模型边界

模型可以生成：

- 材料名称与材料类别；
- 单份材料摘要与项目摘要；
- 材料完整性分析；
- 领域风险事项、风险等级和建议；
- 最终报告与分析限制。

模型不可以：

- 修改用户填写的项目标题；
- 创建或修改系统生成的 `projectId`、`reviewRunId` 和 `documentId`；
- 修改文件名、R2 Key、上传状态和系统阶段；
- 引用当前项目不存在的文件；
- 无依据补齐材料、金额、日期或风险结论；
- 静默覆盖冲突值；
- 绕过后端校验直接写入正式结果；
- 为了“完整”自行扩展超出当前两状态 MVP 的复杂事实表、AI 复核、多级审批或处置工作流。

### 3.2 后端边界

Pages Functions 负责：

- 项目、文件、审查运行、结果、风险事项和 Harness Event API；
- R2 上传签名、上传确认和短时读取 URL；
- 为一个审查尝试创建且只创建一个 DeepSeek Harness Run；
- 使用同一个 `provider_execute_id` 查询 Harness 状态与增量读取 Session Event，轮询不得创建第二个 Run；
- 将 Harness Event 做浏览器安全裁剪后透传，保留官方 event type/envelope 与插件扩展事件；
- 在 Harness root turn 明确 `completed` 后取得最终输出，并分别校验、幂等保存材料理解结果和最终报告；
- 将最终报告中的风险事项幂等同步到风险事项表；
- 风险事项处置与整改信息持久化，以及证明材料 R2 直传与上传确认；
- D1 持久化、错误映射、重试边界和结构化日志。

Pages Functions 不得把材料理解和领域审查拆成两个独立 Harness 执行，也不得从 `ProjectStage/progress` 反推工作轨迹。Session Event 是执行过程事实源；`progress` 仅作为历史数据库字段保留，审查 UI 不展示伪百分比。


## 4. 编码前上下文扫描

修改功能前必须：

1. 阅读本文件；
2. 阅读 `docs/Demo应用设计方案.md`；
3. 阅读 `docs/FRONTEND_DESIGN_SYSTEM.md`；
4. 阅读 `docs/FILE_STRUCTURE.md`；
5. 阅读 `docs/ICON_SYSTEM.md`；
6. 涉及接口时阅读 `docs/API_CONVENTIONS.md`；
7. 涉及错误和日志时阅读 `docs/ERROR_HANDLING_AND_OBSERVABILITY.md`；
8. DeepSeek Harness 执行与 Session Event 可视化以 `docs/RiskTrace_DeepSeek_Harness_工作过程可视化重构设计.md` 和官方 deepseek-harness master 协议为准；
9. 检查目标路由、相邻页面、相关组件、API、Store、类型和静态资源；
10. 搜索已有基础组件、设计令牌和图标映射；
11. 明确加载、成功、空数据、错误和权限受限状态；
12. 明确该功能位于主链路的哪个阶段，输入和输出分别是什么。

禁止只根据一句提示直接生成页面，而不读取仓库上下文。

## 5. 系统架构约束

```text
Vue 3 前端
    │ RiskTrace REST API
Cloudflare Pages Functions
    ├─ D1：项目、文件、审查运行、中间结果和最终报告
    ├─ R2：原始材料、派生件和可选调试输出
    └─ DeepSeekHarnessReviewProvider
             │ /runs /runs/{id} /runs/{id}/events
      Python DeepSeek Harness Gateway
             │ SDK / JSON-RPC stdio
      DeepSeek Harness Session Event Log
```

必须遵守：

- 前端只通过 API 访问后端，不直接访问 D1、R2、Harness Base URL 或 Harness API Key；
- DeepSeek Harness 是唯一 Agent Runtime，业务运行路径不得根据 `REVIEW_PROVIDER` 切换 Mock/星辰；
- 一个审查尝试只允许一次 Harness `POST /runs`，状态与事件读取必须复用同一个 executeId；
- Python gateway 必须持久化完整 canonical SessionEvent；未知插件事件不得在网关层因“不认识”而丢弃；
- Vue 不直接解释所有 Harness 原始事件，工作过程由 projector 从 Event Log 投影；
- 私有 reasoning/System Prompt/认证信息/签名 URL 不得发送到浏览器；
- `tool/call` 与 `tool/result` 必须通过 `callId` 合并成一个生命周期；Code Mode 子调用通过 `subCallId` 配对；
- 材料理解结果和最终报告必须由同一 Harness Run 在明确成功终态返回，并再次经过后端校验；


## 6. 目录职责

```text
src/views/              路由级页面编排
src/layouts/            应用壳层与页面框架
src/components/common/  与领域无关的基础组件
src/components/<domain> 同一领域跨页面复用组件
src/api/modules/        类型化前端接口契约
src/stores/             跨路由共享状态
src/types/              跨模块共享类型
src/constants/          稳定配置、枚举和映射
src/icons/              Element Plus Icons 唯一出口
src/mocks/              明确标识的演示数据
src/styles/             全局设计系统
functions/api/          对外 REST API
functions/_shared/      后端共享工具和领域服务
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
- 蓝色用于主操作、链接和选中状态；
- 绿色、黄色、橙色和红色只用于明确语义状态；
- 通过字体层级、对齐和留白建立信息秩序；
- 边框和阴影保持轻量；
- 动效简短、必要且可关闭。

必须使用 `src/styles/tokens.css` 中的设计令牌。业务组件不得随意写入原始颜色值；确需新增时，先建立语义令牌。

## 9. 图标与静态资源

通用界面图标只允许使用：

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

- 在业务文件中直接导入 `@element-plus/icons-vue`；
- 引入第二套图标库；
- 使用 Emoji、Unicode 符号、文字首字或 CSS 图形代替正式图标；
- 在业务模板中散落内联 SVG；
- 使用远程图片作为核心界面资源；
- 为视觉丰富给每张卡片和标题添加无意义图标。

### 5.3 图标使用规则

- 导航、按钮、筛选和表格操作默认使用线性图标；
- 填充图标只用于成功、警告、错误等明确状态；
- 图标默认继承 `currentColor`；
- 图标尺寸必须使用全局图标设计令牌；
- 状态不能只通过图标和颜色表达，必须同时提供文字；
- 纯图标按钮必须使用 `IconButton.vue`；
- 纯图标按钮必须统一使用 `IconButton.vue`；
- 图标旁已有明确文字时，不再重复增加额外图标说明。

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
- 处理必要的交互状态和点击行为；
- 使用 Scoped CSS 编写组件专属结构；
- 优先组合现有基础组件，而不是重新实现。

满足以下任一条件时，考虑抽取可复用组件：

- 相同结构已出现两次或预计会重复出现；
- 某种模式需要统一交互或状态行为；
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

禁止未经论证新增 `PanelCard`、`InfoCard`、`ContentCard`、`TablePanel` 或另一套状态标签。

组件通常应：

- 只承担一个明确职责；
- 在可行情况下控制在约 300 行以内；
- 使用完整类型的 Props 和 Emits；
- 处理必要交互状态；
- 优先组合现有组件；
- 不为单个原生标签创建空洞抽象。

## 11. TypeScript 规则

必须：

- 尊重严格 TypeScript；
- 禁止显式 `any`；
- 对不可信输入使用 `unknown`；
- 类型导入使用 `import type`；
- API、Props、Emits 和公开函数显式标注类型；
- 有限状态使用联合类型或枚举；
- 共享领域契约移出 Vue 文件；
- 外部输入先校验再缩小类型。

禁止通过错误断言或非空断言掩盖真实数据问题。

## 12. API 规则

所有浏览器请求必须经过：

```text
src/api/request.ts
src/api/modules/<domain>.ts
```

统一响应：

```ts
type ApiResponse<T> =
  | { success: true; data: T; message?: string; meta?: ApiMeta }
  | { success: false; code: string; message: string; details?: unknown; meta?: ApiMeta }
```

API 模块负责：

- 路径；
- 请求和查询参数类型；
- 响应类型；
- 必要的传输模型转换。

禁止：

- 让 Vue 组件解析原始响应；
- 静默吞掉错误；
- 根据可读错误文案进行程序分支；
- 向用户展示堆栈、SQL、令牌或内部对象；
- 在多个页面重复拼接同一接口地址。

## 13. 状态管理

默认使用组件或页面本地状态：

- 表单输入；
- 弹窗显示；
- 单页面加载状态；
- 表格筛选；
- 临时选中项；
- 单页面步骤状态。

仅在跨路由或远距离组件共享时使用 Pinia，例如：

- 当前用户；
- 全局权限；
- 跨页面项目上下文；
- 需要长期保留的全局筛选条件。

不得把 API 模块职责搬入 Store，也不得将所有页面数据全局化。

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
未接入行为可以保留可点击入口，但必须明确显示“待接入”，不得伪装成已完成。

## 15. 表单与表格

### 表单

- 标签、必填、帮助和错误信息必须明确；
- 提交期间禁止重复提交；
- 服务端错误必须映射到用户可理解的信息；
- 高风险操作必须二次确认；
- 带缺口提交必须展示合规审查限制。

### 表格

- 数字和金额右对齐；
- 状态使用统一 `StatusTag`；
- 空值使用统一占位；
- 操作列保持稳定；
- 纯图标操作使用 `IconButton` 和可访问名称；
- 表格必须具备加载、空数据和错误状态；
- 固定数量、分页和汇总不得写死。

## 16. 命名规则

- Vue 组件使用 PascalCase；
- TypeScript 模块统一使用 kebab-case，或遵循当前业务域已建立的命名方式；
- Store 使用 `useXxxStore`；
- Composable 以 `use` 开头；
- 布尔变量以 `is`、`has`、`can` 或 `should` 开头；
- 事件处理函数使用动词，例如 `handleSubmit`、`openDialog`；
- 业务组件名称必须明确，例如 `RiskFindingTable.vue`，禁止使用 `DataList.vue` 这类含糊名称。

## 15. 依赖管理规则

当项目现有能力已经能满足需求时，不得新增依赖。

新增依赖前必须说明：

- 现有能力为什么不足；
- 依赖体积和维护状态；
- Cloudflare Workers 兼容性；
- 是否可用少量代码替代。

## 21. AI 生成内容特别约束

AI 生成代码时禁止：

- 猜测仓库不存在的组件、接口、表或目录；
- 在未读取源码时声称现有功能已实现；
- 用常见设计替代项目已确定的领域结构；
- 自动补齐没有证据的业务规则；
- 为了看起来完整而制造假接口、假数据或假状态；
- 将外部模型输出视为可信输入；
- 未经要求大范围重构无关文件；
- 修改行为后不更新相应文档、类型和测试。

对无法从源码确认的事实必须明确说明未知，不得推测。

## 22. 完成前检查清单

提交前至少确认：

- 领域命名是否统一为采购项目；
- 功能是否位于正确的主链阶段；
- 是否复用了已有组件、令牌和图标；
- 是否存在直接 `fetch`、直接模型调用或直接数据库访问；
- API 类型、错误和请求编号是否完整；
- 页面是否覆盖加载、空数据、错误和降级状态；
- 是否只启动一条从材料理解贯通到报告聚合的 DeepSeek Harness Run；
- 是否每个审查尝试只执行一次 Harness `POST /runs`，状态与 Event 轮询均复用同一个 executeId；
- Harness `completed` 输出是否同时包含材料理解结果和最终报告，并在完整校验后分别幂等保存；
- 风险事项引用的 `documentId` 是否属于当前项目；
- 项目标题、文件名、R2 Key 和系统状态是否由后端控制；
- 关键阶段、错误和重试是否记录结构化日志；
- 是否泄露密钥或敏感信息；
- 是否新增重复组件、含糊文件或不必要依赖；
- `pnpm check` 是否通过；
- 行为、目录或架构变化是否同步更新文档。
