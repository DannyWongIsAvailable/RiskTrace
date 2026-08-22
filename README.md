# RiskTrace

RiskTrace 是面向企业采购项目的智能合规审查 Demo。用户只需填写项目标题并一次性上传当前已有的全部材料，系统随后通过统一 `ReviewProvider` 启动一次完整审查执行，在同一次执行中连续完成材料理解、完整性检查、领域路由、领域审查和报告聚合。当前可在 Mock、讯飞星辰 Workflow 与 DeepSeek Harness 之间切换，前端 API 保持不变。

> 仓库地址：https://github.com/DannyWongIsAvailable/RiskTrace.git  
> 线上地址：https://risktrace.pages.dev/

完整产品范围和实现口径见：`docs/Demo应用设计方案.md`。

## 当前 MVP 开发模式

为先打通可演示链路，当前前端保留“审查总览 → 项目列表 → 新建项目 → 上传材料 → 查看报告”五个页面。项目、文件和结果仍通过 Pages Functions、D1 与 R2 真实读写。`POST /api/projects/:projectId/uploads/complete` 现在统一进入 `startProjectReview`，再由 `REVIEW_PROVIDER` 选择 Mock、讯飞星辰或 DeepSeek Harness；因此切换 Provider 不再需要修改前端接口或上传完成路由。默认配置仍为 `mock`，保持现有演示行为。

Provider 适配、环境变量和 DeepSeek Harness HTTP 契约见 `docs/REVIEW_PROVIDER.md`。

## 1. 核心链路

```text
用户填写项目标题
→ 一次性上传全部材料
→ 上传批次完成后创建一个审查运行
→ 通过 ReviewProvider 启动一次完整审查执行
→ 同一 Provider 执行完成材料理解、自动分类、领域审查和报告聚合
→ RiskTrace 持续使用同一个 executeId 查询执行状态
→ Provider 成功后一次性返回 materialAnalysis + finalReport
→ API 先完整校验两部分结果，再分别保存 D1
→ 前端通过 RiskTrace API 展示整体执行状态、材料分类和最终报告
```

整个流程不要求用户手工分类、确认材料理解结果或再次点击“发起审查”。材料理解和报告聚合属于同一个 Provider 执行实例，不拆成两次外部执行。

## 2. 当前 Demo 范围

当前版本必须实现：

- 创建采购项目时只填写项目标题；
- 一次选择并上传全部已有材料；
- 文件直接上传私有 Cloudflare R2；
- 上传完成后自动创建一个审查运行并通过当前配置的 Review Provider 启动执行；
- 自动生成材料名称、类别、逐文件摘要、项目摘要和完整性结果；
- 工作流运行期间只展示整体执行状态，完成后一次性展示材料理解结果和最终报告；
- 由路由 Agent 选择适用领域 Agent；
- 领域 Agent 结合材料对象和原始文件执行审查；
- 聚合 Agent 输出只读风险报告；
- Pages Functions 校验模型输出后写入 D1。

当前版本暂不实现：

- 用户手工分类或修改 AI 分类；
- 材料理解结果人工确认；
- 复杂逐字段事实表和精细证据模型；
- 规则配置中心；
- 风险确认、误报驳回、补件任务、付款控制和处置闭环；
- 复杂组织、角色和权限体系；
- 全量外部商业数据接口。

## 3. 领域术语

| 业务概念 | 界面名称 | 代码命名 |
|---|---|---|
| 顶层业务对象 | 采购项目 | `project` / `Project` / `projectId` |
| 一次自动化审查过程 | 合规审查 | `review` / `reviewRun` / `reviewRunId` |
| Provider 单次执行 | 工作流执行 | `providerExecuteId` / `executeId` |
| 材料理解中间输出 | 材料理解结果 | `materialAnalysis` |
| 最终检出结果 | 风险事项 | `riskFinding` / `RiskFinding` / `findingId` |
| 最终聚合输出 | 合规审查报告 | `reviewReport` / `ReviewReport` |

“风险发现”只用于描述识别动作，不作为实体名称；“标案”“采购事件”“风险事件”和 `case` 不作为新功能命名。

## 4. 系统架构

```text
Vue 3 Web 应用
        │ REST API
Cloudflare Pages Functions
        ├─ Cloudflare D1：项目、文件、审查运行、中间结果和最终报告
        ├─ Cloudflare R2：原始材料、派生件和可选调试输出
        └─ Review Provider
              ├─ Mock
              ├─ 讯飞星辰 Workflow
              └─ DeepSeek Harness
                    材料理解 → 路由 Agent → 领域 Agent → 聚合 Agent
```

Pages Functions 负责项目创建、上传编排、R2 短时访问、Provider 启动、同一 `executeId` 的状态同步、模型结果校验、幂等保存和稳定 API 输出。前端不得直接访问 D1、R2 或任何外部模型/工作流平台。

## 5. 技术栈

### 前端

- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- Element Plus
- Element Plus Icons
- UnoCSS
- 原生 Fetch 统一封装

### Cloudflare 与后端

- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare Workers Runtime
- Cloudflare D1
- Cloudflare R2
- Wrangler
- D1 Migrations

### 外部工作流 / Agent Runtime

