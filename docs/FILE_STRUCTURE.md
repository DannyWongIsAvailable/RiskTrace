# RiskTrace 文件与目录规范

## 1. 项目结构

```text
RiskTrace/
├── AGENTS.md
├── AI_FRONTEND_STANDARD.md
├── README.md
├── docs/
│   ├── API_CONVENTIONS.md
│   ├── ERROR_HANDLING_AND_OBSERVABILITY.md
│   ├── FRONTEND_DESIGN_SYSTEM.md
│   └── ICON_SYSTEM.md
├── functions/
│   ├── _middleware.ts
│   ├── _shared/
│   └── api/
├── public/
│   ├── brand/
│   └── illustrations/
├── src/
│   ├── api/
│   │   └── modules/
│   ├── assets/
│   ├── components/
│   │   ├── common/
│   │   ├── layout/
│   │   └── <domain>/
│   ├── constants/
│   ├── icons/
│   ├── layouts/
│   ├── mocks/
│   ├── observability/
│   ├── router/
│   ├── stores/
│   ├── styles/
│   ├── types/
│   └── views/
└── package.json
```

## 2. 根目录文件

根目录只放置全项目级文件，例如：

- 工程配置；
- 构建配置；
- Cloudflare 配置；
- 全项目规范文档；
- 包管理文件；
- 环境变量示例。

禁止把页面数据、临时脚本和单一业务说明随意放在根目录。

## 3. `src/views/`

用于路由级页面。

页面职责：

- 组合领域组件和通用组件；
- 管理当前路由拥有的请求和页面状态；
- 处理路由参数和页面级交互；
- 不承担可跨页面复用的基础 UI 实现。

命名示例：

```text
DashboardView.vue
ProjectListView.vue
ProjectDetailView.vue
TaskCenterView.vue
```

## 4. `src/layouts/`

用于完整应用壳层或大范围页面框架，例如：

- 企业后台布局；
- 登录布局；
- 打印或报告布局。

普通卡片和局部容器不属于 `layouts`。

## 5. `src/components/common/`

用于与具体业务领域无关、可跨页面复用的基础组件，例如：

- 页面标题；
- 卡片；
- 状态组件；
- 表格容器；
- 确认弹窗；
- 统一图标按钮；
- 空数据与错误状态。

新增基础组件前必须搜索已有组件，并评估是否可以通过 Props 或 Slots 扩展。

## 6. `src/components/layout/`

用于应用布局内部的结构组件，例如：

- 侧边栏；
- 顶部栏；
- 导航区域。

它们通常由 `src/layouts/` 中的布局组合使用。

## 7. `src/components/<domain>/`

用于特定业务域、但会在该业务域多个页面复用的组件。

示例：

```text
src/components/project/ProjectTable.vue
src/components/project/EvidenceChain.vue
src/components/task/TaskDispositionPanel.vue
```

只在一个页面中使用且结构简单的内容，可以暂时保留在页面中；职责独立或明显会复用时再抽取。

## 8. `src/api/`

```text
src/api/request.ts       统一 HTTP 客户端
src/api/modules/         按业务领域划分的接口模块
```

示例：

```text
src/api/modules/projects.ts
src/api/modules/tasks.ts
src/api/modules/rules.ts
```

Vue 组件和 Pinia Store 不得直接调用 `fetch`。

## 9. `src/stores/`

仅用于跨路由或远距离组件共享状态。

适合：

- 当前用户；
- 当前租户；
- 全局设置；
- 持久化导航状态；
- 多个页面共同依赖的活动业务对象。

不适合：

- 单个表单；
- 单个弹窗；
- 单页面筛选条件；
- 页面局部加载状态。

## 10. `src/types/`

用于跨模块共享的数据契约：

- API 通用类型；
- 领域模型；
- UI 状态类型；
- 多个组件共用的 Props 结构。

只在一个文件中使用的简单类型可以就近定义。

## 11. `src/constants/`

用于稳定的静态配置和由单一配置源派生的读取工具：

- 状态显示映射；
- 下拉选项；
- 不依赖运行时变化的业务常量；
- 从路由 `meta.navigation` 派生导航项的读取函数。

导航标题、路径、图标、分组和排序统一维护在 `src/router/index.ts` 的路由 `meta` 中，不得在常量文件中复制第二份导航配置。

不要把接口返回数据或临时变量写入常量目录。

## 12. `src/icons/`

用于管理 Element Plus Icons 的统一出口和业务语义映射。

```text
src/icons/index.ts
```

要求：

- 通用图标来自 `@element-plus/icons-vue`；
- 除 `src/icons/index.ts` 外，必要时允许批准的 Iconify 图标
- 统一导出 `AppIcons`；
- 按 `navigation`、`action`、`layout`、`status`、`account` 等语义分组；
- 同一业务语义只能对应一个默认图标；
- 新增图标前先搜索是否已有相同语义；
- 禁止在此目录存放图片、品牌 SVG 或业务插图。

完整规则见 `docs/ICON_SYSTEM.md`。

### 静态 SVG 与图片资源

- 固定 URL 访问的品牌和正式插图放在 `public/brand/`、`public/illustrations/` 等语义目录；
- 需要 Vite 构建处理的静态资源放在 `src/assets/`；
- SVG 文件使用短横线语义命名，并清理脚本、外链、编辑器元数据和无用节点；
- 开发阶段待人工补充的插图使用 `*-placeholder.svg` 命名，正式发布前必须替换或移除；
- 不在 Vue 业务模板中散落大段 SVG 源码；
- 不使用静态 SVG 替代 `AppIcons` 已覆盖的通用导航、操作、状态和账户图标。

## 13. `src/observability/`

用于浏览器端统一错误归一化、结构化日志、错误订阅和外部观测传输。

要求：

- Vue、Router、全局脚本、Promise 和 API 异常统一进入该模块；
- 不记录请求体、密钥、账户或其他敏感数据；
- 业务页面仍负责自己的可恢复错误展示；
- 不在业务组件中重复实现全局错误上报。

完整规则见 `docs/ERROR_HANDLING_AND_OBSERVABILITY.md`。

## 14. `src/mocks/`

仅用于明确的演示和开发模拟数据。

要求：

- 文件名说明业务领域；
- 数据必须明确标识为演示用途；
- 不得混入生产接口逻辑；
- 不得包含真实敏感数据；
- 接入真实接口后应明确保留、替换或删除策略。

## 15. `src/styles/`

```text
tokens.css     设计令牌
reset.css      浏览器重置
元素主题文件   Element Plus 统一覆盖
utilities.css  少量跨页面工具类
```

页面专属样式应优先放在组件 Scoped CSS 中，不应不断扩大全局样式。

## 16. `functions/`

```text
functions/_middleware.ts  全局请求编号、耗时日志和未处理异常兜底
functions/api/             Pages Functions 文件系统路由
functions/_shared/         后端共享响应、校验、数据库和审计工具
```

要求：

- 路由文件保持轻量；
- 可复用后端逻辑放入 `_shared`；
- 数据库和安全逻辑不得放到前端；
- 接口路径与文件结构保持可预测；
- D1 结构变化通过迁移管理。

## 17. 新增目录规则

禁止未经讨论新增顶层源码目录。

确需新增时，应同时说明：

- 新目录解决的职责问题；
- 为什么现有目录无法承载；
- 与其他目录的边界；
- 命名和使用示例。

并同步更新本文件和 `AGENTS.md`。
