# RiskTrace Demo 应用设计方案

> 版本：v1.1（R2 URL 单链路方案）  
> 修订日期：2026-08-03  
> 技术栈：Vue 3 + TypeScript + Cloudflare Pages Functions + R2 + D1 + 讯飞星辰 Agent 工作流

---

## 1. 方案摘要

RiskTrace 是一套面向企业采购项目付款前控制的智能合规审查 Demo。用户在前端一次性上传采购申请、预算审批、供应商资料、报价与定标文件、合同、订单、交付验收材料、发票和付款申请等已有材料；原始文件统一保存到 Cloudflare R2，文件元数据和业务状态保存到 D1。

系统随后通过讯飞星辰工作流完成：

1. 材料分类与完整性检查；
2. 通过 R2 短时 GET URL 调用 OCR、Excel 等工具完成材料读取与结构化抽取；
3. 多个审查 Agent 从采购程序、合同条款、履约验收、票款一致性、供应商与收款账户等维度进行分析；
4. 聚合 Agent 合并多维审查结果、消除重复和冲突；
5. 输出带有证据定位的风险报告、付款条件就绪度和处置建议；
6. 人工执行暂缓付款、发起补件、指派复核、关闭误报等处置动作，并形成审计留痕。

### 1.1 核心链路

```text
前端新建采购项目并选择全部材料
        ↓
Pages Functions 创建上传会话和 R2 预签名 PUT URL
        ↓
浏览器将文件直接上传到私有 R2
        ↓
Pages Functions 校验上传结果，在 D1 保存文件元数据
        ↓
用户点击“发起合规审查”
        ↓
Pages Functions 为每份材料生成 R2 短时 GET URL
        ↓
URL 作为工作流开始节点文件变量传入星辰
        ↓
OCR、Excel 等文件解析工具通过 URL 获取并解析材料
        ↓
材料解析工作流生成统一材料事实包
        ↓
多个领域审查 Agent 多维度分析
        ↓
聚合 Agent 输出标准化 JSON
        ↓
Pages Functions 校验结果并写入 D1
        ↓
前端展示付款就绪度、风险、证据、建议和处置入口
```

### 1.2 关键技术结论

- **前端可以直接上传 R2**：后端生成限时、限对象、限操作的预签名 PUT URL，浏览器直接向 R2 上传，不需要让大文件经过 Pages Functions。
- **R2 保留原始材料**：R2 是系统的主文件存储，D1 只保存元数据、运行状态和审查结果，不保存大文件正文。
- **统一采用“URL → 文件解析工具”**：RiskTrace 只向星辰传入 R2 短时 GET URL；OCR、Excel 等工具节点通过 URL 获取并解析文件，再把文本或结构化数据交给模型节点。方案不调用星辰文件上传接口，也不依赖星辰目录。
- **不要把星辰描述成“可操作的工作目录”**：公开文档未提供由 RiskTrace 创建、指定、浏览或清理的星辰本地目录。文件获取和临时处理属于星辰平台内部行为，系统只依赖文件 URL 和工具解析结果。
- **多 Agent 通过子工作流实现**：星辰工作流节点可以嵌套已发布工作流，每个子工作流作为独立领域 Agent，由总控工作流或 RiskTrace 后端进行编排。
- **长任务采用异步接口**：创建工作流异步任务后保存 `execute_id`，前端轮询 RiskTrace 后端，后端再查询星辰任务状态；不能让一个 HTTP 请求一直等待全部材料审查完成。

---

## 2. 项目定位

### 2.1 产品名称

**RiskTrace 企业采购项目智能合规审查 Demo**

### 2.2 一句话定位

RiskTrace 在付款前重建采购申请、供应商、合同、订单、履约、验收、发票和付款之间的证据链，识别程序违规、履约异常、票款不符与收款账户风险，并支持人工复核、补件整改、暂缓付款和审计留痕。

### 2.3 目标用户

- 企业采购负责人；
- 财务应付与资金审核人员；
- 法务和合规人员；
- 内部审计人员；
- 项目负责人和业务验收人员。

### 2.4 比赛版本目标

比赛 MVP 聚焦一条可完整演示的业务闭环：

```text
材料归集
→ 智能解析
→ 多 Agent 审查
→ 风险证据展示
→ 付款建议
→ 人工处置
→ 审计留痕
```

### 2.5 比赛版本暂不建设

- 完整采购交易、库存和财务核算系统；
- 完整多租户组织、角色和细粒度权限体系；
- 银企直联和真实资金支付；
- 全量工商、司法、发票查验等外部商业数据接口；
- 对所有文件格式和复杂版式的生产级兼容。

比赛版本仍需实现最低安全边界：私有 R2、限时签名地址、密钥使用 Secret 保存、文件类型和大小校验、敏感字段不写日志、模型结果校验和操作审计。

---

## 3. 官方能力依据与实现边界

### 3.1 Cloudflare R2

Cloudflare 官方支持使用预签名 URL，为指定对象授予限时的 GET、PUT、HEAD 或 DELETE 权限。浏览器直传需要配置 R2 CORS；预签名 URL 应视为临时 bearer token，不应长期保存或公开。

官方文档：

- R2 Presigned URLs：<https://developers.cloudflare.com/r2/api/s3/presigned-urls/>
- R2 浏览器直传：<https://developers.cloudflare.com/r2/objects/upload-objects/>
- R2 CORS：<https://developers.cloudflare.com/r2/buckets/cors/>
- Pages Functions Bindings：<https://developers.cloudflare.com/pages/functions/bindings/>
- R2 Workers API：<https://developers.cloudflare.com/r2/api/workers/workers-api-usage/>

### 3.2 讯飞星辰工作流 API

讯飞官方工作流 API 支持：

