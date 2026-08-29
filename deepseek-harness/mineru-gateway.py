#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mineru-gateway — RiskTrace / DeepSeek Harness -> MinerU 官方云 API 适配网关
=======================================================================

目标：
1. 保持 dsh-plugin-mineru 使用的“自托管协议 v2”兼容：
     GET  /health
     POST /tasks                    multipart/form-data，本地文件上传
     GET  /tasks/{task_id}
     GET  /tasks/{task_id}/result

2. 为 RiskTrace / Harness 增加 URL-native 能力，不在 ECS 下载源文件：
     POST /tasks/url                application/json，异步提交 fileUrl
     POST /parse-url                application/json，便捷模式：提交 + 最多等待一段时间

官方精准解析 API（v4）映射：
- 本地文件：
    POST /api/v4/file-urls/batch
    PUT  <presigned upload url>
    GET  /api/v4/extract-results/batch/{batch_id}
- 远程 URL：
    POST /api/v4/extract/task/batch
    GET  /api/v4/extract-results/batch/{batch_id}

完成结果中的 full_zip_url 会被下载并解析 full.md / layout.json /
*_model.json / *_content_list.json / images。

安全边界：
- MINERU_API_KEY 仅配置在 risktrace-mineru.service 环境中。
- Harness 无需、也不应获得 MINERU_API_KEY。
- URL-native 路径只把 URL 字符串交给 MinerU 官方 API；Gateway 不下载源文件。

零第三方依赖，Python 3.10+ 标准库实现。

环境变量：
    MINERU_API_KEY     MinerU 官方 API token（优先于请求头 Authorization）
    MINERU_API_BASE    默认 https://mineru.net
    GATEWAY_HOST       默认 127.0.0.1
    GATEWAY_PORT       默认 18000
    REQUEST_TIMEOUT    单次上游 HTTP 请求超时秒数，默认 180
    SYNC_WAIT_TIMEOUT  /parse-url 最长同步等待秒数，默认 50（适配 Harness bash 60s）
    POLL_INTERVAL      /parse-url 轮询间隔秒数，默认 2
