# RiskTrace采购到付款合规风控平台

## 比赛MVP Demo设计方案

## 一、项目概述

### 1.1 产品名称

**RiskTrace——采购到付款全过程合规风控平台**

产品副标题：

> 基于多模态证据理解与多智能体协同的供应链合规控制层

### 1.2 一句话定位

RiskTrace连接企业现有ERP、SRM、合同和财务系统，对合同、订单、发票、验收材料和付款记录进行跨文档、跨流程联合分析，主动发现组合风险，生成可追溯证据链，并完成分级处置与审计留痕。

### 1.3 MVP不做什么

本项目不重新开发完整采购系统，也不在MVP阶段实现真实ERP连接、真实银行冻结、复杂用户权限体系或大规模机器学习训练。

MVP只验证四项核心价值：

1. 能否把合同、订单、发票、验收和付款数据组织为统一采购事件；
2. 能否发现单一系统难以识别的跨环节组合风险；
3. 能否说明风险来自哪些文件、字段、规则和业务行为；
4. 能否将风险判断转化为补件、复核、暂缓付款和重新评估动作。

---

# 二、MVP核心演示案例

## 2.1 案例名称

**海岳精密设备采购异常付款事件**

案例编号：

```text
RT-CASE-2026-001
```

## 2.2 案例背景

演示企业“华南智造有限公司”向“海岳精密设备有限公司”采购一批工业传感器，合同金额为人民币1,480,000元。

企业采购制度规定：

* 单笔或同一项目累计采购金额达到500,000元时，必须经过采购总监和财务总监联合审批；
* 禁止拆分订单规避审批；
* 付款前必须具备有效合同、发票和验收材料；
* 付款账户必须与合同备案账户一致；
* 收款账户发生变更时，必须提交加盖供应商公章的账户变更函并重新审批；
* 首次付款不得超过合同金额的90%，剩余10%作为质保金。

## 2.3 演示数据

### 合同

```text
合同编号：HT-2026-0715
供应商：海岳精密设备有限公司
合同金额：¥1,480,000
首次付款比例：90%
质保金比例：10%
合同收款账户尾号：3028
付款前置条件：验收合格并取得有效发票
```

### 采购订单

同一采购人员在48小时内创建三笔订单：

| 订单编号            |       金额 | 创建时间       |
| --------------- | -------: | ---------- |
| PO-2026-0718-01 | ¥492,000 | 7月18日09:21 |
| PO-2026-0718-02 | ¥488,000 | 7月18日15:36 |
| PO-2026-0719-01 | ¥499,000 | 7月19日10:07 |

订单总金额为：

```text
¥1,479,000
```

每笔订单均低于500,000元审批阈值，但采购项目、供应商、物料类别、申请人和交付地址完全相同。

### 发票

```text
发票金额：¥1,479,000
销售方：海岳精密设备有限公司
购买方：华南智造有限公司
发票状态：已验真
```

### 验收材料

系统发现：

* 付款申请提交时，验收报告尚未上传；
* 验收报告在付款被提示风险后才补充上传；
* 报告填写的验收日期早于文件实际上传时间；
* 验收图片与另一个历史项目的图片高度相似。

MVP不需要实现高精度图像鉴伪，可以直接使用预先计算的图片相似度结果：

```text
图片相似度：94.7%
```

### 付款申请

```text
付款申请编号：PAY-2026-0725-01
付款金额：¥1,331,100
实际收款账户尾号：7619
合同账户尾号：3028
付款状态：待支付
```

付款金额本身等于订单总金额的90%，比例没有问题，但实际收款账户与合同不一致，且没有账户变更函。

---

# 三、系统最终应识别的风险

## 3.1 原子风险信号

系统需要识别以下风险信号：

| 风险编号  | 风险信号           | 建议权重 |
| ----- | -------------- | ---: |
| R-001 | 疑似拆单规避高级审批     |   30 |
| R-002 | 实际付款账户与合同账户不一致 |   35 |
| R-003 | 付款申请时缺少有效验收材料  |   25 |
| R-004 | 验收报告存在事后补录迹象   |   20 |
| R-005 | 验收图片与历史项目高度相似  |   20 |