- 工作流发布为 API；
- 通过 `parameters` 传入开始节点参数，包括 R2 短时文件 URL；
- 工具节点通过 `file_url` 或开始节点文件变量获取并解析材料；
- 异步创建任务 `POST /workflow/v1/async/chat/completions`；
- 返回 `execute_id`；
- 使用 `POST /workflow/v1/async/chat/result` 查询状态和结果；
- 取消异步任务；
- 工作流中断与恢复；
- 工作流节点嵌套已发布子工作流，实现多 Agent 协同。

官方文档：

- 星辰 Agent API 接入：<https://www.xfyun.cn/doc/spark/Agent04-API%E6%8E%A5%E5%85%A5.html>
- 星辰 Agent 开发指南：<https://www.xfyun.cn/doc/spark/Agent03-%E5%BC%80%E5%8F%91%E6%8C%87%E5%8D%97.html>
- 星辰 Agent 技术实践案例：<https://www.xfyun.cn/doc/spark/AgentNew-%E6%8A%80%E6%9C%AF%E5%AE%9E%E8%B7%B5%E6%A1%88%E4%BE%8B.html>
- 星辰 Agent FAQ：<https://www.xfyun.cn/doc/spark/Agent06-FAQ.html>

### 3.3 已有官方支持情况

| 能力 | 官方依据 | 方案结论 |
|---|---|---|
| PDF、图片 OCR | 通用 OCR 大模型工具的 `file_url` 支持图片和 PDF | 可直接设计 |
| Excel 读取 | 官方提供 Excel 表格数据提取工具和 Excel 工作流案例 | 使用 R2 短时 URL 作为开始节点文件变量，需在比赛账号验证 URL 参数形式 |
| 多文件输入 | 开始节点文档展示单文件与多文件输入示例 | 可设计；每个文件均使用独立 R2 短时 URL |
| 多 Agent 协同 | 工作流节点可嵌套已发布工作流 | 可直接设计 |
| 结构化 JSON | 大模型节点输出格式支持 JSON，代码节点要求 JSON 输出 | 可直接设计，并在后端二次校验 |
| 异步运行 | 异步创建、结果查询、取消接口 | 必须采用 |
| Word/PPT 等文件 | 公开文档未明确说明所有文件解析工具均可直接消费外部 URL | 比赛版本由 RiskTrace 后端转为 PDF、文本或 JSON 派生件，再通过 URL/文本参数进入工作流 |
| 真正并行执行多个子工作流 | 公开文档说明了嵌套，但未明确承诺并行调度 | 不在方案中承诺平台内真并行 |
| 可操作“工作目录” | 公开文档未提供此概念 | 不使用该表述 |

---

## 4. 总体系统架构

```text
┌─────────────────────────────────────────────┐
│                  Vue 前端                   │
│ 项目创建 / 批量上传 / 审查进度 / 报告 / 处置 │
└─────────────────────┬───────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────┐
│        Cloudflare Pages Functions API       │
│ 鉴权占位 / 上传会话 / 签名 / 任务编排 / 校验 │
└───────────────┬───────────────┬─────────────┘
                │               │
      ┌─────────▼────────┐ ┌────▼─────────────┐
      │   Cloudflare R2   │ │ Cloudflare D1    │
      │ 原件、派生文件     │ │ 元数据、运行、风险 │
      └─────────┬────────┘ └────▲─────────────┘
                │ R2 短时 GET URL │ 结果落库
┌───────────────▼────────────────┴─────────────┐
│             讯飞星辰 Agent 平台             │
│ 材料解析工作流 → 领域子工作流 → 聚合工作流   │
└─────────────────────────────────────────────┘
```

### 4.1 职责边界

#### Vue 前端

- 选择和分类材料；
- 获取上传会话；
- 直接上传 R2；
- 显示单文件上传进度、失败重试和完整性提示；
- 发起审查；
- 轮询审查进度；
- 展示风险、证据和处置操作。

#### Pages Functions

- 生成 R2 预签名 URL；
- 对对象 Key、文件名、MIME、大小和项目归属进行约束；
- 使用 R2 Binding 校验对象是否存在；
- 为待审文件生成 R2 短时 GET URL，并准备工作流文件变量；
- 调用星辰异步 API；
- 查询、取消和恢复工作流；
- 验证工作流结果 JSON；
- 将正式结果写入 D1；
- 保证模型输出不能绕过业务状态机直接改变正式事实。

#### R2

- 保存不可变原始文件；
- 保存必要的派生文件，例如标准化 PDF、文本抽取结果或工作流调试样本；
- 不公开整个 Bucket；
- 只通过 R2 Binding 或限时签名 URL 访问。

#### D1

- 保存采购项目、文件元数据和材料分类；
- 保存工作流 `execute_id` 和运行状态；
- 保存抽取事实、风险、证据引用、处置任务和审计日志；
- 不保存大文件二进制。

#### 讯飞星辰

- 通过 R2 短时 GET URL 获取待审文件；
- 调用 OCR、Excel 解析等工具；
- 执行材料理解、领域审查和聚合；
- 返回候选事实与候选风险，不直接操作 RiskTrace 数据库。

---

## 5. 文件上传与接入设计

## 5.1 为什么采用浏览器直传 R2

大文件不经过 Pages Functions，可以减少函数内存占用和请求等待时间，也让前端更容易显示逐文件进度。

### 5.1.1 上传流程

```text
1. 前端提交文件清单：名称、大小、MIME、业务分类
2. API 校验并为每个文件生成 document_id 和 object_key
3. API 返回预签名 PUT URL
4. 浏览器使用 PUT 将文件直接上传 R2
5. 前端调用 complete 接口
6. API 使用 R2 Binding 执行 HEAD/get 元数据校验
7. D1 将 document 状态改为 uploaded
```