- 业务层只依赖统一 `ReviewProvider` 接口；
- `REVIEW_PROVIDER=mock|xingchen|deepseek-harness` 选择实现；
- 讯飞星辰 Provider 负责星辰专有认证、参数名和 Workflow API；
- DeepSeek Harness Provider 负责 Harness HTTP 契约和运行状态归一化；
- 一次审查运行持久化 `provider_name + provider_execute_id`，运行中的任务不会因默认 Provider 切换而串到另一平台；
- 材料理解结果和最终报告由同一次 Provider 执行在成功终态一次性返回。
- 前端和业务 API 只暴露材料理解、审查阶段和报告等业务语义，不暴露或判断具体 Provider。

## 6. 目标页面与路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/dashboard` | 审查总览 | 展示项目状态、审查进度、报告与风险事项统计 |
| `/projects` | 采购项目列表 | 查询项目和进入新建流程 |
| `/projects/new` | 新建采购项目 | 填写项目标题并一次性上传材料 |
| `/projects/:projectId/upload` | 项目材料与审查进度 | 上传材料、轮询工作流状态，并在完成后展示材料理解结果 |
| `/projects/:projectId/report` | 合规审查报告 | 展示只读风险报告和关联文件 |
| `/foundation` | 设计系统 | 仅开发环境使用的基础组件预览 |

处置中心和规则中心不属于当前 Demo 范围，不应作为当前版本的业务导航或开发目标。

当前仓库已经完成前端工程底座、审查总览与采购项目四个主流程页面、项目/上传/统计 API、D1/R2 读写、统一 Review Provider、异步结果查询、结果校验和报告读取。

## 7. 目录约定

```text
src/views/              路由级页面
src/layouts/            应用壳层
src/components/common/  通用基础组件
src/components/<domain> 领域复用组件
src/api/modules/        类型化前端 API
src/stores/             跨路由共享状态
src/types/              跨模块类型
src/constants/          稳定配置和枚举映射
src/icons/              图标统一出口
src/mocks/              明确标识的演示数据
src/styles/             全局设计系统
functions/api/          对外 REST API
functions/_shared/      后端共享能力、Provider、校验和持久化
```

具体规则见 `AGENTS.md` 和 `docs/FILE_STRUCTURE.md`。

## 8. 环境要求

- Node.js：以 `package.json` 的 `engines` 字段为准；
- 包管理器：pnpm；
- Cloudflare 本地联调：Wrangler。

安装依赖：

```bash
pnpm install
```

启动纯前端开发环境：

```bash
pnpm dev
```

联调 Pages Functions 与本地 Cloudflare 资源：

```bash
pnpm cf:dev
```

## 9. 质量检查与构建

执行完整检查：

```bash
pnpm check
```

包含：

- Vue 与前端 TypeScript 类型检查；
- Pages Functions TypeScript 类型检查；
- OXLint；
- ESLint；
- Prettier；
- Vite 构建。

单独构建：

```bash
pnpm build
```

## 10. D1 与部署命令

创建迁移：

```bash
pnpm db:migration:create <migration-name>
```

应用本地迁移：

```bash
pnpm db:migrate:local
```

应用远程迁移：

```bash
pnpm db:migrate:remote
```

部署到 Cloudflare Pages：

```bash
pnpm cf:deploy
```

## 11. 开发前必读

- `docs/Demo应用设计方案.md`：当前 Demo 的业务范围、单工作流链路和数据设计；
- `docs/BACKEND_MVP.md`：后端部署、环境变量、工作流输入输出和 API 联调说明；
- `AGENTS.md`：AI 与人工开发必须遵守的工程契约；
- `AI_FRONTEND_STANDARD.md`：前端开发速查；
- `docs/FRONTEND_DESIGN_SYSTEM.md`：设计系统；
- `docs/ICON_SYSTEM.md`：图标规范；
- `docs/API_CONVENTIONS.md`：接口规范；
- `docs/ERROR_HANDLING_AND_OBSERVABILITY.md`：错误处理与观测；
- `docs/FILE_STRUCTURE.md`：目录职责。

## 12. 核心工程规则

- 顶层业务对象统一使用“采购项目”和 `project` 命名；
- 一个审查运行只启动一次从材料理解贯通到报告聚合的 Provider 执行；
- 不得为材料理解和领域审查分别创建两个 Provider 执行或两个 `executeId`；
- Provider 成功后必须一次性返回材料理解结果和最终报告，两部分完整校验后再分别幂等保存；
- Vue 组件和 Pinia Store 不得直接调用 `fetch`；
- 浏览器请求统一经过 `src/api/request.ts` 与 `src/api/modules/`；
- 前端不得直接访问数据库、对象存储或外部工作流；
- 外部工作流输出必须经过字段、枚举、长度和文档归属校验；
- 模型不得修改项目标题、文件名、`documentId`、R2 Key 或系统状态；
- 优先复用 `src/components/common/` 和 `src/styles/tokens.css`；
- 演示数据只能放在 `src/mocks/` 或明确的后端演示模块；
- 数据页面必须覆盖加载、成功、空数据和错误状态；
- 不得引入第二套 UI 框架、状态库或 HTTP 客户端；
- 密钥、签名 URL 和工作流内部配置不得提交到仓库、写入前端或输出到日志。