## 3.2 风险融合结论

系统不应只显示五条独立告警，而应将其融合为一个风险事件：

> 同一采购项目被拆分为三笔低于审批阈值的订单，付款申请使用了合同外收款账户，且付款申请提交时缺少有效验收材料。后续补充的验收报告存在事后补录和图片复用迹象。多项信号共同表明该付款可能存在规避审批、材料补录或收款账户异常风险。

综合风险分数：

```text
92 / 100
```

风险等级：

```text
重大风险
```

推荐动作：

```text
暂缓付款
要求补充账户变更函
升级合规负责人复核
核验验收报告真实性
```

---

# 四、端到端演示故事线

MVP演示围绕一个案例完成，不需要频繁切换多个零散功能。

```text
导入演示案例
    ↓
建立采购事件数字档案
    ↓
数据感知Agent解析五类材料
    ↓
合同义务Agent生成付款控制条件
    ↓
交易核验Agent执行五链匹配
    ↓
流程行为Agent发现拆单与补录
    ↓
风险研判Agent融合证据并评级
    ↓
处置编排Agent建议暂缓付款
    ↓
合规人员确认处置
    ↓
补充账户变更函并重新评估
    ↓
记录人工反馈与完整审计日志
```

建议整段路演控制在3至5分钟。

---

# 五、系统页面设计

## 5.1 全局布局

采用企业后台管理系统布局：

```text
┌─────────────────────────────────────────────┐
│ 顶部栏：RiskTrace / 当前企业 / 演示模式 / 用户 │
├──────────┬──────────────────────────────────┤
│ 左侧菜单  │ 主内容区                           │
│          │                                  │
│ 风险总览  │                                  │
│ 采购事件  │                                  │
│ 处置中心  │                                  │
│ 规则中心  │                                  │
│ 学习记录  │                                  │
└──────────┴──────────────────────────────────┘
```

建议视觉风格：

* 主色：深蓝色，体现企业级和可信感；
* 低风险：绿色；
* 中风险：黄色；
* 高风险：橙色；
* 重大风险：红色；
* 背景使用浅灰色，内容区域采用白色卡片；
* 避免过度使用科技发光、渐变和大面积动画。

---

## 5.2 页面一：风险驾驶舱

路由：

```text
/dashboard
```

### 页面目标

让评委在10秒内理解系统处理什么问题、当前发现了多少风险、重大风险在哪里。

### 页面内容

顶部指标卡：

```text
今日分析采购事件：26
发现风险事件：8
重大风险：2
待人工复核：5
已阻止风险付款：¥2,816,400
```

中部左侧展示“采购到付款流程风险分布”：

```text
合同审查       2
订单与审批     5
发票核验       1
验收核验       3
付款控制       4
```

中部右侧展示高风险事件列表：

```text
RT-CASE-2026-001
海岳精密设备采购异常付款事件
风险分数：92
状态：待处置
涉及金额：¥1,331,100
```

底部展示最近Agent执行记录：

```text
10:21 交易核验Agent发现收款账户不一致
10:21 流程行为Agent发现疑似拆单
10:22 风险研判Agent生成重大风险事件
10:22 处置编排Agent建议暂缓付款
```

### 核心交互

点击“查看风险事件”进入案例详情页。

---

## 5.3 页面二：采购事件列表

路由：

```text
/cases
```

### 页面内容

筛选条件：

* 事件编号；
* 供应商；
* 风险等级；
* 流程状态；
* 处置状态；
* 日期范围。

表格字段：

| 字段   | 说明               |
| ---- | ---------------- |
| 事件编号 | RT-CASE-2026-001 |
| 项目名称 | 工业传感器采购          |
| 供应商  | 海岳精密设备有限公司       |
| 合同金额 | ¥1,480,000       |
| 风险等级 | 重大               |
| 风险分数 | 92               |
| 当前阶段 | 付款申请             |
| 处置状态 | 待复核              |
| 更新时间 | 2026-07-25 10:22 |