### 5.1.2 R2 Object Key

```text
projects/{projectId}/original/{documentId}/{safeFileName}
projects/{projectId}/derived/{documentId}/{derivedFileName}
projects/{projectId}/outputs/{reviewRunId}/{artifactName}
```

不能直接使用用户文件名作为唯一 Key，避免重名覆盖、路径注入和难以追踪。

### 5.1.3 上传会话 API

```http
POST /api/projects/:projectId/upload-sessions
Content-Type: application/json
```

```json
{
  "files": [
    {
      "name": "采购合同.pdf",
      "size": 2483381,
      "mimeType": "application/pdf",
      "documentType": "contract"
    }
  ]
}
```

```json
{
  "data": {
    "uploads": [
      {
        "documentId": "doc_01",
        "objectKey": "projects/p_01/original/doc_01/采购合同.pdf",
        "method": "PUT",
        "uploadUrl": "R2_PRESIGNED_PUT_URL",
        "expiresAt": "2026-08-03T14:00:00Z",
        "requiredHeaders": {
          "Content-Type": "application/pdf"
        }
      }
    ]
  }
}
```

### 5.1.4 上传完成确认

```http
POST /api/projects/:projectId/documents/:documentId/complete
```

后端检查：

- R2 对象存在；
- 实际大小符合声明；
- `Content-Type` 符合允许列表；
- 对象 Key 属于当前项目；
- 必要时计算或记录 ETag/checksum；
- 文档状态由 `uploading` 改为 `uploaded`。

### 5.1.5 R2 CORS 示例

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://risktrace.example.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

生产配置只能放行真实前端域名，不使用 `*`。

---

## 6. R2 文件通过 URL 交给星辰工作流

本方案只采用一条文件接入链路：**R2 短时 GET URL → 星辰文件解析工具**。不调用星辰文件上传接口，也不把文件复制到所谓“星辰目录”。

## 6.1 单一路线：R2 短时 GET URL

```text
R2 私有对象
→ Pages Functions 生成短时 GET 预签名 URL
→ URL 作为工作流开始节点参数传入星辰
→ OCR、Excel 或其他文件解析工具引用该 URL
→ 工具输出文本、表格数据或结构化 JSON
→ 后续模型节点和领域 Agent 复用解析结果
```

该链路的职责边界是：

- RiskTrace 负责保存原件、生成授权 URL、控制有效期和记录文件元数据；
- 星辰文件解析工具负责通过 URL 获取并解析文件；
- 大模型节点主要读取解析后的文本或结构化数据，不直接操作 R2，也不依赖文件系统路径；
- RiskTrace 无需知道星辰平台内部是否缓存文件，也不控制其内部临时存储。

### 6.1.1 URL 生成要求

- URL 仅允许对单个 R2 对象执行 `GET`；
- 使用 HTTPS，不依赖浏览器 Cookie、登录态或内网网络；
- 有效期建议 30～60 分钟，必须覆盖工具节点实际获取文件的时间；
- URL 过期或任务重试时重新签发，不复用旧地址；
- 不在 D1、日志、前端错误信息或审计记录中保存完整签名 URL；
- R2 返回正确的 `Content-Type`、文件长度和可下载响应；
- 开发阶段必须验证星辰服务器可访问 R2 S3 API 域名及带查询参数的签名 URL。

## 6.2 工作流中的 URL 绑定方式

开始节点不保存文件本体，只接收文件清单或文件 URL。推荐继续使用 `materials_json` 传递多文件清单，在迭代节点中逐项处理：

```text
开始节点：materials_json
        ↓
代码/变量提取节点：解析为 materials 数组
        ↓
迭代节点：逐个取得 item.file_url
        ↓
分支器：依据 mime_type / parse_strategy 路由
        ├─ PDF、图片 → OCR 工具的 file_url
        ├─ Excel、CSV → Excel 提取工具的文件变量
        └─ 文本、JSON → 直接读取派生内容
        ↓
统一事实抽取
```

对于 OCR 节点，配置原则为：

```text
file_url = 当前迭代项.file_url
```

对于 Excel 工具，应在比赛账号中验证其开始节点文件变量是否可以直接接收 R2 URL。若无法直接消费外部 URL，不改用星辰上传接口，而是由 RiskTrace 后端先生成 CSV、JSON 或文本派生件，再通过新的 R2 短时 URL 或文本参数传入工作流。

## 6.3 比赛版本文件路由策略

| 原文件 | 原件保存 | 进入星辰的内容 | 解析方式 |
|---|---|---|---|
| JPG/PNG/WebP | R2 `original/` | 原件的 R2 短时 GET URL | 通用 OCR |
| PDF | R2 `original/` | 原件的 R2 短时 GET URL | 通用 OCR，必要时按页段处理 |
| XLS/XLSX/CSV | R2 `original/` | 优先使用原件短时 URL；不兼容时使用后端生成的 CSV/JSON 派生件 URL | Excel 提取工具或代码节点 |
| DOC/DOCX | R2 `original/` | 后端生成的标准化 PDF URL、纯文本或 Markdown | PDF OCR 或文本事实抽取 |
| PPT/PPTX | R2 `original/` | 后端生成的标准化 PDF URL | PDF OCR |
| TXT/MD/JSON | R2 `original/` 或 `derived/` | 短时 URL 或受控文本参数 | 文本读取、代码节点或模型节点 |
| ZIP | R2 `original/` | 不进入工作流 | 拒绝处理或要求用户解压后上传 |

## 6.4 原件与派生件原则

