---
name: mineru
description: Parse RiskTrace source documents directly from fileUrl through the local MinerU Gateway. Use this skill whenever a RiskTrace material contains a fileUrl and the document content must be extracted before analysis. The Gateway uses MinerU official precise URL parsing and does not require downloading the source file to ECS.
---

# RiskTrace MinerU document parsing

Use this skill whenever a RiskTrace material contains a `fileUrl` and its contents must be read before review, evidence extraction, or risk analysis.

## Fixed service contract

Local Gateway:

`http://127.0.0.1:18000`

The Gateway owns MinerU authentication through `MINERU_API_KEY` in `risktrace-mineru.service`.

Never request, print, inspect, echo, or expose `MINERU_API_KEY`.

Never call `mineru.net` directly.

Never download a source file to `/tmp`, the workspace, or any other ECS path when `fileUrl` is available.

Do not probe or guess Gateway endpoints.

Do not call `/parse`, `/openapi.json`, `/swagger.json`, or similar discovery endpoints.

Do not perform a health check during normal parsing unless the fixed parsing request fails because the Gateway is unavailable.

## Preferred parsing path: one request

For one RiskTrace material, send the exact remote URL to the fixed synchronous convenience endpoint:

```bash
curl -sS --max-time 55 \
  -X POST 'http://127.0.0.1:18000/parse-url' \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "fileUrl": "<EXACT_FILE_URL>",
  "fileName": "<FILE_NAME>",
  "modelVersion": "vlm",
  "isOcr": true,
  "language": "ch",
  "enableFormula": true,
  "enableTable": true,
  "noCache": false,
  "cacheTolerance": 900,
  "waitTimeout": 50
}
JSON
```

Replace only `<EXACT_FILE_URL>` and `<FILE_NAME>` with values supplied by RiskTrace.

Do not alter, shorten, re-host, pre-download, or otherwise transform the URL.

`vlm` is the preferred model for RiskTrace document review. For an HTML source, use `modelVersion: "MinerU-HTML"` instead.

## Response handling

### Completed in the first request

A normal successful response is:

```json
{
  "ok": true,
  "task_id": "...",
  "status": "completed",
  "backend": "vlm",
  "file_name": "...",
  "markdown": "...",
  "results": {
    "...": {
      "md_content": "..."
    }
  }
}
```

When `ok=true`, use `markdown` as the authoritative extracted document text and continue the RiskTrace review.

Do not re-run MinerU for the same material unless the first extraction is clearly failed or incomplete.

### Still processing after the convenience wait window

The Gateway may return HTTP 202 with:

```json
{
  "ok": false,
  "task_id": "...",
  "status": "processing",
  "status_url": "/tasks/...",
  "result_url": "/tasks/.../result"
}
```

This is not a parsing failure. It only means MinerU needs more time.

Use the exact returned `task_id`; do not submit the file again.

Poll the fixed status endpoint:

```bash
curl -sS 'http://127.0.0.1:18000/tasks/<TASK_ID>'
```

Wait briefly between polls. Do not probe any other endpoint.

When status becomes `completed`, fetch exactly:

```bash
curl -sS 'http://127.0.0.1:18000/tasks/<TASK_ID>/result'
```

The result schema is:

```json
{
  "backend": "vlm",
  "version": "4",
  "results": {
    "<FILE_NAME>": {
      "md_content": "..."
    }
  }
}
```

Use `results[<FILE_NAME>].md_content` as the extracted document content.

If status becomes `failed`, report the returned error and do not fabricate document contents.

## Optional parameters

Only use these when the review request requires them:

- `pageRanges`: MinerU page-range expression, for example `"1-10"` or `"2,4-6"`.
- `noCache`: set to `true` only when the URL may have been overwritten and the newest bytes are required.
- `cacheTolerance`: cache tolerance in seconds when `noCache=false`; default `900`.
- `returnContentList`: request content-list JSON in addition to Markdown.
- `returnMiddleJson`: request layout/middle JSON.
- `returnModelOutput`: request model JSON.
- `returnImages`: request images; avoid unless visual artifacts are required because output can be large.

## Required review procedure

1. Load this skill before substantive analysis of a material with `fileUrl`.
2. Parse the source using the fixed Gateway call above.
3. Treat returned Markdown as extracted source evidence, not as an analytical conclusion.
4. Extract relevant parties, dates, amounts, account details, obligations, clauses, invoice fields, and other evidence from the Markdown.
5. Cross-check facts across materials when multiple documents are present.
6. Clearly separate source facts from risk judgments.
7. Never invent text that MinerU did not return.

## Failure policy

If the Gateway returns an official MinerU error such as URL timeout, unsupported format, file too large, page limit, quota, or parsing failure, preserve the error meaning in the review record.

Do not work around a URL parsing failure by downloading the file locally unless the user explicitly requests that fallback.

If a URL has no recognizable supported file suffix, MinerU precise URL parsing may reject it; report that limitation instead of guessing another protocol.