"""

from __future__ import annotations

import base64
import http.client
import io
import json
import mimetypes
import os
import re
import socket
import ssl
import sys
import threading
import time
import urllib.parse
import uuid
import zipfile
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

VERSION = "1.1.0"
PROTOCOL_VERSION = 2  # 保持 dsh-plugin-mineru 自托管 v2 兼容


# ---------------------------------------------------------------- config ----

def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


GATEWAY_HOST = os.environ.get("GATEWAY_HOST", "127.0.0.1")
GATEWAY_PORT = env_int("GATEWAY_PORT", 18000)
API_BASE = os.environ.get("MINERU_API_BASE", "https://mineru.net").rstrip("/")
REQUEST_TIMEOUT = env_int("REQUEST_TIMEOUT", 180)
SYNC_WAIT_TIMEOUT = env_int("SYNC_WAIT_TIMEOUT", 50)
POLL_INTERVAL = max(0.5, env_float("POLL_INTERVAL", 2.0))

DATA_ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")


def map_model_version(backend: str, filename: str) -> str:
    """本地 backend / 文件类型 -> MinerU model_version。"""
    b = (backend or "").strip().lower()
    low = (filename or "").lower()
    if low.endswith((".html", ".htm")) or b in ("mineru-html", "html"):
        return "MinerU-HTML"
    if "vlm" in b or "hybrid" in b:
        return "vlm"
    return "pipeline"


def map_is_ocr(parse_method: str) -> bool:
    return (parse_method or "").strip().lower() == "ocr"


def bool_value(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def safe_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def make_data_id(value: Any = None) -> str:
    candidate = str(value or "").strip()
    if candidate:
        if not DATA_ID_RE.fullmatch(candidate):
            raise OfficialError(
                "dataId/data_id 仅允许大小写字母、数字、_、-、.，且长度不超过 128",
                status=400,
            )
        return candidate
    return uuid.uuid4().hex


def derive_file_name(file_url: str, supplied: Any = None) -> str:
    if supplied:
        return os.path.basename(str(supplied).strip()) or "remote-document"
    path = urllib.parse.urlsplit(file_url).path
    name = os.path.basename(urllib.parse.unquote(path))
    return name or "remote-document"


# ------------------------------------------------------------ official api ---

class OfficialError(Exception):
    """携带官方接口错误信息的异常。"""

    def __init__(self, message: str, status: int = 502, body: Any = None, err_code: str = ""):
        super().__init__(message)
        self.status = status
        self.body = body
        self.err_code = str(err_code)


def _http_json(method: str, url: str, payload: Optional[dict] = None, token: Optional[str] = None) -> Any:
    headers: Dict[str, str] = {"Accept": "*/*"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            body = resp.read().decode("utf-8", "replace")
    except HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        raise OfficialError(f"官方 API {method} {url} 返回 HTTP {e.code}", status=e.code, body=raw)
    except (URLError, socket.timeout, ssl.SSLError) as e:
        raise OfficialError(f"请求官方 API 失败: {e}", status=502)

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        raise OfficialError(f"官方 API 返回非 JSON: {body[:500]}", status=502, body=body)

    if isinstance(parsed, dict) and parsed.get("code") not in (0, None):
        raise OfficialError(
            f"官方 API 错误 code={parsed.get('code')} msg={parsed.get('msg')}",
            status=400,
            body=parsed,
            err_code=str(parsed.get("code")),
        )
    return parsed


def _put_binary(url: str, data: bytes) -> None:
    """PUT 到官方预签名 URL。不能添加 Authorization / Content-Type 等自定义头。"""
    parts = urllib.parse.urlsplit(url)
    hostname = parts.hostname or ""
    port = parts.port or (443 if parts.scheme == "https" else 80)
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query

    conn: Any
    if parts.scheme == "https":
        conn = http.client.HTTPSConnection(hostname, port, timeout=REQUEST_TIMEOUT)
    else:
        conn = http.client.HTTPConnection(hostname, port, timeout=REQUEST_TIMEOUT)
    try:
        conn.request("PUT", path, body=data, headers={})
        resp = conn.getresponse()
        body_bytes = resp.read()
        if resp.status >= 300:
            raise OfficialError(
                f"上传文件到预签名地址失败 (HTTP {resp.status}): {body_bytes[:300]!r}",
                status=resp.status,
                body=body_bytes.decode("utf-8", "replace")[:500],
            )
    except OfficialError:
        raise
    except (OSError, socket.timeout, ssl.SSLError) as e:
        raise OfficialError(f"上传文件失败: {e}", status=502)
    finally:
        conn.close()


def _download_bytes(url: str) -> bytes:
    """下载 full_zip_url。官方结果 CDN URL 不需要把 API token 透传给 CDN。"""
    req = Request(url, headers={"Accept": "*/*"}, method="GET")
    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            return resp.read()
    except HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        raise OfficialError(f"下载结果失败 (HTTP {e.code}): {raw[:300]}", status=e.code, body=raw)
    except (URLError, socket.timeout, ssl.SSLError) as e:
        raise OfficialError(f"下载结果失败: {e}", status=502)


class OfficialClient:
    """MinerU 官方精准解析 API v4 的最小客户端。"""

    def __init__(self, token: Optional[str] = None, api_base: str = API_BASE):
        self.token = token
        self.api_base = api_base
        self._fake: Optional[Any] = None

    def fake(self, impl: Any) -> None:
        self._fake = impl

    def get_file_urls(
        self,
        files: List[Dict[str, Any]],
        model_version: str,
        options: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, List[str]]:
        """官方本地文件流程：POST /api/v4/file-urls/batch。"""
        if self._fake:
            return self._fake.get_file_urls(files, model_version, options)

        payload: Dict[str, Any] = {"files": files, "model_version": model_version}
        if options:
            payload.update(options)
        parsed = _http_json("POST", f"{self.api_base}/api/v4/file-urls/batch", payload, self.token)
        data = parsed.get("data") or {}
        batch_id = str(data.get("batch_id") or "")
        urls = list(data.get("file_urls") or [])
        if not batch_id:
            raise OfficialError("官方 file-urls/batch 未返回 batch_id", status=502, body=parsed)
        if len(urls) != len(files):
            raise OfficialError(
                f"官方返回 file_urls 数量不匹配：请求 {len(files)}，返回 {len(urls)}",
                status=502,
                body=parsed,
            )
        return batch_id, urls

    def submit_url_batch(
        self,
        files: List[Dict[str, Any]],
        model_version: str,
        options: Optional[Dict[str, Any]] = None,
    ) -> str:
        """官方 URL-native 流程：POST /api/v4/extract/task/batch。"""
        if self._fake:
            return self._fake.submit_url_batch(files, model_version, options)

        payload: Dict[str, Any] = {"files": files, "model_version": model_version}
        if options:
            payload.update(options)
        parsed = _http_json("POST", f"{self.api_base}/api/v4/extract/task/batch", payload, self.token)
        data = parsed.get("data") or {}
        batch_id = str(data.get("batch_id") or "")
        if not batch_id:
            raise OfficialError("官方 extract/task/batch 未返回 batch_id", status=502, body=parsed)
        return batch_id

    def upload_file(self, upload_url: str, data: bytes) -> None:
        if self._fake:
            return self._fake.upload_file(upload_url, data)
        _put_binary(upload_url, data)

    def get_task(self, batch_id: str) -> Dict[str, Any]:
        """
        GET /api/v4/extract-results/batch/{batch_id}
        -> 归一化 {state, err_msg, full_zip_url, extract_result}。
        """
        if self._fake:
            return self._fake.get_task(batch_id)

        parsed = _http_json(
            "GET",
            f"{self.api_base}/api/v4/extract-results/batch/{urllib.parse.quote(batch_id, safe='')}",
            None,
            self.token,
        )
        data = parsed.get("data") or {}
        arr = list(data.get("extract_result") or [])
        if not arr:
            return {"state": "pending", "err_msg": "", "full_zip_url": None, "extract_result": []}

        states = [str(e.get("state") or "pending").lower() for e in arr]
        zip_url = next((e.get("full_zip_url") for e in arr if e.get("full_zip_url")), None)

        if all(s == "done" for s in states):
            aggregate = "done"
            err = ""
        elif all(s in ("done", "failed") for s in states) and any(s == "failed" for s in states):
            aggregate = "failed"
            err = next((str(e.get("err_msg") or "") for e in arr if str(e.get("state") or "").lower() == "failed"), "")
        elif any(s in ("running", "converting") for s in states):
            aggregate = "running"
            err = ""
        else:
            # waiting-file / pending / 混合的尚未真正运行状态
            aggregate = "pending"
            err = ""

        return {
            "state": aggregate,
            "err_msg": err,
            "full_zip_url": zip_url,
            "extract_result": arr,
        }

    def download_zip(self, zip_url: str) -> bytes:
        if self._fake:
            return self._fake.download_zip(zip_url)
        return _download_bytes(zip_url)


# ---------------------------------------------------------------- helpers ----

def parse_multipart(content_type: str, body: bytes) -> Tuple[List[Tuple[str, str, bytes]], Dict[str, str]]:
    """解析 multipart/form-data -> (files[(field, filename, data)], text_fields)。"""
    m = re.search(r'boundary="?([^";]+)"?', content_type or "", re.I)
    if not m:
        raise OfficialError("Content-Type 缺少 boundary", status=400)
    boundary = m.group(1)
    head = (
        "MIME-Version: 1.0\r\n"
        f"Content-Type: multipart/form-data; boundary={boundary}\r\n"
        "\r\n"
    ).encode("utf-8")
    msg = BytesParser(policy=policy.default).parsebytes(head + body)
    if not msg.is_multipart():
        raise OfficialError("请求体不是合法的 multipart/form-data", status=400)

    files: List[Tuple[str, str, bytes]] = []
    fields: Dict[str, str] = {}
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        filename = part.get_filename()
        if filename:
            files.append((str(name), str(filename), part.get_payload(decode=True) or b""))
        else:
            raw = part.get_payload(decode=True) or b""
            charset = part.get_content_charset() or "utf-8"
            try:
                fields[str(name)] = raw.decode(charset)
            except (UnicodeDecodeError, LookupError):
                fields[str(name)] = raw.decode("utf-8", "replace")
    return files, fields


def resolve_token(auth_header: str) -> str:
    """优先使用 risktrace-mineru.service 中的 MINERU_API_KEY，其次请求头 Bearer。"""
    env = os.environ.get("MINERU_API_KEY", "").strip()
    if env:
        return env
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return ""


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


TIMEOUT_AGG = (OSError, socket.timeout, ssl.SSLError, URLError)


# ---------------------------------------------------------------- task store -

class TaskStore:
    """网关内部任务元数据；仍保持 v2 现有行为：服务重启后任务映射不保留。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tasks: Dict[str, Dict[str, Any]] = {}

    def put(self, task_id: str, meta: Dict[str, Any]) -> None:
        with self._lock:
            self._tasks[task_id] = meta

    def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            meta = self._tasks.get(task_id)
            return dict(meta) if meta is not None else None

    def update(self, task_id: str, **kw: Any) -> None:
        with self._lock:
            meta = self._tasks.get(task_id)
            if meta is not None:
                meta.update(kw)