- 原始文件始终保存在 `original/`；
- 转换得到的 PDF、文本、CSV 或 JSON 保存在 `derived/`；
- 派生件仍通过 R2 短时 GET URL 进入星辰，不上传至星辰文件目录；
- 风险证据必须指回原始文件；
- 派生件只用于分析，不能覆盖原件；
- D1 保存原件与派生件之间的 `source_document_id` 关系；
- 同一文件的 OCR 或表格解析结果只生成一次，供多个 Agent 复用。

---

## 7. 多 Agent 工作流设计

## 7.1 推荐架构：解析一次，多维审查

不要让每个审查 Agent 重复对所有 PDF 做 OCR。推荐拆为三个阶段：

```text
阶段 A：材料解析与事实标准化
        ↓
阶段 B：多个领域 Agent 基于统一事实包审查
        ↓
阶段 C：聚合、冲突消解与付款建议
```

### 7.1.1 阶段 A：材料解析工作流

职责：

1. 接收项目和文件清单；
2. 遍历文件；
3. 根据类型路由 OCR、Excel 提取或其他解析工具；
4. 判断材料类型；
5. 提取主体、金额、日期、账户、条款、数量等候选事实；
6. 为每个事实记录证据定位；
7. 输出统一 `material_fact_package`。

建议节点：

```text
开始节点
→ 变量提取/代码节点：解析 materials_json
→ 迭代节点：逐文件处理
    ├─ 分支器：PDF/图片 URL → 通用 OCR
    ├─ 分支器：Excel/CSV URL → Excel 表格提取工具或代码节点
    └─ Word/PPT 派生件 URL、文本 → 对应解析节点
→ 文档分类大模型节点
→ 事实抽取大模型节点（JSON 输出）
→ 代码节点：统一字段、补充 document_id
→ 结束节点
```

讯飞官方文档说明，迭代节点接收数组并逐项执行子画布；公开文档没有承诺迭代项并行执行，因此方案不将它宣传为并行 OCR。

### 7.1.2 阶段 B：领域审查 Agent

#### Agent 1：材料完整性与采购程序审查

检查：

- 采购申请、预算、供应商准入、询价/招标、评审定标材料是否齐全；
- 审批日期和采购方式是否合理；
- 是否存在疑似拆分采购；
- 单一来源是否有论证；
- 审批链是否缺失。

#### Agent 2：供应商与合同审查

检查：

- 供应商主体、合同主体、签章和授权是否一致；
- 合同金额、税率、标的、交付、验收与付款条件；
- 付款账户与供应商备案账户；
- 合同变更、补充协议和有效期；
- 高风险或缺失条款。

#### Agent 3：订单、交付与验收审查

检查：

- 订单是否在合同范围内；
- 单价、数量和累计金额是否超限；
- 交付、入库、验收日期是否合理；
- 验收材料能否证明付款节点已满足；
- 退货、不合格品或整改是否仍影响付款。

#### Agent 4：发票与付款审查

检查：

- 合同、订单、验收、发票和付款申请金额；
- 发票主体、税号、品名和税率；
- 重复发票或重复付款；
- 累计付款是否超过合同或验收金额；
- 收款账户是否异常；
- 预付款、质保金和尾款条件。

#### Agent 5：规则计算 Agent

此 Agent 不应完全依赖大模型。优先由 RiskTrace 后端或星辰代码节点执行确定性计算：

- 金额加总；
- 日期前后关系；
- 主体和账户字符串标准化；
- 数量和单价容差；
- 累计订单、累计发票、累计付款；
- 重复编号；
- 材料清单覆盖率。

### 7.1.3 阶段 C：风险聚合 Agent

输入：

- 统一材料事实包；
- 各领域 Agent 结果；
- 确定性规则结果；
- 适用的企业制度或比赛规则。

职责：

- 合并重复风险；
- 识别不同 Agent 的冲突结论；
- 给出风险等级和置信度；
- 生成付款条件就绪度；
- 区分“已确认事实”“模型推断”“无法验证”；
- 输出建议动作，但不直接执行付款操作。

## 7.2 多 Agent 的两种编排方式

### 方式一：星辰总控工作流嵌套子工作流

```text
总控工作流
├─ 材料解析子工作流
├─ 采购程序审查子工作流
├─ 合同审查子工作流
├─ 履约验收审查子工作流
├─ 发票付款审查子工作流
└─ 聚合子工作流
```

星辰开发指南明确说明，工作流节点可以集成已发布工作流，通过嵌套实现模块化拆分和多 Agent 协同。

优点：

- 在星辰画布中展示完整流程；
- 比赛演示直观；
- 易查看 Trace 日志。

限制：

- 被调用子工作流需要先发布；
- 子工作流暂不支持流式输出；
- 复杂嵌套可能超时；
- 公开文档未保证多个工作流节点真正并行。

### 方式二：RiskTrace 后端扇出多个异步工作流

```text
材料解析成功
→ 后端同时创建 4 个领域异步任务
→ 分别保存 execute_id
→ 轮询每个任务
→ 全部完成后创建聚合任务
```

优点：

- 每个 Agent 状态、失败重试和耗时独立；
- 更容易做到逻辑并发；
- 某个 Agent 失败不会丢失其他结果；
- 前端可展示多 Agent 进度。

限制：

- RiskTrace 后端编排逻辑更多；
- D1 需要保存多条 `agent_runs`；
- 需要处理部分成功和聚合触发。

### 7.2.1 比赛 MVP 推荐

采用**混合方式**：

1. 材料解析作为一个独立异步工作流；
2. 解析完成后，由后端创建 4 个领域审查异步任务；
3. 所有领域任务完成后，再调用一个聚合工作流；
4. 每个领域工作流内部可以继续通过工作流节点复用小型子能力。

这样既能展示多 Agent，又避免把所有复杂逻辑堆在一个超长工作流中。

---

## 8. 工作流输入与输出协议

## 8.1 总控输入