顶部提供两个按钮：

```text
导入演示案例
新建分析
```

“导入演示案例”应当一键写入预设数据，使演示环境可以随时恢复。

---

## 5.4 页面三：新建分析任务

路由：

```text
/cases/new
```

### 上传区域

按业务类别提供五个卡片：

```text
合同文件
采购订单
发票
验收材料
付款申请
```

另有一个可选区域：

```text
企业采购管理制度
```

支持格式：

```text
PDF、PNG、JPG、CSV、JSON
```

### MVP实现策略

比赛固定案例使用内置示例文件。上传页面主要用于展示完整产品形态。

用户点击“使用演示数据”后，系统自动填充六份材料，并显示：

```text
已识别合同：1份
已识别采购订单：3笔
已识别发票：1张
已识别验收报告：1份
已识别付款申请：1笔
已加载企业制度：1份
```

随后点击：

```text
开始智能分析
```

---

## 5.5 页面四：智能分析过程页

路由：

```text
/cases/:id/analyzing
```

这是体现“多智能体协同”的主要页面。

### 页面结构

上方为流程步骤：

```text
数据解析
合同义务抽取
交易一致性核验
流程行为分析
证据融合
处置建议
```

下方展示六个Agent卡片。

### Agent卡片示例

```text
交易核验Agent
状态：分析完成
耗时：0.8秒
输入：合同、订单、发票、付款申请
发现：
- 实际账户与合同账户不一致
- 订单总额与发票金额一致
- 付款比例符合90%约定
```

### 交互形式

前端依次调用每个Agent步骤接口，每完成一个步骤更新状态：

```text
等待执行 → 正在分析 → 分析完成
```

不要仅用固定计时器播放假动画。每个步骤都应在D1中创建真实的`agent_runs`记录，并返回真实结构化结果。

---

## 5.6 页面五：风险事件详情页

路由：

```text
/cases/:id
```

这是整个MVP最重要的页面。

建议采用三栏布局：

```text
┌──────────────┬────────────────────┬──────────────────┐
│ 业务材料      │ 风险证据链          │ 综合研判与处置    │
│              │                    │                  │
│ 合同          │ 拆单风险            │ 风险分数：92      │
│ 订单          │ 账户风险            │ 风险等级：重大    │
│ 发票          │ 验收风险            │ 建议：暂缓付款    │
│ 验收          │ 规则依据            │ 操作按钮          │
│ 付款          │ Agent结论           │                  │
└──────────────┴────────────────────┴──────────────────┘
```

### 左侧：业务材料

使用标签页切换：

```text
合同
订单
发票
验收报告
付款申请
企业制度
```

合同和制度页面应支持高亮证据位置，例如：

```text
第8.2条：付款账户应为本合同约定账户……
第9.1条：货物验收合格后支付90%……
```

订单页面突出显示三笔金额均低于审批阈值。

付款页面同时展示：

```text
合同账户：****3028
实际账户：****7619
```

### 中间：风险证据链

不必引入复杂图谱库，可使用Vue组件和SVG连线实现。

```text
采购项目
   │
   ├── 三笔订单均低于¥500,000
   │       └── 命中规则：禁止拆单规避审批
   │
   ├── 合同账户尾号3028
   │       └── 实际付款账户尾号7619
   │
   └── 付款申请时间：7月25日09:12
           └── 验收材料上传：7月25日10:04
                   └── 图片相似度94.7%
```

每条证据都应支持点击，并跳转到左侧对应材料。

### 右侧：综合研判

展示内容：

```text
风险等级：重大风险
风险分数：92
模型置信度：91%
建议动作：暂缓付款
必须人工复核：是
```

研判摘要下方展示：

* 触发规则；
* 缺失材料；
* Agent意见；
* 推荐操作。

操作按钮：

```text
暂缓付款
要求补件
升级复核
确认放行
```

“确认放行”需要填写理由，避免一键绕过风险。

---

## 5.7 页面六：处置中心

路由：

```text
/tasks
```

展示待处理工单：

