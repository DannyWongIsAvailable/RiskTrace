#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mineru-gateway — MinerU 官方云 API 本地协议适配网关
====================================================

把 dsh-plugin-mineru（以及任何使用 "MinerU 自托管服务器协议 v2" 的客户端）无缝对接到
MinerU 官方云 API (https://mineru.net)。

插件以为自己在跟一个本地 MinerU FastAPI 服务说话：
    GET  /health              -> 200 JSON
    POST /tasks               -> 202 JSON {task_id, ...}   (multipart 上传文件)
    GET  /tasks/{task_id}     -> 200 JSON {task_id, status, ...}
    GET  /tasks/{task_id}/result -> 200 JSON {backend, version, results: {...}}

网关在内部把请求翻译成官方 v4 协议（本地文件可用路径）：
    1. POST /api/v4/file-urls/batch      (换预签名上传地址；返回 batch_id)
    2. PUT  <upload_url>                 (上传文件二进制，不带任何自定义头)
    3. GET  /api/v4/extract-results/batch/{batch_id}  (轮询 per-file state)
    4. 完成态条目带 full_zip_url，下载 zip 解出 full.md / layout.json / content_list / images

零第三方依赖，Python 3.10+ 标准库实现。

用法：
    set MINERU_API_KEY=你的官方token     (或让插件在 Authorization 头里传 Bearer)
    python gateway.py                    # 默认监听 127.0.0.1:18000
    python gateway.py --selftest         # 离线自检（不调官方 API）

环境变量：
    MINERU_API_KEY  官方 API token（优先于请求头里的 Authorization）
    MINERU_API_BASE 官方 API 根地址，默认 https://mineru.net
    GATEWAY_HOST    监听地址，默认 127.0.0.1
    GATEWAY_PORT    监听端口，默认 18000
    REQUEST_TIMEOUT 单次 HTTP 超时秒数，默认 180
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

VERSION = "1.0.0"
PROTOCOL_VERSION = 2  # 自托管 v2 协议（插件 client.ts 期望的）

# ---------------------------------------------------------------- config ----

def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


GATEWAY_HOST = os.environ.get("GATEWAY_HOST", "127.0.0.1")
GATEWAY_PORT = env_int("GATEWAY_PORT", 18000)
API_BASE = os.environ.get("MINERU_API_BASE", "https://mineru.net").rstrip("/")
REQUEST_TIMEOUT = env_int("REQUEST_TIMEOUT", 180)

# v2 backend -> 官方 model_version
def map_model_version(backend: str, filename: str) -> str:
    b = (backend or "").strip().lower()
    low = filename.lower()
    if low.endswith((".html", ".htm")):
        return "MinerU-HTML"
    if "vlm" in b or "hybrid" in b:
        return "vlm"
    return "pipeline"  # 官方默认，含 pipeline


def map_is_ocr(parse_method: str) -> bool:
    return (parse_method or "").strip().lower() == "ocr"


# ------------------------------------------------------------ official api ---

class OfficialError(Exception):
    """携带官方接口错误信息的异常。"""

    def __init__(self, message: str, status: int = 502, body: Any = None, err_code: str = ""):
        super().__init__(message)
        self.status = status
        self.body = body
        self.err_code = str(err_code)


def _http_json(method: str, url: str, payload: Optional[dict] = None, token: Optional[str] = None) -> Any:
    """JSON 请求官方 API，返回解析后的 body；业务错误码非 0 抛 OfficialError。"""
    headers: Dict[str, str] = {"Content-Type": "application/json", "Accept": "*/*"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
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


def _put_binary(url: str, data: bytes, token: Optional[str] = None) -> None:
    """
    PUT 文件二进制到预签名地址（http.client 裸请求）。
    重要：不能带任何自定义头（Authorization / Content-Type / ...）。
    预签名 URL 的签名只覆盖 URL query 里的参数，额外头会导致 SignatureDoesNotMatch。
    """
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


def _download_bytes(url: str, token: Optional[str] = None) -> bytes:
    headers: Dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers, method="GET")
    try:
        with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            return resp.read()
    except HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        raise OfficialError(f"下载结果失败 (HTTP {e.code}): {raw[:300]}", status=e.code, body=raw)
    except (URLError, socket.timeout, ssl.SSLError) as e:
        raise OfficialError(f"下载结果失败: {e}", status=502)


class OfficialClient:
    """官方 v4 协议的最小客户端。self._fake 供离线自检注入。

    本地文件流程（官方实际可用路径）：
        1. POST /api/v4/file-urls/batch  -> batch_id + 每文件预签名上传链接
        2. PUT 上传文件二进制
        3. GET  /api/v4/extract-results/batch/{batch_id} 轮询（extract_result 数组）
           完成态条目含 full_zip_url，下载后解出 full.md / layout.json / *_model.json / *_content_list.json / images/
        （注意：不要另调 extract/task/batch，它面向 URL 输入，且官方后台 GET 不到上传桶里的对象）
    """

    def __init__(self, token: Optional[str] = None, api_base: str = API_BASE):
        self.token = token
        self.api_base = api_base
        self._fake: Optional[Any] = None  # selftest 替换

    def fake(self, impl: Any) -> None:
        self._fake = impl

    def get_file_urls(self, names: List[str], model_version: str, extra: Optional[Dict[str, Any]] = None) -> Tuple[str, List[str]]:
        """POST /api/v4/file-urls/batch -> (batch_id, [upload_url,...])"""
        if self._fake:
            return self._fake.get_file_urls(names, model_version, extra)
        payload: Dict[str, Any] = {"files": [{"name": n} for n in names], "model_version": model_version}
        if extra:
            payload.update(extra)
        parsed = _http_json("POST", f"{self.api_base}/api/v4/file-urls/batch", payload, self.token)
        data = parsed.get("data") or {}
        batch_id = data.get("batch_id") or ""
        urls = data.get("file_urls") or []
        if not urls:
            raise OfficialError("官方返回的 file_urls 为空，请检查 token 与配额", status=400, body=parsed)
        return batch_id, list(urls)

    def upload_file(self, upload_url: str, data: bytes) -> None:
        if self._fake:
            return self._fake.upload_file(upload_url, data)
        _put_binary(upload_url, data)

    def get_task(self, batch_id: str) -> Dict[str, Any]:
        """
        GET /api/v4/extract-results/batch/{batch_id} -> 归一化 {state, err_msg, full_zip_url, extract_result}。
        state: pending / running / failed / done（与官方单任务接口语义一致）
        """
        if self._fake:
            return self._fake.get_task(batch_id)
        parsed = _http_json("GET", f"{self.api_base}/api/v4/extract-results/batch/{batch_id}", None, self.token)
        data = parsed.get("data") or {}
        arr = data.get("extract_result") or []
        if not arr:
            return {"state": "pending", "err_msg": "", "full_zip_url": None, "extract_result": []}
        states = [e.get("state") for e in arr]
        zip_url = next((e.get("full_zip_url") for e in arr if e.get("full_zip_url")), None)
        if any(s not in ("done", "failed") for s in states):
            return {"state": "running", "err_msg": "", "full_zip_url": zip_url, "extract_result": arr}
        if any(s == "failed" for s in states):
            err = next((e.get("err_msg") for e in arr if e.get("state") == "failed"), "")
            return {"state": "failed", "err_msg": err or "parsing failed", "full_zip_url": None, "extract_result": arr}
        return {"state": "done", "err_msg": "", "full_zip_url": zip_url, "extract_result": arr}

    def download_zip(self, zip_url: str) -> bytes:
        if self._fake:
            return self._fake.download_zip(zip_url)
        return _download_bytes(zip_url, self.token)


# ---------------------------------------------------------------- helpers ----

def parse_multipart(content_type: str, body: bytes) -> Tuple[List[Tuple[str, str, bytes]], Dict[str, str]]:
    """解析 multipart/form-data -> (files[(field, filename, data)], text_fields)。"""
    m = re.search(r'boundary="?([^";]+)"?', content_type or "", re.I)
    if not m:
        raise OfficialError("Content-Type 缺少 boundary", status=400)
    boundary = m.group(1)
    # email 解析器要求消息以头开始，否则无法识别 multipart；补一个合成头
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
            # 文本字段（可能带 charset 编码）
            raw = part.get_payload(decode=True) or b""
            charset = part.get_content_charset() or "utf-8"
            try:
                fields[str(name)] = raw.decode(charset)
            except (UnicodeDecodeError, LookupError):
                fields[str(name)] = raw.decode("utf-8", "replace")
    return files, fields


def resolve_token(auth_header: str) -> str:
    """优先环境变量，其次请求头 Authorization: Bearer xxx。"""
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
    """网关内部任务元数据：task_id -> meta。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tasks: Dict[str, Dict[str, Any]] = {}

    def put(self, task_id: str, meta: Dict[str, Any]) -> None:
        with self._lock:
            self._tasks[task_id] = meta

    def get(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._tasks.get(task_id)

    def update(self, task_id: str, **kw: Any) -> None:
        with self._lock:
            meta = self._tasks.get(task_id)
            if meta is not None:
                meta.update(kw)


STORE = TaskStore()

STATE_MAP = {
    "pending": "pending",
    "running": "processing",
    "converting": "processing",
    "done": "completed",
    "failed": "failed",
}


def v2_status(task_id: str, meta: Dict[str, Any], data: Dict[str, Any]) -> Dict[str, Any]:
    """把官方 state 映射成 v2 TaskStatusResponse。"""
    state = (data.get("state") or "pending").lower()
    status = STATE_MAP.get(state, "processing")
    out: Dict[str, Any] = {
        "task_id": task_id,
        "status": status,
        "backend": meta.get("backend") or "pipeline",
        "file_names": meta.get("file_names", []),
        "created_at": meta.get("created_at"),
        "started_at": meta.get("started_at"),
        "completed_at": meta.get("completed_at"),
        "error": data.get("err_msg") if status == "failed" else None,
        "status_url": f"/tasks/{task_id}",
        "result_url": f"/tasks/{task_id}/result",
        "queued_ahead": 0,
        "message": None,
    }
    # 转瞬即逝的字段落到 meta，供 result 阶段使用
    upd: Dict[str, Any] = {"status": status, "entries": data.get("extract_result") or []}
    if data.get("full_zip_url"):
        upd["full_zip_url"] = data["full_zip_url"]
    if data.get("extract_progress") and not meta.get("started_at"):
        upd["started_at"] = data["extract_progress"].get("start_time")
    if status == "completed" and not meta.get("completed_at"):
        upd["completed_at"] = now_iso()
    if status == "failed":
        upd["error"] = data.get("err_msg")
    STORE.update(task_id, **upd)
    return out


def map_result_zip(zip_bytes: bytes, meta: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    把官方结果 zip 映射成 v2 TaskResultResponse.results:
        {文件名: {md_content, middle_json, model_output, content_list, images}}
    zip 里多文件时按顶层目录名分组；根目录内容归属第一个文件。
    """
    results: Dict[str, Dict[str, Any]] = {}
    file_names = meta.get("file_names", []) or []
    key_of = lambda i: file_names[i] if i < len(file_names) else f"file_{i + 1}"

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as e:
        raise OfficialError(f"官方结果不是合法 zip: {e}", status=502)

    names = [n.replace("\\", "/").lstrip("/") for n in zf.namelist() if not n.endswith("/")]

    # 单层容器目录检测（官方可能把所有结果放在 auto/ 之类的一个目录里）
    def container_dir(ns: List[str]) -> Optional[str]:
        tops = {n.split("/", 1)[0] for n in ns}
        if len(tops) == 1 and not any("/" not in n for n in ns):
            return tops.pop()
        return None

    cd = container_dir(names)
    if cd:
        names = [n[len(cd) + 1:] for n in names]

    # 分组：根条目归 group ""，子目录条目归 "dir/"（目录名作为文件 key）
    groups: Dict[str, List[str]] = {}
    for n in names:
        if "/" in n:
            dirname, _ = n.split("/", 1)
            groups.setdefault(dirname, []).append(n)
        else:
            groups.setdefault("", []).append(n)

    all_entries = names
    root_names = groups.get("", [])
    image_entries = [n for n in all_entries if "/" in n and n.split("/", 1)[0] == "images"]
    md_global = next((n for n in root_names if n.split("/")[-1].lower() == "full.md"), None)

    def read_json_any(prefix: str, entry_names: List[str], candidates: List[str]) -> Optional[str]:
        low = [n.lower() for n in entry_names]
        for base_cand in candidates:
            for i, l in enumerate(low):
                if l == base_cand or l.endswith(base_cand):
                    try:
                        raw = zf.read(prefix + entry_names[i]).decode("utf-8", "replace")
                        json.loads(raw)  # 校验
                        return raw
                    except (KeyError, ValueError):
                        continue
        return None

    def images_of(entries: List[str], prefix: str) -> Dict[str, str]:
        imgs: Dict[str, str] = {}
        for n in entries:
            rel = n.split("/", 1)[1] if prefix else n
            low = rel.lower()
            if low.startswith("images/"):
                mime = mimetypes.guess_type(rel)[0] or "application/octet-stream"
                imgs[n] = f"data:{mime};base64," + base64.b64encode(zf.read(n)).decode("ascii")
        return imgs

    def parse_files(entries: List[str], prefix: str, extra_images: List[str] = ()) -> Optional[Dict[str, Any]]:
        entry_names = [n.split("/", 1)[1] if prefix else n for n in entries]
        low = [n.lower() for n in entry_names]
        # full.md 按 basename 匹配（可能在任意子目录里）
        md = next((entry_names[i] for i, l in enumerate(low) if l.split("/")[-1] == "full.md"), None)
        if md is None and not prefix and md_global:
            md = md_global
        if md is None:
            # 退化：任何 .md
            md = next((n for n in entry_names if n.split("/")[-1].lower().endswith(".md")), None)
        if md is None:
            return None
        res: Dict[str, Any] = {}
        try:
            res["md_content"] = zf.read(prefix + md).decode("utf-8", "replace")
        except (KeyError, UnicodeDecodeError):
            pass

        if meta.get("return_middle_json"):
            mid = read_json_any(prefix, entry_names, ["layout.json"])
            if mid:
                res["middle_json"] = mid
        if meta.get("return_model_output"):
            mo = read_json_any(prefix, entry_names, ["model.json", "_model.json"])
            if mo:
                res["model_output"] = mo
        if meta.get("return_content_list"):
            cl = read_json_any(prefix, entry_names, ["content_list.json", "_content_list.json"])
            if cl:
                res["content_list"] = cl
        if meta.get("return_images"):
            imgs = images_of(entries, prefix)
            for n in extra_images:  # 单文件模式下全局 images/ 目录
                rel = n.split("/", 1)[1]
                mime = mimetypes.guess_type(rel)[0] or "application/octet-stream"
                imgs[n] = f"data:{mime};base64," + base64.b64encode(zf.read(n)).decode("ascii")
            if imgs:
                res["images"] = imgs
        return res

    # 单文件（或全部在根目录）
    single = parse_files(root_names, "", extra_images=image_entries)
    if single is not None:
        results[key_of(0)] = single
    # 子目录（多文件 batch）——目录名直接作为结果 key
    for dirname in sorted(groups):
        if dirname == "" or dirname == "images":
            continue
        parsed = parse_files(groups[dirname], f"{dirname}/")
        if parsed is not None:
            results[dirname] = parsed
    if not results:
        raise OfficialError(
            "结果 zip 里没有找到 full.md / *.md；可能解析失败或输出结构变化。zip 内容: "
            + ", ".join(zf.namelist()[:20]),
            status=502,
        )
    return results


# ---------------------------------------------------------------- http server -

class Handler(BaseHTTPRequestHandler):
    server_version = f"MinerUGateway/{VERSION}"
    protocol_version = "HTTP/1.1"

    # -- 基础工具 ----------------------------------------------------------

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
                "缺少官方 API token：请设置环境变量 MINERU_API_KEY，或让插件配置 apiKeyEnv=MINERU_API_KEY",
                status=401,
            )
        return OfficialClient(token=token), token

    # -- 路由 ----------------------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        try:
            if path == "/" or path == "":
                self.send_json(200, {
                    "name": "mineru-gateway",
                    "version": VERSION,
                    "protocol_version": PROTOCOL_VERSION,
                    "upstream": API_BASE,
                    "endpoints": ["/health", "POST /tasks", "/tasks/{task_id}", "/tasks/{task_id}/result"],
                })
            elif path == "/health":
                # 对齐插件 client.ts 的 HealthResponse
                self.send_json(200, {
                    "status": "healthy",
                    "version": f"gateway/{VERSION} (official api)",
                    "protocol_version": PROTOCOL_VERSION,
                    "queued_tasks": 0,
                    "processing_tasks": 0,
                    "completed_tasks": 0,
                    "failed_tasks": 0,
                    "max_concurrent_requests": 0,
                    "processing_window_size": 0,
                    "task_retention_seconds": 86400,
                    "task_cleanup_interval_seconds": 300,
                })
            elif path.startswith("/tasks/"):
                segs = path[len("/tasks/"):].split("/")
                task_id = segs[0]
                client, _ = self._authorized_client()
                meta = STORE.get(task_id)
                if meta is None:
                    self.send_json(404, {"error": f"未知任务 {task_id}（网关不保存跨重启状态）"})
                    return
                if len(segs) == 2 and segs[1] == "result":
                    if meta.get("status") != "completed":
                        # 未确认完成也顺手补轮询一次
                        data = client.get_task(task_id)
                        v2_status(task_id, meta or {}, data)
                        meta = STORE.get(task_id) or meta
                        if meta.get("status") != "completed":
                            self.send_json(409, {"error": f"任务未完成，当前状态 {meta.get('status', 'unknown')}"})
                            return
                    results: Dict[str, Any] = {}
                    url_cache: Dict[str, Dict[str, Dict[str, Any]]] = {}
                    entries = meta.get("entries") or []
                    if not entries and meta.get("full_zip_url"):
                        entries = [{"file_name": (meta.get("file_names") or [""])[0], "full_zip_url": meta["full_zip_url"]}]
                    for entry in entries:
                        zu = entry.get("full_zip_url")
                        fname = entry.get("file_name") or ""
                        if not zu:
                            continue
                        if zu not in url_cache:
                            zip_bytes = client.download_zip(zu)
                            url_cache[zu] = map_result_zip(zip_bytes, meta)
                        res = url_cache[zu]
                        if len(res) == 1:
                            results[fname or next(iter(res))] = next(iter(res.values()))
                        else:
                            # 合并包：按 zip 内部目录名当 key
                            results.update(res)
                    if not results:
                        self.send_json(502, {"error": "官方结果中没有可用条目（含 full_zip_url）"})
                        return
                    self.send_json(200, {
                        "backend": meta.get("backend") or "pipeline",
                        "version": "4",
                        "results": results,
                    })
                else:
                    data = client.get_task(task_id)
                    # v2_status 内部会把状态/url 写回 STORE，供 result 阶段读取
                    out = v2_status(task_id, meta or {}, data)
                    self.send_json(200, out)
            else:
                self.send_json(404, {"error": f"未知路径 {path}"})
        except Exception as e:  # noqa: BLE001
            self.handle_error_json(e)

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path != "/tasks":
            self.send_json(404, {"error": f"未知路径 {path}"})
            return
        try:
            body = self._read_body()
            files_field, fields = parse_multipart(self.headers.get("Content-Type") or "", body)
            if not files_field:
                self.send_json(400, {"error": "请求里没有 files 字段（multipart 上传）"})
                return
            client, _ = self._authorized_client()

            # 组装参数
            backend = fields.get("backend", "pipeline")
            file_names = [fn for _, fn, _ in files_field]
            model_version = map_model_version(backend, file_names[0] if file_names else "")
            extra: Dict[str, Any] = {}
            extra["is_ocr"] = map_is_ocr(fields.get("parse_method", ""))
            lang = (fields.get("lang_list") or "ch").split(",")[0] or "ch"
            extra["language"] = lang
            if fields.get("formula_enable") is not None:
                extra["enable_formula"] = fields["formula_enable"].strip().lower() == "true"
            if fields.get("table_enable") is not None:
                extra["enable_table"] = fields["table_enable"].strip().lower() == "true"
            # 页范围：插件是 0 基（默认 0..99999），官方是 1 基
            try:
                start = int(fields.get("start_page_id", "0"))
            except ValueError:
                start = 0
            try:
                end = int(fields.get("end_page_id", "99999"))
            except ValueError:
                end = 99999
            if start > 0 or end < 99999:
                extra["page_ranges"] = f"{start + 1}--1" if end >= 99999 else f"{start + 1}-{end + 1}"

            # 1. 换预签名上传地址（batch_id 即任务 id）
            batch_id, upload_urls = client.get_file_urls(file_names, model_version, extra)
            # 2. 上传（预签名 PUT，不带任何自定义头）
            for (_fname, fname, data), up_url in zip(files_field, upload_urls):
                client.upload_file(up_url, data)
            task_id = batch_id

            meta = {
                "task_id": task_id,
                "batch_id": batch_id,
                "full_zip_url": None,
                "status": "pending",
                "backend": backend,
                "file_names": file_names,
                "created_at": now_iso(),
                "started_at": None,
                "completed_at": None,
                "error": None,
                "return_middle_json": fields.get("return_middle_json", "").lower() == "true",
                "return_model_output": fields.get("return_model_output", "").lower() == "true",
                "return_content_list": fields.get("return_content_list", "").lower() == "true",
                "return_images": fields.get("return_images", "").lower() == "true",
            }
            STORE.put(task_id, meta)
            self.send_json(202, {
                "task_id": task_id,
                "status": "pending",
                "backend": backend,
                "file_names": file_names,
                "created_at": meta["created_at"],
                "started_at": None,
                "completed_at": None,
                "error": None,
                "status_url": f"/tasks/{task_id}",
                "result_url": f"/tasks/{task_id}/result",
                "queued_ahead": 0,
                "message": None,
            })
        except Exception as e:  # noqa: BLE001
            self.handle_error_json(e)

    do_PUT = do_POST  # 占位（本网关不用 PUT 对外）  # noqa: N815