星辰异步 API 的 `parameters` 必须与工作流开始节点参数一致。

建议开始节点参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `AGENT_USER_INPUT` | String | 固定任务描述，例如“执行采购付款前合规审查” |
| `project_id` | String | RiskTrace 采购项目 ID |
| `review_run_id` | String | 本次审查运行 ID |
| `materials_json` | String | 文件清单 JSON 字符串 |
| `policy_context` | String | 当前适用规则摘要或制度条款 |
| `analysis_mode` | String | `demo` / `strict` |

`materials_json` 示例：

```json
[
  {
    "document_id": "doc_contract_01",
    "document_type": "contract",
    "file_name": "采购合同.pdf",
    "mime_type": "application/pdf",
    "access_mode": "presigned_url",
    "file_url": "TEMPORARY_URL",
    "source_object_key": "projects/p01/original/doc_contract_01/采购合同.pdf"
  },
  {
    "document_id": "doc_invoice_01",
    "document_type": "invoice",
    "file_name": "发票.xlsx",
    "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "access_mode": "presigned_url",
    "file_url": "R2_TEMPORARY_GET_URL",
    "parse_strategy": "excel"
  }
]
```

注意：

- `source_object_key` 只用于 RiskTrace 内部追踪，不能让 Agent 直接访问；
- 临时签名 URL 不写入长期日志；
- 任务重试时重新生成 URL；
- 每个文件均使用独立短时 URL；开始节点原生多文件变量通过 PoC 后可替代 `materials_json`，但仍不上传文件到星辰。

## 8.2 异步创建请求

```http
POST https://xingchen-api.xf-yun.com/workflow/v1/async/chat/completions
Authorization: Bearer {API_KEY}:{API_SECRET}
Content-Type: application/json
```

```json
{
  "flow_id": "XFYUN_FLOW_ID",
  "uid": "risktrace-demo",
  "chat_id": "review_run_01",
  "parameters": {
    "AGENT_USER_INPUT": "执行企业采购项目付款前合规审查",
    "project_id": "project_01",
    "review_run_id": "review_run_01",
    "materials_json": "[...]",
    "analysis_mode": "demo"
  }
}
```

成功后保存：

```json
{
  "data": {
    "execute_id": "1763712632"
  }
}
```

## 8.3 状态查询

```http
POST https://xingchen-api.xf-yun.com/workflow/v1/async/chat/result
```

```json
{
  "execute_id": "1763712632"
}
```

官方状态包括 `Running`、`Success`、`Interrupt`。RiskTrace 内部转换为稳定状态：

```text
queued
preparing_files
running
needs_input
aggregating
succeeded
failed
canceled
```

## 8.4 标准化输出 JSON

工作流最终回答内容必须只输出 JSON，不添加 Markdown 代码围栏和额外解释。

```json
{
  "schema_version": "1.0",
  "project_id": "project_01",
  "review_run_id": "review_run_01",
  "summary": {
    "overall_risk_level": "critical",
    "payment_readiness": "blocked",
    "conclusion": "当前不具备付款条件",
    "confirmed_risk_count": 3,
    "needs_review_count": 1
  },
  "material_completeness": {
    "score": 82,
    "missing_documents": [
      {
        "document_type": "final_acceptance_report",
        "reason": "合同要求稳定运行30天后验收，但当前仅有到货确认"
      }
    ]
  },
  "readiness_checks": [
    {
      "code": "PAYEE_ACCOUNT_MATCH",
      "name": "收款账户一致性",
      "status": "failed",
      "summary": "付款申请账户与供应商备案账户不一致"
    }
  ],
  "risks": [
    {
      "risk_key": "payee_account_mismatch",
      "title": "收款账户与备案账户不一致",
      "severity": "critical",
      "confidence": 0.98,
      "status": "candidate",
      "dimension": "payment",
      "rule_code": "PAY-ACCOUNT-001",
      "expected_fact": "付款账户应与供应商备案账户或有效变更文件一致",
      "actual_fact": "付款申请使用新账户，未发现有效变更审批",
      "impact_amount_cent": 86000000,
      "evidence": [
        {
          "document_id": "doc_supplier_01",
          "file_name": "供应商准入表.pdf",
          "locator": {
            "page": 2,
            "quote": "开户银行……账号……"
          }
        },
        {
          "document_id": "doc_payment_01",
          "file_name": "付款申请单.pdf",
          "locator": {
            "page": 1,
            "quote": "收款账号……"
          }
        }
      ],
      "recommendation": "暂缓付款，要求提交盖章账户变更函并执行双人复核"
    }
  ],
  "limitations": [
    "未接入真实银行账户验证接口",
    "发票真伪为演示数据，未调用税务查验服务"
  ],
  "suggested_actions": [
    {
      "action": "hold_payment",
      "priority": 1,
      "reason": "存在重大收款账户异常"
    },
    {
      "action": "request_documents",
      "priority": 2,
      "reason": "缺少满足付款节点的最终验收证明"
    }
  ]
}
```

## 8.5 后端结果校验

工作流结果不能直接写入正式风险表。Pages Functions 必须执行：

1. 去除可能的 Markdown 代码围栏；
2. JSON 解析；
3. Schema 校验；
4. `project_id`、`review_run_id` 一致性校验；
5. 严重程度、状态、动作的枚举校验；
6. `document_id` 必须属于当前项目；
7. 金额使用整数分；
8. 证据不存在时不得标记为“已确认”；
9. 原始响应保存在独立调试字段或 R2 输出对象中；
10. 通过校验后再写入 `risk_items` 和 `evidence_refs`。

---

## 9. RiskTrace 后端 API

### 9.1 项目与文件