```text
工单：TASK-2026-001
关联事件：RT-CASE-2026-001
任务类型：重大风险复核
建议动作：暂缓付款
负责人：合规经理
状态：待处理
```

工单详情支持：

* 查看证据；
* 添加处理意见；
* 要求补充账户变更函；
* 暂缓付款；
* 关闭风险；
* 重新发起评估。

---

## 5.8 页面七：规则与学习记录

路由：

```text
/rules
/feedback
```

### 规则中心

MVP展示5至8条规则即可：

```text
P2P-001：同一项目累计采购金额达到¥500,000时触发高级审批
P2P-002：禁止将同一采购项目拆分规避审批
P2P-003：付款账户必须与合同备案账户一致
P2P-004：付款前必须具备有效验收材料
P2P-005：首次付款比例不得超过合同金额90%
```

### 学习记录

展示人工反馈如何进入后续研判：

```text
AI结论：合同外账户，高风险
人工结论：风险成立
处理结果：供应商补充账户变更函后重新审批
系统更新：案例进入“账户变更”相似案例库
```

MVP只更新反馈记录、案例标签和统计数据，不需要真正在线训练模型。

---

# 六、多智能体设计

## 6.1 智能体不是六个独立服务

在MVP中，六个Agent是六个明确的业务分析模块，由一个编排器统一调用。它们可以运行在同一个Pages Functions项目中，无须部署六套后端。

## 6.2 Agent划分

### 数据感知Agent

职责：

* 识别材料类别；
* 解析结构化字段；
* 统一企业名称、金额、日期和账户格式；
* 建立文档与采购事件的关联。

输出：

```json
{
  "documentType": "contract",
  "entities": {
    "contractNo": "HT-2026-0715",
    "supplierName": "海岳精密设备有限公司",
    "amount": 1480000,
    "bankAccountLast4": "3028"
  }
}
```

### 合同义务Agent

职责：

* 抽取付款条件；
* 抽取验收条件；
* 抽取质保金比例；
* 抽取收款账户；
* 将合同条款转成候选控制规则。

输出：

```json
{
  "obligations": [
    {
      "type": "PAYMENT_PREREQUISITE",
      "description": "付款前必须完成验收并取得有效发票",
      "sourceLocator": "合同第9.1条"
    }
  ]
}
```

### 交易核验Agent

职责：

* 比较合同、订单、发票和付款金额；
* 比较供应商主体；
* 比较银行账户；
* 计算累计付款比例；
* 执行五链一致性检查。

### 流程行为Agent

职责：

* 识别短时间内重复创建订单；
* 识别拆单规避审批；
* 识别先付款申请、后补验收；
* 识别倒签和异常补录；
* 识别同一用户职责冲突。

### 风险研判Agent

职责：

* 合并重复风险信号；
* 计算风险分数；
* 判断风险等级；
* 生成有依据的研判摘要；
* 列出缺失信息。

### 处置编排Agent

职责：

* 根据风险等级匹配处置策略；
* 创建复核工单；
* 生成补件清单；
* 建议暂缓付款或升级审批；
* 记录所有操作。

---

# 七、风险评分设计

建议使用“规则权重×置信度＋组合加分”的透明算法。

```text
基础分 = Σ（风险权重 × 信号置信度）
```

组合风险额外加分：

```text
拆单风险 + 账户异常：+10
账户异常 + 缺少验收：+10
验收补录 + 图片复用：+10
```

最后限制为：

```text
riskScore = min(100, 基础分 + 组合加分)
```

风险等级：

|     分数 | 等级   |
| -----: | ---- |
|   0—29 | 低风险  |
|  30—59 | 中风险  |
|  60—79 | 高风险  |
| 80—100 | 重大风险 |

每次评分必须保存评分明细，不允许只保存最终分数。

---

# 八、技术架构

## 8.1 总体架构

```text
Vue 3前端
    │
    │ 原生Fetch
    ▼
Cloudflare Pages Functions
    │
    ├── REST API
    ├── Agent编排器
    ├── 确定性规则引擎
    ├── AI模型适配器
    └── 审计日志模块
            │
            ▼
       Cloudflare D1
```

