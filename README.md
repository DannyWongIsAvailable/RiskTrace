# RiskTrace

RiskTrace 是面向企业采购项目的智能合规审查 Demo。用户填写项目标题并上传当前已有材料后，系统只创建一个 DeepSeek Harness Run；Pages Functions 持续读取同一个 Run 的状态与 Session Event，最终保存材料理解和合规审查报告。DeepSeek Harness 是唯一运行时，不再通过 `REVIEW_PROVIDER` 在 Mock / 星辰 / Harness 间切换。

> 仓库地址：https://github.com/DannyWongIsAvailable/RiskTrace.git  
> 线上地址：https://risktrace.pages.dev/

完整产品范围和实现口径见：`docs/Demo应用设计方案.md`。

## 当前 MVP 开发模式

当前前端保留“审查总览 → 项目列表 → 新建项目 → 上传材料 → 执行过程 → 查看报告”主链页面。上传材料与 Harness 执行过程使用独立路由；审查开始后可从项目列表随时重新进入执行过程追溯 Session Event，也可在完成后独立查看报告。项目、文件和结果通过 Pages Functions、D1 与 R2 真实读写。`POST /api/projects/:projectId/uploads/complete` 只负责创建一次 DeepSeek Harness Run；浏览器随后通过 RiskTrace API 增量读取该 Run 的 Session Event，并以 Harness Trajectory 形式展示真实 Turn / Step / Assistant / Tool / Todo 轨迹。

工作过程可视化与事件投影约束见 `docs/RiskTrace_DeepSeek_Harness_工作过程可视化重构设计.md`。

## 1. 核心链路

```text
用户填写项目标题
→ 一次性上传全部材料
→ 上传批次完成后创建一个 RiskTrace review run
→ Pages Functions 创建且只创建一个 DeepSeek Harness Run
→ Python Harness gateway 接收并持久化完整 Session Event
→ Vue 增量读取 /review/events 并 replay Turn / Step / Tool / Assistant / Todo
→ 同一 Harness Run 完成材料理解、自动分类、领域审查和报告聚合
→ Harness completed 后校验 materialAnalysis + finalReport 并保存 D1
→ 审查完成后继续保留该次 Session Trajectory 用于追溯
```

整个流程不要求用户手工分类、确认材料理解结果或再次点击“发起审查”。一个审查尝试只创建一个 Harness Run；状态查询与 Event replay 都针对同一个 `provider_execute_id`，轮询不得创建第二次执行。

## 2. 当前 Demo 范围

当前版本必须实现：

- 创建采购项目时只填写项目标题；
- 一次选择并上传全部已有材料；
- 文件直接上传私有 Cloudflare R2；
- 上传完成后自动创建一个审查运行并启动唯一的 DeepSeek Harness 执行；
- 自动生成材料名称、类别、逐文件摘要、项目摘要和完整性结果；
- Harness 运行期间展示真实 Session Event 工作轨迹，完成后继续保留轨迹并开放材料理解结果和最终报告；
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
| Harness 单次执行 | Harness Run | `providerExecuteId` / `executeId` |
| 材料理解中间输出 | 材料理解结果 | `materialAnalysis` |
| 最终检出结果 | 风险事项 | `riskFinding` / `RiskFinding` / `findingId` |
| 最终聚合输出 | 合规审查报告 | `reviewReport` / `ReviewReport` |

“风险发现”只用于描述识别动作，不作为实体名称；“标案”“采购事件”“风险事件”和 `case` 不作为新功能命名。

## 4. 系统架构

```text
Vue 3 Web 应用
        │ RiskTrace REST API
Cloudflare Pages Functions
        ├─ Cloudflare D1：项目、文件、审查运行、中间结果和最终报告
        ├─ Cloudflare R2：原始材料、派生件和可选调试输出
        └─ DeepSeek Harness adapter
                 │ POST /runs + GET /runs/{id} + GET /runs/{id}/events
          Python Harness Gateway
                 │ JSON-RPC stdio / SDK
          DeepSeek Harness Session
                 └─ append-only Session Event Log
```

Pages Functions 负责项目创建、上传编排、R2 短时访问、创建唯一 Harness Run、状态同步、事件安全投影、模型结果校验、幂等保存和稳定 API 输出。浏览器不直接访问 Harness Base URL/API Key，只调用 RiskTrace `/review` 与 `/review/events`。

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

- DeepSeek Harness 是唯一 Agent Runtime；`REVIEW_PROVIDER` 不再参与运行时选择；
- Pages Functions 直接使用 `DeepSeekHarnessReviewProvider` 作为 Harness HTTP adapter；
- 一个审查尝试持久化一个 `provider_execute_id`，状态查询与事件读取始终复用该 ID；
- Python gateway 将完整 SessionEvent JSON 按 `(run_id, seq)` 幂等持久化并支持增量 replay；
- 浏览器事件接口保留官方 event vocabulary/envelope，但会移除私有 reasoning、System Prompt、密钥与签名 URL；
- 材料理解结果和最终报告只在 Harness root turn 明确 `completed` 且输出通过业务校验后保存。

## 6. 目标页面与路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/dashboard` | 审查总览 | 展示项目状态、审查进度、报告与风险事项统计 |
| `/projects` | 采购项目列表 | 查询项目和进入新建流程 |
| `/projects/new` | 新建采购项目 | 填写项目标题并一次性上传材料 |
| `/projects/:projectId/upload` | 项目材料上传 | 选择并上传项目材料，提交后进入独立执行过程页 |
| `/projects/:projectId/review` | 合规审查执行过程 | 实时或历史回放 Session Event 工作过程，并在完成后展示材料理解结果 |
| `/projects/:projectId/report` | 合规审查报告 | 展示只读风险报告和关联文件 |
| `/foundation` | 设计系统 | 仅开发环境使用的基础组件预览 |

处置中心和规则中心不属于当前 Demo 范围，不应作为当前版本的业务导航或开发目标。

当前仓库已经完成前端工程底座、采购项目主流程、D1/R2 读写、DeepSeek Harness 异步 Run、Session Event replay、Trajectory 投影、结果校验和报告读取。

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
- 一个审查运行只启动一次从材料理解贯通到报告聚合的 DeepSeek Harness Run；
- 不得为材料理解和领域审查分别创建两个 Harness Run；一次 `/uploads/complete` 只允许一次 `POST /runs`；
- Harness root turn 明确 `completed` 后必须返回材料理解结果和最终报告，两部分完整校验后再分别幂等保存；
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