```text
POST   /api/projects
GET    /api/projects
GET    /api/projects/:projectId
POST   /api/projects/:projectId/upload-sessions
POST   /api/projects/:projectId/documents/:documentId/complete
DELETE /api/projects/:projectId/documents/:documentId
GET    /api/projects/:projectId/documents
```

### 9.2 审查运行

```text
POST   /api/projects/:projectId/reviews
GET    /api/reviews/:reviewRunId
POST   /api/reviews/:reviewRunId/cancel
POST   /api/reviews/:reviewRunId/retry
POST   /api/reviews/:reviewRunId/resume
GET    /api/reviews/:reviewRunId/agent-runs
```

### 9.3 风险与处置

```text
GET    /api/projects/:projectId/risks
GET    /api/risks/:riskId
POST   /api/risks/:riskId/confirm
POST   /api/risks/:riskId/dismiss
POST   /api/risks/:riskId/actions
GET    /api/projects/:projectId/audit-logs
```

## 9.4 发起审查接口

```http
POST /api/projects/:projectId/reviews
```

后端处理：

1. 检查项目不存在正在运行的审查；
2. 检查至少存在一份可处理材料；
3. 创建 `review_runs`；
4. 为每份待审原件或派生件生成 R2 短时 GET URL；
5. 创建材料解析异步任务；
6. 保存星辰 `execute_id`；
7. 返回 HTTP 202。

```json
{
  "data": {
    "reviewRunId": "review_run_01",
    "status": "preparing_files",
    "pollUrl": "/api/reviews/review_run_01"
  }
}
```

## 9.5 轮询策略

前端建议：

- 前 30 秒每 2 秒查询一次；
- 30 秒后每 5 秒查询一次；
- 页面隐藏时降低频率；
- 任务完成、失败或取消后停止；
- 不直接请求星辰 API，所有查询经过 RiskTrace 后端。

因为 Pages Functions 不会在请求结束后自动持续运行整个编排，比赛 MVP 采用“前端轮询驱动状态刷新”。当查询接口发现某阶段刚完成时，可以在同一次请求中创建下一阶段异步任务并更新 D1。

---

## 10. D1 数据模型

### 10.1 核心表

```text
projects
project_documents
review_runs
agent_runs
extracted_facts
risk_items
evidence_refs
action_tasks
audit_logs
```

### 10.2 `project_documents`

| 字段 | 说明 |
|---|---|
| `id` | document ID |
| `project_id` | 所属项目 |
| `document_type` | 合同、订单、发票等 |
| `original_name` | 原始文件名 |
| `mime_type` | MIME |
| `size_bytes` | 文件大小 |
| `r2_object_key` | 原件 Key |
| `derived_object_key` | 可选派生件 Key |
| `checksum` | 校验值或 ETag |
| `status` | uploading/uploaded/ready/failed |
| `parse_status` | pending/running/succeeded/failed |
| `created_at` | 创建时间 |

### 10.3 `review_runs`

| 字段 | 说明 |
|---|---|
| `id` | 审查运行 ID |
| `project_id` | 项目 ID |
| `status` | 内部统一状态 |
| `stage` | parsing/reviewing/aggregating |
| `overall_risk_level` | 最终风险等级 |
| `payment_readiness` | ready/conditional/blocked |
| `started_at` | 开始时间 |
| `finished_at` | 完成时间 |
| `error_code` | 错误码 |
| `error_message` | 脱敏错误信息 |

### 10.4 `agent_runs`

| 字段 | 说明 |
|---|---|
| `id` | 子任务 ID |
| `review_run_id` | 主审查运行 |
| `agent_type` | parser/procedure/contract/acceptance/payment/aggregator |
| `provider` | xfyun |
| `flow_id` | 星辰 flow ID |
| `execute_id` | 星辰异步执行 ID |
| `status` | queued/running/succeeded/failed/interrupt/canceled |
| `input_manifest_hash` | 输入清单摘要 |
| `raw_output_object_key` | 原始输出保存位置 |
| `token_usage` | Token 使用信息 |
| `started_at` | 开始时间 |
| `finished_at` | 完成时间 |

---

## 11. 前端交互设计

## 11.1 新建项目与批量上传

前端采用三步向导：

### 第一步：项目基本信息

- 项目名称；
- 采购类型：货物/服务/工程；
- 采购金额；
- 采购部门；
- 当前阶段：待付款审查。

### 第二步：材料批量上传

按业务分类展示拖拽区：

```text
采购需求与预算
供应商资料
寻源与定标
合同与补充协议
订单
交付与验收
发票
付款申请
其他材料
```

操作友好性要求：

- 支持一次多选和整个批次上传；
- 自动根据文件名给出材料类型建议；
- 用户可以拖动修改分类；
- 显示每个文件的上传、校验、解析状态；
- 单文件失败不影响其他文件；
- 支持失败重试和删除重传；
- 不要求用户在上传前手动将材料整理成固定数量。

### 第三步：材料检查与发起审查

显示：

- 已上传材料数量；
- 系统识别的材料类型；
- 关键材料缺失提醒；
- “仍然发起审查”入口；
- “补充材料”入口。

## 11.2 多 Agent 进度

```text
✓ 材料归集完成
✓ PDF/图片 OCR 完成
✓ Excel 数据提取完成
● 采购程序审查中
● 合同审查中
● 履约验收审查中
● 发票付款审查中
○ 风险聚合待开始
```

每个 Agent 展示：状态、开始时间、耗时、发现候选问题数和失败重试入口。不要展示模型私有思维链，展示“处理摘要”和 Trace 状态即可。

## 11.3 合规审查报告

首页先展示“付款条件就绪度”：