Cloudflare Pages Functions根据`functions`目录结构生成文件路由，与你当前的`functions/api/health.ts`模式一致。([Cloudflare Docs][1])

## 8.2 混合智能分析原则

```text
确定性问题 → TypeScript规则
复杂语义问题 → 大模型
文档字段识别 → OCR或内置演示结果
风险融合 → 规则评分＋大模型摘要
```

适合规则判断的内容：

* 金额比较；
* 日期先后；
* 账户一致性；
* 付款比例；
* 订单累计；
* 审批阈值；
* 材料是否缺失。

适合大模型判断的内容：

* 合同付款条件抽取；
* 合同义务归纳；
* 模糊条款风险；
* 多项风险的自然语言解释；
* 补件建议生成。

---

# 九、前端目录设计

```text
src/
├── api/
│   ├── request.ts
│   ├── dashboard.ts
│   ├── cases.ts
│   ├── analysis.ts
│   ├── tasks.ts
│   └── rules.ts
├── assets/
├── components/
│   ├── common/
│   │   ├── PageHeader.vue
│   │   ├── StatusTag.vue
│   │   └── EmptyState.vue
│   ├── dashboard/
│   │   ├── MetricCard.vue
│   │   └── RiskDistribution.vue
│   ├── case/
│   │   ├── CaseSummary.vue
│   │   ├── DocumentViewer.vue
│   │   ├── EvidenceChain.vue
│   │   └── RiskDecisionPanel.vue
│   ├── agent/
│   │   ├── AgentStepCard.vue
│   │   └── AgentTimeline.vue
│   └── task/
│       └── DispositionDialog.vue
├── layouts/
│   └── AppLayout.vue
├── router/
│   └── index.ts
├── stores/
│   ├── app.ts
│   ├── case.ts
│   └── analysis.ts
├── types/
│   ├── api.ts
│   ├── case.ts
│   ├── risk.ts
│   └── agent.ts
├── views/
│   ├── DashboardView.vue
│   ├── CaseListView.vue
│   ├── CaseCreateView.vue
│   ├── CaseAnalyzingView.vue
│   ├── CaseDetailView.vue
│   ├── TaskCenterView.vue
│   ├── RuleCenterView.vue
│   └── FeedbackView.vue
├── App.vue
└── main.ts
```

## 9.1 前端路由

```ts
/dashboard
/cases
/cases/new
/cases/:id
/cases/:id/analyzing
/tasks
/rules
/feedback
```

`App.vue`只保留：

```vue
<template>
  <RouterView />
</template>
```

---

# 十、后端Functions目录设计

```text
functions/
├── _shared/
│   ├── db.ts
│   ├── response.ts
│   ├── validation.ts
│   ├── audit.ts
│   ├── risk-score.ts
│   ├── seed-case.ts
│   └── ai/
│       ├── provider.ts
│       ├── prompts.ts
│       └── validators.ts
├── api/
│   ├── health.ts
│   ├── dashboard.ts
│   ├── demo/
│   │   └── seed.ts
│   ├── cases/
│   │   ├── index.ts
│   │   └── [id]/
│   │       ├── index.ts
│   │       ├── documents.ts
│   │       ├── risks.ts
│   │       ├── actions.ts
│   │       └── analysis-runs.ts
│   ├── analysis-runs/
│   │   └── [runId]/
│   │       ├── index.ts
│   │       └── steps/
│   │           └── [stepKey].ts
│   ├── tasks/
│   │   ├── index.ts
│   │   └── [id].ts
│   ├── rules/
│   │   └── index.ts
│   └── feedback/
│       └── index.ts
├── env.d.ts
└── types.d.ts
```

---

# 十一、REST API设计

## 11.1 仪表盘

```text
GET /api/dashboard
```

返回指标、风险分布、重大风险列表和最近Agent活动。

## 11.2 案例管理

```text
GET  /api/cases
POST /api/cases
GET  /api/cases/:id
```

## 11.3 导入演示案例

```text
POST /api/demo/seed
```

作用：