STORE = TaskStore()

STATE_MAP = {
    "waiting-file": "pending",
    "pending": "pending",
    "running": "processing",
    "converting": "processing",
    "done": "completed",
    "failed": "failed",
}


def v2_status(task_id: str, meta: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
    state = str(data.get("state") or "pending").lower()
    status = STATE_MAP.get(state, "processing")
    entries = list(data.get("extract_result") or [])

    started_at = meta.get("started_at")
    if not started_at:
        for entry in entries:
            progress = entry.get("extract_progress") or {}
            if progress.get("start_time"):
                started_at = progress.get("start_time")
                break

    completed_at = meta.get("completed_at")
    if status == "completed" and not completed_at:
        completed_at = now_iso()

    error = data.get("err_msg") if status == "failed" else None
    upd: Dict[str, Any] = {
        "status": status,
        "entries": entries,
        "started_at": started_at,
        "completed_at": completed_at,
        "error": error,
    }
    if data.get("full_zip_url"):
        upd["full_zip_url"] = data["full_zip_url"]
    STORE.update(task_id, **upd)

    return {
        "task_id": task_id,
        "status": status,
        "backend": meta.get("backend") or "pipeline",
        "file_names": meta.get("file_names", []),
        "created_at": meta.get("created_at"),
        "started_at": started_at,
        "completed_at": completed_at,
        "error": error,
        "status_url": f"/tasks/{task_id}",
        "result_url": f"/tasks/{task_id}/result",
        "queued_ahead": 0,
        "message": None,
    }


def _pick_zip_entry(names: List[str], predicate: Any) -> Optional[str]:
    matches = [n for n in names if predicate(n)]
    if not matches:
        return None
    # 优先层级浅、路径短的条目；兼容 full.md 与 auto/full.md 等官方输出结构。
    return sorted(matches, key=lambda n: (n.count("/"), len(n), n))[0]


def parse_result_zip(zip_bytes: bytes, meta: Dict[str, Any]) -> Dict[str, Any]:
    """把一个官方 full_zip_url 解析为单个 v2 result object。"""
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as e:
        raise OfficialError(f"官方结果不是合法 zip: {e}", status=502)

    names = [n.replace("\\", "/").lstrip("/") for n in zf.namelist() if not n.endswith("/")]
    if not names:
        raise OfficialError("官方结果 zip 为空", status=502)

    md_name = _pick_zip_entry(names, lambda n: os.path.basename(n).lower() == "full.md")
    if md_name is None:
        md_name = _pick_zip_entry(names, lambda n: os.path.basename(n).lower().endswith(".md"))
    if md_name is None:
        raise OfficialError(
            "结果 zip 里没有找到 full.md / *.md；zip 内容: " + ", ".join(names[:30]),
            status=502,
        )

    result: Dict[str, Any] = {
        "md_content": zf.read(md_name).decode("utf-8", "replace")
    }

    if meta.get("return_middle_json"):
        middle = _pick_zip_entry(names, lambda n: os.path.basename(n).lower() in {"layout.json", "middle.json"})
        if middle:
            raw = zf.read(middle).decode("utf-8", "replace")
            try:
                json.loads(raw)
                result["middle_json"] = raw
            except json.JSONDecodeError:
                pass

    if meta.get("return_model_output"):
        model = _pick_zip_entry(
            names,
            lambda n: os.path.basename(n).lower() == "model.json" or os.path.basename(n).lower().endswith("_model.json"),
        )
        if model:
            raw = zf.read(model).decode("utf-8", "replace")
            try:
                json.loads(raw)
                result["model_output"] = raw
            except json.JSONDecodeError:
                pass

    if meta.get("return_content_list"):
        content = _pick_zip_entry(
            names,
            lambda n: os.path.basename(n).lower() == "content_list.json" or os.path.basename(n).lower().endswith("_content_list.json"),
        )
        if content:
            raw = zf.read(content).decode("utf-8", "replace")
            try:
                json.loads(raw)
                result["content_list"] = raw
            except json.JSONDecodeError:
                pass

    if meta.get("return_images"):
        images: Dict[str, str] = {}
        for name in names:
            parts = [p.lower() for p in name.split("/")]
            if "images" not in parts:
                continue
            mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
            images[name] = f"data:{mime};base64," + base64.b64encode(zf.read(name)).decode("ascii")
        if images:
            result["images"] = images

    return result


def collect_results(client: OfficialClient, meta: Dict[str, Any]) -> Dict[str, Any]:
    """根据 meta.entries 下载每个 full_zip_url，并稳定映射回 RiskTrace 文件名。"""
    results: Dict[str, Any] = {}
    entries = list(meta.get("entries") or [])
    file_names = list(meta.get("file_names") or [])
    data_id_to_name = dict(meta.get("data_id_to_name") or {})

    if not entries and meta.get("full_zip_url"):
        entries = [{
            "file_name": file_names[0] if file_names else "document",
            "data_id": next(iter(data_id_to_name), ""),
            "full_zip_url": meta["full_zip_url"],
        }]

    url_cache: Dict[str, Dict[str, Any]] = {}
    for idx, entry in enumerate(entries):
        zip_url = entry.get("full_zip_url")
        if not zip_url:
            continue
        data_id = str(entry.get("data_id") or "")
        key = (
            data_id_to_name.get(data_id)
            or str(entry.get("file_name") or "")
            or (file_names[idx] if idx < len(file_names) else "")
            or f"file_{idx + 1}"
        )
        if zip_url not in url_cache:
            url_cache[zip_url] = parse_result_zip(client.download_zip(str(zip_url)), meta)
        unique_key = key
        suffix = 2
        while unique_key in results:
            unique_key = f"{key}#{suffix}"
            suffix += 1
        results[unique_key] = url_cache[zip_url]

    if not results:
        raise OfficialError("官方结果中没有可用 full_zip_url / Markdown", status=502)
    return results


# ---------------------------------------------------------------- http server -

class Handler(BaseHTTPRequestHandler):
    server_version = f"MinerUGateway/{VERSION}"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def _read_body(self) -> bytes:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return b""
        return self.rfile.read(length)

    def _read_json_object(self) -> Dict[str, Any]:
        content_type = (self.headers.get("Content-Type") or "").lower()
        if "application/json" not in content_type:
            raise OfficialError("Content-Type 必须为 application/json", status=415)
        body = self._read_body()
        try:
            obj = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            raise OfficialError(f"请求体不是合法 JSON: {e}", status=400)
        if not isinstance(obj, dict):
            raise OfficialError("请求体必须是 JSON object", status=400)
        return obj

    def send_json(self, status: int, obj: Any) -> None:
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def handle_error_json(self, e: Exception, status: int = 500) -> None:
        if isinstance(e, OfficialError):
            self.send_json(e.status if e.status else status, {
                "error": str(e),
                "official_error_code": e.err_code,
                "official_body": e.body if isinstance(e.body, (dict, list, str)) else repr(e.body),
            })
            return
        if isinstance(e, TIMEOUT_AGG):
            self.send_json(504, {"error": f"网关内部请求失败/超时: {e}"})
            return
        self.send_json(500, {"error": f"网关内部错误: {e!r}"})

    def _authorized_client(self) -> Tuple[OfficialClient, str]:
        token = resolve_token(self.headers.get("Authorization") or "")
        if not token:
            raise OfficialError(
                "缺少 MinerU API token：请在 risktrace-mineru.service 中设置 MINERU_API_KEY",
                status=401,
            )
        return OfficialClient(token=token), token

    def _url_task_from_payload(self, payload: Dict[str, Any]) -> Tuple[str, Dict[str, Any], OfficialClient]:
        file_url = str(payload.get("fileUrl") or payload.get("url") or "").strip()
        if not file_url:
            raise OfficialError("缺少 fileUrl/url", status=400)
        if len(file_url) > 16384:
            raise OfficialError("fileUrl 过长", status=400)

        parts = urllib.parse.urlsplit(file_url)
        if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
            raise OfficialError("fileUrl 必须是可访问的 http/https URL", status=400)

        file_name = derive_file_name(file_url, payload.get("fileName") or payload.get("file_name"))
        requested_model = str(payload.get("modelVersion") or payload.get("model_version") or payload.get("backend") or "vlm")
        model_version = map_model_version(requested_model, file_name)
        backend = "vlm" if model_version == "vlm" else ("MinerU-HTML" if model_version == "MinerU-HTML" else "pipeline")
        data_id = make_data_id(payload.get("dataId") or payload.get("data_id"))

        file_spec: Dict[str, Any] = {
            "url": file_url,
            "data_id": data_id,
        }
        if "isOcr" in payload or "is_ocr" in payload:
            file_spec["is_ocr"] = bool_value(payload.get("isOcr", payload.get("is_ocr")), False)
        page_ranges = payload.get("pageRanges") or payload.get("page_ranges")
        if page_ranges:
            file_spec["page_ranges"] = str(page_ranges)

        options: Dict[str, Any] = {}
        if model_version != "MinerU-HTML":
            if "enableFormula" in payload or "enable_formula" in payload:
                options["enable_formula"] = bool_value(payload.get("enableFormula", payload.get("enable_formula")), True)
            if "enableTable" in payload or "enable_table" in payload:
                options["enable_table"] = bool_value(payload.get("enableTable", payload.get("enable_table")), True)
            language = payload.get("language")
            if language:
                options["language"] = str(language)

        extra_formats = payload.get("extraFormats") or payload.get("extra_formats")
        if extra_formats:
            if not isinstance(extra_formats, list) or not all(str(x) in {"docx", "html", "latex"} for x in extra_formats):
                raise OfficialError("extraFormats 仅支持 docx/html/latex 数组", status=400)
            options["extra_formats"] = [str(x) for x in extra_formats]

        if "noCache" in payload or "no_cache" in payload:
            options["no_cache"] = bool_value(payload.get("noCache", payload.get("no_cache")), False)
        if "cacheTolerance" in payload or "cache_tolerance" in payload:
            tolerance = safe_int(payload.get("cacheTolerance", payload.get("cache_tolerance")), 900)
            if tolerance < 0:
                raise OfficialError("cacheTolerance 必须 >= 0", status=400)
            options["cache_tolerance"] = tolerance

        client, _ = self._authorized_client()
        batch_id = client.submit_url_batch([file_spec], model_version, options)

        meta = {
            "task_id": batch_id,
            "batch_id": batch_id,
            "source_type": "url",
            "source_url": file_url,
            "full_zip_url": None,
            "status": "pending",
            "backend": backend,
            "model_version": model_version,
            "file_names": [file_name],
            "data_id_to_name": {data_id: file_name},
            "created_at": now_iso(),
            "started_at": None,
            "completed_at": None,
            "error": None,
            "return_middle_json": bool_value(payload.get("returnMiddleJson", payload.get("return_middle_json")), False),
            "return_model_output": bool_value(payload.get("returnModelOutput", payload.get("return_model_output")), False),
            "return_content_list": bool_value(payload.get("returnContentList", payload.get("return_content_list")), False),
            "return_images": bool_value(payload.get("returnImages", payload.get("return_images")), False),
        }
        STORE.put(batch_id, meta)
        return batch_id, meta, client

    def _task_created_response(self, task_id: str, meta: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "task_id": task_id,
            "status": "pending",
            "backend": meta.get("backend") or "pipeline",
            "file_names": meta.get("file_names") or [],
            "created_at": meta.get("created_at"),
            "started_at": None,
            "completed_at": None,
            "error": None,
            "status_url": f"/tasks/{task_id}",
            "result_url": f"/tasks/{task_id}/result",
            "queued_ahead": 0,
            "message": None,
        }

    def _result_response(self, client: OfficialClient, meta: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "backend": meta.get("backend") or "pipeline",
            "version": "4",
            "results": collect_results(client, meta),
        }

    # -- GET ---------------------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        try:
            if path in ("/", ""):
                self.send_json(200, {
                    "name": "mineru-gateway",
                    "version": VERSION,
                    "protocol_version": PROTOCOL_VERSION,
                    "upstream": API_BASE,
                    "endpoints": [
                        "/health",
                        "POST /tasks",
                        "POST /tasks/url",
                        "POST /parse-url",
                        "/tasks/{task_id}",
                        "/tasks/{task_id}/result",
                    ],
                    "url_native": True,
                })
                return

            if path == "/health":
                self.send_json(200, {
                    "status": "healthy",
                    "version": f"gateway/{VERSION} (official api v4)",
                    "protocol_version": PROTOCOL_VERSION,
                    "url_native": True,
                    "queued_tasks": 0,
                    "processing_tasks": 0,
                    "completed_tasks": 0,
                    "failed_tasks": 0,
                    "max_concurrent_requests": 0,
                    "processing_window_size": 0,
                    "task_retention_seconds": 86400,
                    "task_cleanup_interval_seconds": 300,
                })
                return

            if path.startswith("/tasks/"):
                segs = path[len("/tasks/"):].split("/")
                task_id = urllib.parse.unquote(segs[0])
                client, _ = self._authorized_client()
                meta = STORE.get(task_id)
                if meta is None:
                    self.send_json(404, {"error": f"未知任务 {task_id}（网关不保存跨重启状态）"})
                    return

                if len(segs) == 2 and segs[1] == "result":
                    if meta.get("status") != "completed":
                        data = client.get_task(task_id)
                        v2_status(task_id, meta, data)
                        meta = STORE.get(task_id) or meta
                    if meta.get("status") == "failed":
                        self.send_json(422, {"error": meta.get("error") or "MinerU parsing failed"})
                        return
                    if meta.get("status") != "completed":
                        self.send_json(409, {"error": f"任务未完成，当前状态 {meta.get('status', 'unknown')}"})
                        return
                    self.send_json(200, self._result_response(client, meta))
                    return

                data = client.get_task(task_id)
                out = v2_status(task_id, meta, data)
                self.send_json(200, out)
                return

            self.send_json(404, {"error": f"未知路径 {path}"})
        except Exception as e:  # noqa: BLE001
            self.handle_error_json(e)

    # -- POST --------------------------------------------------------------

    def _handle_url_async(self) -> None:
        payload = self._read_json_object()
        task_id, meta, _client = self._url_task_from_payload(payload)
        self.send_json(202, self._task_created_response(task_id, meta))

    def _handle_url_sync(self) -> None:
        payload = self._read_json_object()
        wait_timeout = safe_int(payload.get("waitTimeout", payload.get("wait_timeout")), SYNC_WAIT_TIMEOUT)
        wait_timeout = max(0, min(wait_timeout, max(SYNC_WAIT_TIMEOUT, 55)))

        task_id, meta, client = self._url_task_from_payload(payload)
        deadline = time.monotonic() + wait_timeout

        while True:
            data = client.get_task(task_id)
            status_out = v2_status(task_id, meta, data)
            meta = STORE.get(task_id) or meta
            state = status_out.get("status")

            if state == "completed":
                result = self._result_response(client, meta)
                results = result.get("results") or {}
                first_key = next(iter(results), None)
                first_value = results.get(first_key) if first_key else None
                self.send_json(200, {
                    "ok": True,
                    "task_id": task_id,
                    "status": "completed",
                    "backend": result.get("backend"),
                    "file_name": first_key,
                    "markdown": first_value.get("md_content") if isinstance(first_value, dict) else None,
                    "results": results,
                })
                return

            if state == "failed":
                self.send_json(422, {
                    "ok": False,
                    "task_id": task_id,
                    "status": "failed",
                    "error": status_out.get("error") or "MinerU parsing failed",
                })
                return

            if time.monotonic() >= deadline:
                self.send_json(202, {
                    "ok": False,
                    "task_id": task_id,
                    "status": state or "processing",
                    "status_url": f"/tasks/{task_id}",
                    "result_url": f"/tasks/{task_id}/result",
                    "message": "任务仍在处理中；请按 status_url 轮询，完成后读取 result_url。",
                })
                return

            time.sleep(POLL_INTERVAL)

    def _handle_multipart_task(self) -> None:
        body = self._read_body()
        files_field, fields = parse_multipart(self.headers.get("Content-Type") or "", body)
        if not files_field:
            self.send_json(400, {"error": "请求里没有 files 字段（multipart 上传）"})
            return

        client, _ = self._authorized_client()
        backend = fields.get("backend", "pipeline")
        file_names = [fn for _, fn, _ in files_field]
        model_version = map_model_version(backend, file_names[0] if file_names else "")

        is_ocr = map_is_ocr(fields.get("parse_method", ""))
        language = (fields.get("lang_list") or "ch").split(",")[0] or "ch"

        try:
            start = int(fields.get("start_page_id", "0"))
        except ValueError:
            start = 0
        try:
            end = int(fields.get("end_page_id", "99999"))
        except ValueError:
            end = 99999

        page_ranges: Optional[str] = None
        if start > 0 or end < 99999:
            page_ranges = f"{start + 1}--1" if end >= 99999 else f"{start + 1}-{end + 1}"

        upload_specs: List[Dict[str, Any]] = []
        data_id_to_name: Dict[str, str] = {}
        for filename in file_names:
            data_id = uuid.uuid4().hex
            spec: Dict[str, Any] = {
                "name": filename,
                "data_id": data_id,
                "is_ocr": is_ocr,
            }
            if page_ranges:
                spec["page_ranges"] = page_ranges
            upload_specs.append(spec)
            data_id_to_name[data_id] = filename

        options: Dict[str, Any] = {}
        if model_version != "MinerU-HTML":
            options["language"] = language
            if fields.get("formula_enable") is not None:
                options["enable_formula"] = fields["formula_enable"].strip().lower() == "true"
            if fields.get("table_enable") is not None:
                options["enable_table"] = fields["table_enable"].strip().lower() == "true"

        batch_id, upload_urls = client.get_file_urls(upload_specs, model_version, options)
        for (_field_name, _filename, data), upload_url in zip(files_field, upload_urls):
            client.upload_file(upload_url, data)

        meta = {
            "task_id": batch_id,
            "batch_id": batch_id,
            "source_type": "upload",
            "full_zip_url": None,
            "status": "pending",
            "backend": backend,
            "model_version": model_version,
            "file_names": file_names,
            "data_id_to_name": data_id_to_name,
            "created_at": now_iso(),
            "started_at": None,
            "completed_at": None,
            "error": None,
            "return_middle_json": fields.get("return_middle_json", "").lower() == "true",
            "return_model_output": fields.get("return_model_output", "").lower() == "true",
            "return_content_list": fields.get("return_content_list", "").lower() == "true",
            "return_images": fields.get("return_images", "").lower() == "true",
        }
        STORE.put(batch_id, meta)
        self.send_json(202, self._task_created_response(batch_id, meta))

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        try:
            if path == "/tasks/url":
                self._handle_url_async()
                return
            if path in ("/parse-url", "/v1/parse-url"):
                self._handle_url_sync()
                return
            if path == "/tasks":
                self._handle_multipart_task()
                return
            self.send_json(404, {"error": f"未知路径 {path}"})
        except Exception as e:  # noqa: BLE001
            self.handle_error_json(e)

    # 明确不对外提供 PUT；官方预签名 PUT 只由 Gateway 自己调用。
    def do_PUT(self) -> None:  # noqa: N802
        self.send_json(405, {"error": "Method Not Allowed"})


# ---------------------------------------------------------------- selftest ---

def selftest() -> int:
    """离线自检，不调用 mineru.net。"""

    class FakeOfficial:
        def __init__(self) -> None:
            self.uploaded: List[bytes] = []
            self.last_upload_specs: Optional[List[Dict[str, Any]]] = None
            self.last_url_specs: Optional[List[Dict[str, Any]]] = None
            self.last_options: Optional[Dict[str, Any]] = None

        def get_file_urls(self, files, model_version, options=None):
            self.last_upload_specs = files
            self.last_options = options or {}
            return "fake-upload-batch", [f"https://fake.upload/{i}" for i in range(len(files))]

        def submit_url_batch(self, files, model_version, options=None):
            self.last_url_specs = files
            self.last_options = options or {}
            return "fake-url-batch"

        def upload_file(self, upload_url, data):
            self.uploaded.append(data)
            assert data.startswith(b"%PDF")

        def get_task(self, batch_id):
            if batch_id in ("fake-upload-batch", "fake-url-batch"):
                return {
                    "state": "done",
                    "err_msg": "",
                    "full_zip_url": "https://fake.zip/result.zip",
                    "extract_result": [{
                        "file_name": "demo.pdf",
                        "data_id": "demo-id",
                        "state": "done",
                        "err_msg": "",
                        "full_zip_url": "https://fake.zip/result.zip",
                    }],
                }
            return {"state": "pending", "err_msg": "", "full_zip_url": None, "extract_result": []}

        def download_zip(self, zip_url):
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as zf:
                # 故意加一层 auto/，验证旧版存在隐患的场景。
                zf.writestr("auto/full.md", "# 你好\n\n解析结果 markdown")
                zf.writestr("auto/layout.json", '{"blocks": []}')
                zf.writestr("auto/demo_model.json", '{"model": []}')
                zf.writestr("auto/demo_content_list.json", '[]')
                zf.writestr("auto/images/demo.png", b"\x89PNG fake")
            return buf.getvalue()

    check = {"ok": 0, "fail": 0}

    def expect(name: str, cond: bool, extra: str = "") -> None:
        if cond:
            check["ok"] += 1
            print(f"  OK   {name}")
        else:
            check["fail"] += 1
            print(f"  FAIL {name}  {extra}")

    print("== 1. 参数映射 ==")
    expect("model pipeline", map_model_version("pipeline", "a.pdf") == "pipeline")
    expect("model vlm", map_model_version("vlm", "a.pdf") == "vlm")
    expect("model hybrid -> vlm", map_model_version("hybrid-engine", "a.pdf") == "vlm")
    expect("model html", map_model_version("pipeline", "a.html") == "MinerU-HTML")
    expect("ocr", map_is_ocr("ocr") is True)
    expect("data_id validation", make_data_id("abc_1-2.3") == "abc_1-2.3")

    print("== 2. multipart 解析 ==")
    boundary = "----testboundary42"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="files"; filename="demo.pdf"\r\n'
        "Content-Type: application/pdf\r\n\r\n"
        "%PDF-1.4 fake content\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="backend"\r\n\r\n'
        "pipeline\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")
    files_field, fields = parse_multipart(f'multipart/form-data; boundary="{boundary}"', body)
    expect("multipart file", len(files_field) == 1 and files_field[0][1] == "demo.pdf")
    expect("multipart field", fields.get("backend") == "pipeline")

    print("== 3. 官方上传 / URL batch 映射 ==")
    fake = FakeOfficial()
    client = OfficialClient(token="t")
    client.fake(fake)

    upload_specs = [{"name": "demo.pdf", "data_id": "demo-id", "is_ocr": True, "page_ranges": "1-2"}]
    batch_id, urls = client.get_file_urls(upload_specs, "vlm", {"language": "ch", "enable_table": True})
    expect("file-urls batch", batch_id == "fake-upload-batch" and len(urls) == 1)
    expect("file-level is_ocr", fake.last_upload_specs is not None and fake.last_upload_specs[0].get("is_ocr") is True)
    client.upload_file(urls[0], b"%PDF-1.4 fake")
    expect("presigned upload", bool(fake.uploaded))

    url_batch = client.submit_url_batch(
        [{"url": "https://example.com/demo.pdf", "data_id": "demo-id", "is_ocr": True}],
        "vlm",
        {"language": "ch", "enable_formula": True, "no_cache": False, "cache_tolerance": 900},
    )
    expect("URL-native batch", url_batch == "fake-url-batch")
    expect("URL stays URL", fake.last_url_specs is not None and fake.last_url_specs[0]["url"].startswith("https://"))
    expect("cache option top-level", fake.last_options is not None and fake.last_options.get("cache_tolerance") == 900)

    print("== 4. 状态与 ZIP 映射 ==")
    meta = {
        "task_id": "fake-url-batch",
        "batch_id": "fake-url-batch",
        "status": "pending",
        "backend": "vlm",
        "file_names": ["业务材料.pdf"],
        "data_id_to_name": {"demo-id": "业务材料.pdf"},
        "created_at": now_iso(),
        "started_at": None,
        "completed_at": None,
        "error": None,
        "return_middle_json": True,
        "return_model_output": True,
        "return_content_list": True,
        "return_images": True,
    }
    STORE.put("fake-url-batch", meta)
    data = client.get_task("fake-url-batch")
    out = v2_status("fake-url-batch", meta, data)
    expect("done -> completed", out["status"] == "completed")
    stored = STORE.get("fake-url-batch") or {}
    parsed = collect_results(client, stored)
    res = parsed["业务材料.pdf"]
    expect("container/full.md", "你好" in res["md_content"])
    expect("layout.json", res.get("middle_json") == '{"blocks": []}')
    expect("*_model.json", res.get("model_output") == '{"model": []}')
    expect("*_content_list.json", res.get("content_list") == '[]')
    expect("images", any(v.startswith("data:image/png;base64,") for v in res.get("images", {}).values()))

    print("== 5. token 解析 ==")
    original = os.environ.get("MINERU_API_KEY")
    try:
        os.environ.pop("MINERU_API_KEY", None)
        expect("header fallback", resolve_token("Bearer header-token") == "header-token")
        os.environ["MINERU_API_KEY"] = "env-token"
        expect("env priority", resolve_token("Bearer header-token") == "env-token")
    finally:
        if original is None:
            os.environ.pop("MINERU_API_KEY", None)
        else:
            os.environ["MINERU_API_KEY"] = original

    print(f"\n结果: {check['ok']} 通过, {check['fail']} 失败")
    return 1 if check["fail"] else 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()
    if "--version" in sys.argv:
        print(f"mineru-gateway {VERSION} (protocol v2 compatible, official API v4, url-native)")
        return 0

    try:
        httpd = ThreadingHTTPServer((GATEWAY_HOST, GATEWAY_PORT), Handler)
    except OSError as e:
        print(f"监听 {GATEWAY_HOST}:{GATEWAY_PORT} 失败: {e}（是否已有另一个 gateway 实例在跑？）")
        return 1

    print(f"mineru-gateway {VERSION} listening on http://{GATEWAY_HOST}:{GATEWAY_PORT}")
    print(f"upstream official API: {API_BASE}")
    print(f"protocol: v{PROTOCOL_VERSION} compatible + URL-native extension")
    print(f"token: {'MINERU_API_KEY env' if os.environ.get('MINERU_API_KEY') else 'Authorization header / MINERU_API_KEY env'}")
    print("press Ctrl+C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