| 审查项 | 状态 |
|---|---|
| 采购需求与预算 | 通过 |
| 供应商准入 | 通过 |
| 采购程序 | 存疑 |
| 合同有效性 | 通过 |
| 订单与合同匹配 | 通过 |
| 交付与验收 | 材料不足 |
| 发票一致性 | 通过 |
| 收款账户一致性 | 重大异常 |
| 累计付款控制 | 通过 |
| 最终建议 | 暂缓付款 |

风险详情必须展示：

- 风险标题；
- 严重程度；
- 已确认/待复核；
- 触发规则；
- 预期事实与实际事实；
- 涉及金额；
- 文件名、页码、单元格或原文；
- 建议动作；
- 人工确认和驳回入口。

## 11.4 处置动作

比赛版本至少实现：

- 暂缓付款；
- 发起补件；
- 指派人工复核；
- 驳回误报；
- 标记有条件付款；
- 查看操作日志。

每个处置动作必须填写理由，并写入 `audit_logs`。

---

## 12. 异常与容错

### 12.1 文件异常

- 文件上传失败：只重试该文件；
- 文件类型不支持：保留原件，标记为 `unsupported`；
- OCR 超时：按页拆分或提示减少页数；
- Excel 多 Sheet：先列出 Sheet，再按配置提取；若工具不能直接消费 R2 URL，则由后端生成 CSV/JSON 派生件；
- 文件 URL 过期：重新签发并重试对应 Agent；
- 星辰无法访问文件 URL：检查 R2 签名、有效期、域名和响应头，重新签发后仅重试对应文件。

讯飞 FAQ 提到 OCR 页数过多、页面复杂时容易超时，单独调用工具大约在数十页规模内更稳妥。比赛样例应控制单文件页数，长 PDF 可以按页段处理。

### 12.2 工作流异常

- 创建任务失败：最多自动重试 2 次；
- `Running`：继续轮询；
- `Interrupt`：RiskTrace 映射为 `needs_input`，前端展示需要补充的信息；
- 子 Agent 部分失败：允许其他 Agent 继续，并由聚合 Agent 标注分析限制；
- JSON 不合法：执行一次格式修复工作流或失败重试；
- `flow_id` 未发布或版本过旧：后台显示配置错误，不向用户展示密钥细节；
- 取消任务：调用星辰取消接口，并同步 D1 状态。

### 12.3 工作流节点异常配置

对 OCR、Excel 工具、大模型、代码、变量提取器和子工作流节点配置：

- 超时时间；
- 重试次数；
- 异常流程；
- 兜底输出；
- 节点注释。

---

## 13. 安全与隐私最低要求

### 13.1 Secret

以下内容只保存为 Cloudflare Secret：

```text
XFYUN_API_KEY
XFYUN_API_SECRET
XFYUN_FLOW_ID_*
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
CLOUDFLARE_ACCOUNT_ID
```

前端永远不能获得这些值。

### 13.2 文件访问

- R2 Bucket 保持私有；
- 上传 PUT URL 建议 10～15 分钟有效；
- 分析 GET URL 建议 30～60 分钟有效；
- URL 仅授权单个对象和单一操作；
- 不在 D1、前端错误信息、控制台和审计日志中保存完整签名 URL；
- 审查结束后不需要主动删除原件，但比赛数据应提供一键清除功能。

### 13.3 日志脱敏

禁止记录：

- 完整银行账号；
- 身份证号；
- 合同全文；
- R2 签名 URL；
- 星辰 API Key/Secret；
- 工作流返回的私有推理内容。

### 13.4 AI 输出边界

- AI 输出是候选事实和候选风险；
- 付款状态只能由用户处置动作或确定性业务规则更新；
- 风险没有证据时必须标记为待复核；
- 前端不得展示或依赖 `reasoning_content` 作为审计依据；
- 最终报告展示可复核的事实摘要，不展示模型内部思维链。

---

## 14. Cloudflare 配置建议

### 14.1 `wrangler.jsonc`

```jsonc
{
  "name": "risktrace",
  "compatibility_date": "2026-08-03",
  "pages_build_output_dir": "./dist",
  "r2_buckets": [
    {
      "binding": "PROCUREMENT_FILES",
      "bucket_name": "risktrace-procurement-files"
    }
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "risktrace-db",
      "database_id": "REPLACE_WITH_DATABASE_ID"
    }
  ]
}
```

R2 预签名所需 S3 API 凭证和讯飞凭证通过 Cloudflare Dashboard 的 Variables and Secrets 配置，不写入仓库。

### 14.2 环境类型

```ts
interface Env {
  DB: D1Database
  PROCUREMENT_FILES: R2Bucket
  XFYUN_API_KEY: string
  XFYUN_API_SECRET: string
  XFYUN_FLOW_ID_PARSER: string
  XFYUN_FLOW_ID_PROCEDURE: string
  XFYUN_FLOW_ID_CONTRACT: string
  XFYUN_FLOW_ID_ACCEPTANCE: string
  XFYUN_FLOW_ID_PAYMENT: string
  XFYUN_FLOW_ID_AGGREGATOR: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  CLOUDFLARE_ACCOUNT_ID: string
  R2_BUCKET_NAME: string
}
```

---

## 15. Provider 抽象

业务层不直接调用讯飞字段，统一通过 Provider：

```ts
interface ReviewProvider {
  prepareFileUrls(input: PrepareFileUrlsInput): Promise<PreparedFileUrl[]>
  createRun(input: CreateAgentRunInput): Promise<ProviderRun>
  getRun(executeId: string): Promise<ProviderRunResult>
  cancelRun(executeId: string): Promise<void>
  resumeRun(input: ResumeAgentRunInput): Promise<ProviderRun>
}
```

```ts
interface PreparedFileUrl {
  documentId: string
  sourceDocumentId?: string
  fileName: string
  mimeType: string
  fileUrl: string
  accessMode: 'presigned_url'
  parseStrategy: 'ocr' | 'excel' | 'text' | 'json'
  expiresAt: string
}
```

