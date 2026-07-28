# RiskTrace

RiskTrace 是一套基于 Vue 3 与 Cloudflare Pages 构建的采购到付款合规风险控制应用。

项目目标是将合同、订单、发票、验收材料和付款记录组织为统一采购事件，通过规则与智能分析发现跨环节风险，并提供证据追溯、人工复核和处置闭环能力。

## 1. 技术栈

### 前端

- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- Element Plus
- Element Plus Icons（唯一通用图标库）
- UnoCSS
- 原生 Fetch 统一封装

### Cloudflare

- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare Workers Runtime
- Cloudflare D1
- Wrangler
- D1 Migrations

## 2. 环境要求

- Node.js：以 `package.json` 中的 `engines` 字段为准；
- 包管理器：pnpm；
- Cloudflare 本地联调：Wrangler。

## 3. 安装依赖

```bash
pnpm install
```

## 4. 本地开发

启动纯前端开发环境：

```bash
pnpm dev
```

默认访问地址由 Vite 在终端中输出。

联调 Cloudflare Pages Functions 与本地 D1：

```bash
pnpm cf:dev
```

## 5. 构建与质量检查

执行完整检查：

```bash
pnpm check
```

完整检查包含：

- Vue 与前端 TypeScript 类型检查；
- Pages Functions TypeScript 类型检查；
- OXLint；
- ESLint；
- Prettier 格式检查；
- Vite 构建。

单独构建：

```bash
pnpm build
```

## 6. Cloudflare 与 D1 常用命令

创建迁移：

```bash
pnpm db:migration:create <迁移名称>
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

## 7. 当前页面入口

- `/dashboard`：风险驾驶舱示例；
- `/foundation`：基础组件与统一视觉预览；
- `/cases`：采购事件业务入口；
- `/tasks`：处置任务业务入口；
- `/rules`：规则中心业务入口。

## 8. 开发前必读

在新增业务功能前，请阅读：

- `AGENTS.md`：AI 与人工开发必须遵守的工程契约；
- `AI_FRONTEND_STANDARD.md`：前端开发速查；
- `docs/FRONTEND_DESIGN_SYSTEM.md`：前端设计系统；
- `docs/ICON_SYSTEM.md`：Element Plus Icons 使用、语义映射、尺寸、颜色与无障碍规范；
- `docs/API_CONVENTIONS.md`：接口规范；
- `docs/FILE_STRUCTURE.md`：目录职责

## 9. 核心工程原则

- 业务组件不得直接调用 `fetch`；
- 接口统一通过 `src/api/request.ts` 和 `src/api/modules/`；
- 优先复用 `src/components/common/` 中的基础组件；
- 统一使用 `src/styles/tokens.css` 中的设计令牌；
- 通用图标只使用 `@element-plus/icons-vue`，并统一通过 `src/icons/index.ts` 访问；
- 禁止使用 Emoji、Unicode 符号、文字首字、CSS 图形或临时内联 SVG 作为通用产品图标；
- 品牌、业务流程、证据链和领域专属图形可使用集中管理的正式 SVG 静态资源；
- 开发阶段占位插图统一使用 `*-placeholder.svg` 命名，发布前必须替换或移除；
- 纯图标按钮必须使用统一组件并提供 Tooltip 与 `aria-label`；
- 演示数据必须放在 `src/mocks/`；
- 数据页面必须提供加载、空数据和错误状态；
- 不得引入第二套 UI 框架、状态库或 HTTP 客户端。