* 清理旧演示数据；
* 创建固定案例；
* 创建合同、订单、发票、验收和付款记录；
* 写入基础规则；
* 返回案例ID。

## 11.4 分析任务

```text
POST /api/cases/:id/analysis-runs
GET  /api/analysis-runs/:runId
POST /api/analysis-runs/:runId/steps/:stepKey
```

步骤键：

```text
ingestion
contract-obligation
transaction-match
process-behavior
risk-fusion
disposition
```

前端依次执行步骤接口，可以稳定展示真实Agent进度。

## 11.5 风险处置

```text
POST /api/cases/:id/actions
```

请求示例：

```json
{
  "actionType": "HOLD_PAYMENT",
  "comment": "收款账户与合同不一致，暂缓付款并要求供应商补充账户变更函。"
}
```

## 11.6 反馈

```text
POST /api/feedback
```

请求示例：

```json
{
  "riskEventId": "risk-event-id",
  "decision": "CONFIRMED",
  "reason": "供应商账户变更未经过重新审批",
  "resolution": "补充账户变更函并重新发起审批"
}
```

---

# 十二、D1数据库设计

当前项目已经在`wrangler.jsonc`中配置了`risktrace_db`绑定；Pages Functions可以通过`context.env.risktrace_db`访问D1。([GitHub][2])

## 12.1 cases

```sql
CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  case_no TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  project_name TEXT,
  supplier_name TEXT,
  contract_amount INTEGER NOT NULL DEFAULT 0,
  payment_amount INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'pending',
  risk_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

金额统一使用“分”为单位存储，避免浮点误差。

## 12.2 documents

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  asset_url TEXT,
  mime_type TEXT,
  file_hash TEXT,
  extracted_text TEXT,
  structured_data TEXT,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);
```

`structured_data`使用JSON字符串保存演示阶段的结构化识别结果。

## 12.3 transactions

```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  business_no TEXT,
  amount INTEGER,
  supplier_name TEXT,
  bank_account_last4 TEXT,
  business_date TEXT,
  operator_name TEXT,
  raw_data TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);
```

## 12.4 rules

```sql
CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  weight INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  configuration TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 12.5 risk_signals

```sql
CREATE TABLE risk_signals (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  rule_id TEXT,
  signal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence REAL NOT NULL,
  weight INTEGER NOT NULL,
  score REAL NOT NULL,
  source_data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);
```

## 12.6 risk_events

```sql
CREATE TABLE risk_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  confidence REAL NOT NULL,
  recommended_actions TEXT NOT NULL,
  review_required INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);
```

## 12.7 evidence_links

```sql
CREATE TABLE evidence_links (
  id TEXT PRIMARY KEY,
  risk_event_id TEXT NOT NULL,
  risk_signal_id TEXT,
  document_id TEXT,
  evidence_type TEXT NOT NULL,
  label TEXT NOT NULL,
  source_locator TEXT,
  evidence_value TEXT,
  created_at TEXT NOT NULL
);
```

## 12.8 agent_runs

```sql
CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL,
  input_summary TEXT,
  output_data TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT
);
```

## 12.9 actions

```sql
CREATE TABLE actions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  risk_event_id TEXT,
  action_type TEXT NOT NULL,
  action_status TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL
);
```

## 12.10 audit_logs

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  case_id TEXT,
  actor_type TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
```

建议为以下字段建立索引：

```sql
CREATE INDEX idx_cases_risk_level ON cases(risk_level);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_documents_case_id ON documents(case_id);
CREATE INDEX idx_transactions_case_id ON transactions(case_id);
CREATE INDEX idx_risk_signals_case_id ON risk_signals(case_id);
CREATE INDEX idx_agent_runs_run_id ON agent_runs(run_id);
CREATE INDEX idx_audit_logs_case_id ON audit_logs(case_id);
```

---

# 十三、文件存储策略

当前技术栈只有D1，没有R2。

MVP阶段建议：