Provider 只负责生成、刷新和校验 R2 短时 URL，以及标记对应解析策略；不实现文件转传或星辰目录上传。

---

## 16. 比赛黄金演示案例

项目：**海岳精密设备采购异常付款**

准备材料：

1. 采购申请单；
2. 预算审批单；
3. 供应商准入表；
4. 三家供应商报价；
5. 比价和定标审批；
6. 采购合同；
7. 采购订单；
8. 送货单和普通验收单；
9. 发票；
10. 付款申请和账户变更函。

埋入风险：

- 48 小时内拆分两笔订单，疑似规避采购门槛；
- 合同及供应商档案为账户 A，付款申请改为账户 B；
- 合同要求安装调试并稳定运行 30 天，现有材料只能证明到货；
- 发票或付款申请金额超过当前累计验收金额。

演示步骤：

```text
1. 新建项目
2. 一次性选择全部材料并上传
3. 查看材料自动分类和缺失提示
4. 点击发起审查
5. 展示材料解析和多个 Agent 进度
6. 查看付款条件就绪度
7. 打开收款账户重大风险
8. 对比供应商准入表、合同和付款申请中的账户证据
9. 点击“暂缓付款”
10. 发起补件并指派复核人
11. 查看审计日志和总览指标变化
```

---

## 17. 开发顺序

### 阶段 1：文件链路 PoC

必须最先验证：

- 浏览器通过预签名 PUT 上传 R2；
- R2 CORS；
- Pages Functions 读取 R2；
- R2 GET 签名 URL 能否被星辰 OCR 工具访问；
- 工作流开始节点的单文件、多文件 URL 参数，以及 Excel 工具引用 URL 时的真实结构；
- Word/PPT 转 PDF、Excel 转 CSV/JSON 派生件的后端转换链路；
- 文件和 URL 的大小、数量、有效期、超时限制。

### 阶段 2：单工作流闭环

- 上传 PDF；
- OCR；
- 输出标准 JSON；
- 异步查询；
- 保存 D1；
- 前端展示一条风险和证据。

### 阶段 3：多 Agent

- 材料解析工作流；
- 4 个领域审查工作流；
- 聚合工作流；
- `agent_runs` 状态展示；
- 部分失败和重试。

### 阶段 4：处置闭环

- 风险确认/驳回；
- 暂缓付款；
- 补件任务；
- 审计日志；
- 总览指标联动。

### 阶段 5：比赛打磨

- 固定黄金案例；
- 控制样例页数和文件大小；
- 准备星辰服务异常时的已缓存演示结果；
- 优化 5～8 分钟演示路径；
- 隐藏工程占位页面和内部调试文字。

---

## 18. 技术验收清单

### 文件上传

- [ ] 前端可以一次选择多份文件；
- [ ] 每份文件获得独立 R2 Key；
- [ ] 文件直接上传 R2；
- [ ] CORS 正确；
- [ ] 上传成功后后端执行对象校验；
- [ ] 失败文件可单独重试；
- [ ] R2 Bucket 不公开。

### 星辰接入

- [ ] 工作流已发布为 API；
- [ ] 应用、APPID、模型授权和 Flow ID 已配置；
- [ ] API Key 和 Secret 位于 Cloudflare Secret；
- [ ] PDF/图片 OCR 通过；
- [ ] 全部文件链路均未调用星辰文件上传接口；
- [ ] Excel 通过 R2 URL 或 CSV/JSON 派生件解析通过；
- [ ] Word/PPT 后端转 PDF/文本后，通过 R2 URL 解析通过；
- [ ] 异步创建返回 `execute_id`；
- [ ] 查询、取消和中断恢复通过；
- [ ] 工作流输出为稳定 JSON；
- [ ] Trace 日志可定位失败节点。

### 多 Agent

- [ ] 解析结果可被多个 Agent 复用；
- [ ] 每个 Agent 有独立 `agent_run`；
- [ ] 某个 Agent 失败时其他 Agent 结果保留；
- [ ] 聚合结果标注分析限制；
- [ ] 不展示私有思维链。

### 数据与处置

- [ ] 风险关联项目和付款申请；
- [ ] 风险关联原始文件证据；
- [ ] 证据可定位页码或单元格；
- [ ] 暂缓付款动作写入审计日志；
- [ ] 模型不能直接修改正式付款状态；
- [ ] 支持清除比赛演示数据。

---

## 19. 最终结论

本方案可以实现“前端一次性上传全部已有材料，R2 统一保存，讯飞星辰工作流读取并由多个 Agent 多维协作审查”的比赛 Demo，但应采用以下准确技术口径：

> 前端通过后端签发的预签名 PUT URL 将原始材料直接上传到私有 R2；RiskTrace 后端在发起审查时，为每份原件或派生件生成短时 GET URL，并将 URL 作为工作流开始节点文件变量传入星辰。OCR、Excel 等文件解析工具通过 URL 获取材料并输出文本、表格数据或结构化 JSON，后续多个领域 Agent 复用统一事实包完成采购程序、合同、履约验收和发票付款审查，聚合工作流生成标准化风险 JSON。RiskTrace 后端负责 URL 生命周期、异步任务状态、结果校验、D1 落库和人工处置闭环。整个链路不调用星辰文件上传接口，也不依赖星辰目录。

不应承诺或描述为：

> “Agent 登录 R2，并把文件下载到一个由 RiskTrace 可控制的星辰本地工作目录。”

公开官方文档没有提供这样的文件系统接口。采用“R2 短时 GET URL + 文件解析工具 + 结构化事实包 + 异步工作流”的描述，更准确，也更容易真正开发完成。