# ---------------------------------------------------------------- selftest ---

def selftest() -> int:
    """离线自检：注入 FakeOfficial，验证协议与映射，不调用官方 API。"""
    import urllib.parse

    class FakeOfficial:
        def __init__(self) -> None:
            self.uploaded = []

        def get_file_urls(self, names, model_version, extra=None):
            return "fake-batch-id", [f"https://fake.upload/{urllib.parse.quote(n)}" for n in names]

        def upload_file(self, upload_url, data):
            self.uploaded.append(data)
            assert data.startswith(b"%PDF")

        def get_task(self, batch_id):
            if batch_id == "fake-batch-id":
                return {
                    "state": "done",
                    "err_msg": "",
                    "full_zip_url": "https://fake.zip/result.zip",
                    "extract_result": [
                        {"file_name": "demo.pdf", "state": "done", "err_msg": "", "full_zip_url": "https://fake.zip/result.zip"}
                    ],
                }
            return {"state": "pending", "err_msg": "", "full_zip_url": None, "extract_result": []}

        def download_zip(self, zip_url):
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as zf:
                zf.writestr("full.md", "# 你好\n\n解析结果 markdown")
                zf.writestr("layout.json", '{"blocks": []}')
                zf.writestr("content_list.json", '[]')
                zf.writestr("images/demo.png", b"\x89PNG fake")
            return buf.getvalue()

    check = {"ok": 0, "fail": 0}

    def expect(name, cond, extra=""):
        if cond:
            check["ok"] += 1
            print(f"  OK   {name}")
        else:
            check["fail"] += 1
            print(f"  FAIL {name}  {extra}")

    # 离线自检：直接驱动 OfficialClient(fake) + 手工组装 meta 验证映射
    print("== 1. 参数映射 ==")
    expect("model: pipeline", map_model_version("pipeline", "a.pdf") == "pipeline")
    expect("model: vlm", map_model_version("vlm-engine", "a.pdf") == "vlm")
    expect("model: hybrid->vlm", map_model_version("hybrid-engine", "a.pdf") == "vlm")
    expect("model: html", map_model_version("pipeline", "a.html") == "MinerU-HTML")
    expect("ocr: parse_method=ocr -> True", map_is_ocr("ocr") is True)
    expect("ocr: auto -> False", map_is_ocr("auto") is False)

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
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="return_images"\r\n\r\n'
        "false\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")
    files_field, fields = parse_multipart(f'multipart/form-data; boundary="{boundary}"', body)
    expect("文件分块解析出 1 个（带文件名）", len(files_field) == 1 and files_field[0][1] == "demo.pdf" and files_field[0][2].startswith(b"%PDF"))
    expect("文本字段 backend", fields.get("backend") == "pipeline")
    expect("文本字段 return_images", fields.get("return_images") == "false")

    print("== 3. 官方流程（fake）与 v2 状态映射 ==")
    fake = FakeOfficial()
    client = OfficialClient(token="t")
    client.fake(fake)
    batch_id, urls = client.get_file_urls(["demo.pdf"], "pipeline", {"language": "ch"})
    expect("batch_id + upload_url 获取", batch_id == "fake-batch-id" and len(urls) == 1)
    client.upload_file(urls[0], b"%PDF-1.4 fake content")
    expect("上传有文件字节", fake.uploaded and fake.uploaded[0].startswith(b"%PDF"))
    task_id = batch_id
    data = client.get_task(task_id)
    expect("任务初始状态 pending", client.get_task("other-id")["state"] == "pending")
    expect("state=done 映射 completed", STATE_MAP.get(data["state"]) == "completed")

    meta = {
        "task_id": task_id, "batch_id": batch_id, "full_zip_url": None, "status": "pending",
        "backend": "pipeline", "file_names": ["demo.pdf"], "created_at": now_iso(),
        "started_at": None, "completed_at": None, "error": None,
        "return_middle_json": True, "return_model_output": False,
        "return_content_list": True, "return_images": True,
    }
    STORE.put(task_id, meta)  # 与 Handler 提交时一致
    out = v2_status(task_id, meta, data)
    expect("v2 status: completed", out["status"] == "completed")
    stored = STORE.get(task_id) or {}
    expect("v2 status 保存 entries（含逐文件 full_zip_url）", bool(stored.get("entries")))
    zbytes = client.download_zip("https://fake.zip/result.zip")
    results = map_result_zip(zbytes, meta)
    expect("结果 zip -> md_content", "你好" in results["demo.pdf"]["md_content"])
    expect("结果 zip -> middle_json", results["demo.pdf"].get("middle_json") == '{"blocks": []}')
    expect("结果 zip -> content_list", results["demo.pdf"].get("content_list") == "[]")
    expect("结果 zip -> images(base64)", "data:image/png;base64," in results["demo.pdf"]["images"]["images/demo.png"])

    print("== 4. token 解析 ==")
    os.environ.pop("MINERU_API_KEY", None)
    expect("env token 优先", resolve_token("Bearer header-token") == "header-token")
    os.environ["MINERU_API_KEY"] = "env-token"
    expect("header token 回退", resolve_token("Bearer header-token") == "env-token")
    os.environ.pop("MINERU_API_KEY", None)

    print(f"\n结果: {check['ok']} 通过, {check['fail']} 失败")
    return 1 if check["fail"] else 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()
    if "--version" in sys.argv:
        print(f"mineru-gateway {VERSION} (protocol v2, upstream {API_BASE})")
        return 0

    try:
        httpd = ThreadingHTTPServer((GATEWAY_HOST, GATEWAY_PORT), Handler)
    except OSError as e:
        print(f"监听 {GATEWAY_HOST}:{GATEWAY_PORT} 失败: {e}（是否已有另一个 gateway 实例在跑？）")
        return 1
    print(f"mineru-gateway {VERSION} listening on http://{GATEWAY_HOST}:{GATEWAY_PORT}")
    print(f"upstream official API: {API_BASE}")
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