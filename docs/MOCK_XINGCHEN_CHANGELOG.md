# Mock API 改动说明

## 改动目标

本补丁把 Demo Mock 从“靠 `GET review` 轮询逐步推进状态”调整为：

```text
一次调用
→ 返回 Xingchen-shaped execute_id
→ 同步生成 MaterialAnalysis
→ 同步生成 FinalReport
→ 直接完成
```

## 新增文件

```text
functions/_shared/mock-xingchen.ts
functions/api/mock/workflow/v1/async/chat/completions.ts
```

Mock API：

```text
POST /api/mock/workflow/v1/async/chat/completions
```

请求示例：

```json
{
  "flow_id": "mock-risktrace-review",
  "uid": "project_001",
  "parameters": {
    "PROJECT_ID": "project_001",
    "REVIEW_RUN_ID": "review_001",
    "PROJECT_TITLE": "海岳精密设备采购付款审查",
    "FILES_JSON": "[{\"documentId\":\"doc_001\",\"fileName\":\"采购合同.pdf\",\"mimeType\":\"application/pdf\"}]"
  }
}
```

响应示例：

```json
{
  "code": 0,
  "message": "Success",
  "id": "mock_sid_xxx",
  "data": {
    "execute_id": "mock_execute_xxx",
    "status": "success",
    "output": {
      "content": {
        "materialAnalysis": {},
        "finalReport": {}
      }
    }
  }
}
```

## 与真实星辰的边界

真实星辰异步启动主要返回 `execute_id`，RiskTrace 随后只通过异步结果接口查询执行结果；工作流成功后一次性返回 `materialAnalysis + finalReport`。

本 Mock 为了 Demo **有意扩展**：

```text
data.status
data.output.content
```

从而允许一次请求完成，不做轮询。

## 接入现有 uploads/complete 时的调用原则

你现有项目的 `uploads/complete` 在 Mock 分支中应当：

1. 组织 `PROJECT_ID / REVIEW_RUN_ID / PROJECT_TITLE / FILES_JSON`；
2. 调用 `mockXingchenChatCompletions()`；
3. 保存 `data.execute_id` 到 `review_runs.provider_execute_id`；
4. 把 `data.output.content.materialAnalysis` 走现有正式校验与幂等保存逻辑；
5. 把 `data.output.content.finalReport` 走现有正式校验与幂等保存逻辑；
6. 一次性将项目/运行更新为 `completed / report_completed`；
7. `uploads/complete` 直接返回完成态；
8. 删除前端为 Mock 设置的 `setInterval` / recursive timeout / 定时 `GET review`。

`GET /api/projects/:projectId/review` 保留，但只读，不得触发 Mock 下一阶段。

## 说明

由于当前对话中没有可挂载的完整 RiskTrace 源码压缩包，本补丁没有冒险覆盖你现有 `uploads/complete`、review service 和 Vue 页面，以免猜错已有 helper/import/绑定名导致项目无法编译。

`docs/Demo应用设计方案.md` 已直接按新口径完整重写；Mock API 文件可以直接加入项目。若仓库中已有同名 Mock 文件，应以现有目录职责为准合并。