* 演示合同、发票和验收报告放在`public/demo/RT-CASE-2026-001/`；
* D1只存文件地址、哈希、解析文本和结构化结果；
* 用户临时上传的文件只在当前请求中处理，不把二进制内容写入D1；
* 限制单文件不超过10MB；
* 生产版再增加Cloudflare R2保存原始文件。

R2是Cloudflare面向非结构化对象的存储能力，比把PDF和图片二进制直接写进D1更符合职责划分。Workers运行时内存为128MB，官方也建议避免将大文件完整缓冲进内存，因此上传接口应检查文件大小并尽量流式处理。([Cloudflare Docs][3])

---

# 十四、AI接口设计

## 14.1 环境变量

`.dev.vars`：

```text
APP_ENV=development
DEMO_MODE=true
AI_PROVIDER=fixture
AI_API_BASE=
AI_API_KEY=
AI_MODEL=
```

Cloudflare生产环境使用Secrets：

```bash
wrangler pages secret put AI_API_KEY
```

## 14.2 Provider适配层

```ts
interface AiProvider {
  extractContractObligations(input: ContractInput): Promise<ContractOutput>
  generateRiskSummary(input: RiskSummaryInput): Promise<RiskSummaryOutput>
  generateDisposition(input: DispositionInput): Promise<DispositionOutput>
}
```

提供两种实现：

```text
FixtureAiProvider
RemoteAiProvider
```

### FixtureAiProvider

读取内置JSON结果，保证：

* 没有API密钥也能演示；
* 网络不稳定时不会中断；
* 每次演示结果一致；
* 可以完整展示Agent协同逻辑。

### RemoteAiProvider

使用原生`fetch`调用实际大模型接口。

比赛演示可在界面右上角显示：

```text
AI模式：实时模型
AI模式：稳定演示
```

不要在路演时隐瞒演示数据和预设结果。可以说明：

> 为保证现场稳定，系统支持实时模型与可复现演示两种运行模式，二者使用同一结构化输出协议。

## 14.3 输出约束

所有AI输出必须是结构化JSON，并经过字段校验。

错误时不得直接展示模型原始文本，应回退到：

* 确定性规则结论；
* 内置演示结果；
* 人工复核状态。

---

# 十五、系统稳定性设计

## 15.1 一键重置

页面顶部增加：

```text
重置演示数据
```

调用：

```text
POST /api/demo/seed?reset=true
```

确保每次演示前都恢复到相同状态。

## 15.2 双模式运行

```text
实时分析模式
稳定演示模式
```

稳定演示模式使用预置OCR和模型输出，但规则匹配、数据库写入、风险计算、工单创建和审计日志必须真实执行。

## 15.3 错误降级

外部模型失败时：

```text
模型调用失败
→ 保存错误日志
→ 使用确定性风险信号
→ 风险状态标记为“需人工复核”
→ 页面继续运行
```

## 15.4 接口统一响应

沿用现有`request.ts`协议：

成功：

```json
{
  "success": true,
  "data": {}
}
```

失败：

```json
{
  "success": false,
  "code": "CASE_NOT_FOUND",
  "message": "未找到采购事件"
}
```

---

# 十六、比赛现场演示脚本

## 第一幕：风险总览

打开风险驾驶舱：

> RiskTrace持续监控采购到付款全过程。当前系统发现两项重大风险，其中海岳精密设备采购项目涉及一笔133.11万元的待付款申请。

点击该风险事件。

## 第二幕：展示业务材料

> 这笔付款表面上金额、发票和供应商名称均正常，传统三单匹配可能允许其继续付款。但RiskTrace将合同、三笔订单、发票、验收材料和付款记录组织成统一采购事件。

展示左侧五类材料。

## 第三幕：启动多智能体分析

点击“重新智能分析”。

依次展示：

* 合同义务Agent识别付款条件；
* 交易核验Agent发现账户不一致；
* 流程行为Agent发现三笔订单疑似拆单；
* 验收核验发现事后补录与图片复用；
* 风险研判Agent生成92分重大风险。

## 第四幕：展示证据链

> 系统不是简单输出一个大模型结论。每项风险都能定位到合同条款、订单字段、付款账户和操作时间。

依次点击证据节点，左侧定位到对应材料。

## 第五幕：执行处置

点击：

```text
暂缓付款
```

填写：

```text
收款账户与合同备案账户不一致，且验收材料存在事后补录迹象。暂缓付款并要求供应商补充账户变更函及有效验收证明。
```

系统自动：

* 更新付款状态；
* 创建合规复核工单；
* 生成补件清单；
* 写入审计日志。

## 第六幕：持续学习

进入反馈记录：

> 合规人员的最终判断会进入案例库，用于调整后续同类风险的判断阈值和处置建议，但规则变更仍需人工审批，不让AI自行修改企业合规政策。

---

# 十七、开发优先级

## P0：必须完成

* 全局后台布局；
* 风险驾驶舱；
* 案例列表；
* 一键导入演示数据；
* 多Agent分析过程；
* 风险事件详情；
* 证据链；
* 风险评分；
* 暂缓付款和补件工单；
* D1持久化；
* 审计日志；
* 稳定演示模式。

## P1：增强展示

* 文件上传页面；
* 合同原文高亮；
* 验收图片相似度展示；
* 规则中心；
* 人工反馈页面；
* 实时模型适配器；
* 风险报告打印页面。

## P2：比赛后扩展

* Cloudflare R2文件存储；
* 真实OCR；
* ERP、SRM、财务系统连接器；
* 用户、角色和权限；
* 消息通知；
* 供应商关系图谱；
* 批量风险扫描；
* 多租户；
* 私有化部署版本。

---

# 十八、MVP验收标准

完成版本至少满足以下条件：

1. 一键导入完整演示案例；
2. 页面展示合同、三笔订单、发票、验收和付款数据；
3. 六个Agent均产生真实数据库执行记录；
4. 自动识别不少于四类风险；
5. 风险分数和等级有明确计算依据；
6. 每项风险能定位到具体证据；
7. 系统可以执行暂缓付款、要求补件和升级复核；
8. 所有操作写入审计日志；
   9.刷新页面后案例和处置状态不丢失；
9. 外部AI接口不可用时仍可完整演示；
10. 可以一键重置演示数据；
11. 完整演示过程不依赖手动修改数据库。

---

# 十九、项目差异化表述

RiskTrace的差异化不应表述为“我们也能做OCR、合同审查和三单匹配”，而应表述为：

> 传统系统通常分别管理合同、订单、发票和付款，风险规则也多停留在单据级校验。RiskTrace以采购事件为核心，将合同义务、交易数据、验收材料和流程行为融合为统一证据链。系统不仅回答“哪个字段不一致”，还回答“多项异常为什么共同构成风险、依据是什么、应采取什么动作，以及处置之后如何持续跟踪”。

最终突出三个核心创新：

1. **合同义务自动转化为付款控制条件；**
2. **结构化交易、非结构化材料与流程行为联合研判；**
3. **风险证据链、分级处置和人工反馈形成治理闭环。**

---

# 二十、建议的首页宣传文案

主标题：

> 每一笔付款，都有迹可循

副标题：

> RiskTrace连接合同、订单、发票、验收与付款数据，通过多智能体协同发现跨环节合规风险，生成可验证证据链，并在资金支付前完成分级处置。

主要按钮：

```text
进入风险驾驶舱
导入演示案例
```

三项能力：

```text
跨环节风险发现
从单据校验升级为采购事件联合研判

可解释证据融合
每项风险均可定位至原始文档、字段和制度条款

闭环处置与学习
从预警、补件、复核到审计留痕和反馈更新
```

[1]: https://developers.cloudflare.com/pages/functions/routing/?utm_source=chatgpt.com "Routing · Cloudflare Pages docs"
[2]: https://github.com/DannyWongIsAvailable/RiskTrace/blob/main/wrangler.jsonc "RiskTrace/wrangler.jsonc at main · DannyWongIsAvailable/RiskTrace · GitHub"
[3]: https://developers.cloudflare.com/pages/functions/bindings/?utm_source=chatgpt.com "Bindings · Cloudflare Pages docs"
