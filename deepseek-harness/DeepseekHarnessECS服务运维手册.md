# Deepseek Harness ECS 服务运维手册

> 更新时间：2026-08-23
>
> ECS：Alibaba Cloud Linux 3
>
> 项目目录：
>
> ```text
> /opt/apps/deepseek-harness
> ```

---

# 一、整体架构

目前 ECS 上长期运行三个 systemd 服务：

```text
                     Cloudflare Pages
                            │
                            ▼
                  Quick Tunnel（trycloudflare）
                            │
                            ▼
                 RiskTrace FastAPI (8000)
                            │
                            ├──────────────┐
                            ▼              ▼
                  DeepSeek Harness     MinerU Gateway
                                          │
                                          ▼
                                     mineru.net
```

三个后台服务：

| 服务 | systemd 名称 | 端口 | 功能 |
|-------|-------------|------|------|
| FastAPI | risktrace-fastapi | 8000 | DeepSeek Harness API |
| MinerU Gateway | risktrace-mineru | 18000 | PDF解析 Gateway |
| Cloudflare Quick Tunnel | cloudflared-quick | 无 | 对外暴露 FastAPI |

---

# 二、查看全部服务状态

```bash
systemctl status \
risktrace-fastapi \
risktrace-mineru \
cloudflared-quick
```

正常应看到：

```text
Active: active (running)
```

---

# 三、查看是否开机启动

```bash
systemctl is-enabled \
risktrace-fastapi \
risktrace-mineru \
cloudflared-quick
```

全部应返回

```text
enabled
```

---

# 四、启动

全部启动：

```bash
sudo systemctl start risktrace-fastapi
sudo systemctl start risktrace-mineru
sudo systemctl start cloudflared-quick
```

---

# 五、停止

```bash
sudo systemctl stop risktrace-fastapi
sudo systemctl stop risktrace-mineru
sudo systemctl stop cloudflared-quick
```

---

# 六、重启

修改代码后：

```bash
sudo systemctl restart risktrace-fastapi
```

修改 gateway 后：

```bash
sudo systemctl restart risktrace-mineru
```

重新建立 Quick Tunnel：

```bash
sudo systemctl restart cloudflared-quick
```

全部一起：

```bash
sudo systemctl restart \
risktrace-fastapi \
risktrace-mineru \
cloudflared-quick
```

---

# 七、查看日志

## FastAPI

实时日志

```bash
journalctl -u risktrace-fastapi -f
```

最近50行

```bash
journalctl -u risktrace-fastapi -n 50 --no-pager
```

---

## MinerU

实时

```bash
journalctl -u risktrace-mineru -f
```

最近

```bash
journalctl -u risktrace-mineru -n 50 --no-pager
```

---

## Quick Tunnel

实时

```bash
journalctl -u cloudflared-quick -f
```

最近

```bash
journalctl -u cloudflared-quick -n 50 --no-pager
```

---

# 八、FastAPI 健康检查

本机：

```bash
curl http://127.0.0.1:8000/healthz
```

正常：

```json
{
  "status":"ok",
  "service":"risktrace-deepseek-harness",
  "version":"0.1.0"
}
```

---

# 九、MinerU Gateway 检查

启动日志：

```text
mineru-gateway 1.0.0 listening on http://127.0.0.1:18000
```

查看：

```bash
journalctl -u risktrace-mineru -n 20 --no-pager
```

如果 Gateway 提供 health 接口：

```bash
curl http://127.0.0.1:18000/health
```

---

# 十、Quick Tunnel 当前地址

查看当前 Quick Tunnel：

```bash
curl http://127.0.0.1:55555/quicktunnel
```

返回例如：

```json
{
  "hostname":"title-louisville-survey-experts.trycloudflare.com"
}
```

真正供 RiskTrace 使用的是：

```text
https://title-louisville-survey-experts.trycloudflare.com
```

---

# 十一、Pages 环境变量

Cloudflare Pages：

```text
DEEPSEEK_HARNESS_BASE_URL
```

应填写：

```text
https://xxxx.trycloudflare.com
```

其中 xxxx 为上一节查询出的 hostname。

> **注意：Quick Tunnel 每次重启可能变化。**

若 Quick Tunnel 地址变化：

1.

```bash
curl http://127.0.0.1:55555/quicktunnel
```

2.

复制新的 hostname

3.

修改 Cloudflare Pages

```text
DEEPSEEK_HARNESS_BASE_URL
```

4.

重新部署 Pages

---

# 十二、常见故障

---

## FastAPI 无法启动

查看：

```bash
journalctl -u risktrace-fastapi -n 100 --no-pager
```

检查：

- uv 是否存在
- WorkingDirectory 是否正确
- 8000 是否被占用

查看端口：

```bash
ss -lntp | grep 8000
```

---

## MinerU 无法启动

查看：

```bash
journalctl -u risktrace-mineru -n 100 --no-pager
```

常见原因：

- 18000 已占用
- gateway.py 已手工运行
- MINERU_API_KEY 未配置

查看：

```bash
ss -lntp | grep 18000
```

---

## Quick Tunnel 无法建立

查看：

```bash
journalctl -u cloudflared-quick -f
```

检查：

```bash
curl http://127.0.0.1:55555/quicktunnel
```

若无返回：

重启：

```bash
sudo systemctl restart cloudflared-quick
```

---

## Provider Check FastAPI 失败

第一步：

```bash
curl http://127.0.0.1:8000/healthz
```

第二步：

```bash
curl http://127.0.0.1:55555/quicktunnel
```

第三步：

确认

```text
DEEPSEEK_HARNESS_BASE_URL
```

是否已更新为新的 Quick Tunnel 地址。

---

# 十三、升级代码流程

更新后重启：

```bash
sudo systemctl restart risktrace-fastapi
sudo systemctl restart risktrace-mineru
```

如果 FastAPI 重启导致 Quick Tunnel 地址变化：

```bash
sudo systemctl restart cloudflared-quick
```

重新获取：

```bash
curl http://127.0.0.1:55555/quicktunnel
```

更新 Pages：

```text
DEEPSEEK_HARNESS_BASE_URL
```

重新部署即可。

---

# 十四、完整运维检查（建议）

建议每次部署完成后执行：

```bash
systemctl status \
risktrace-fastapi \
risktrace-mineru \
cloudflared-quick
```

```bash
curl http://127.0.0.1:8000/healthz
```

```bash
curl http://127.0.0.1:55555/quicktunnel
```

确认：

- FastAPI 正常
- MinerU 正常
- Quick Tunnel 正常
- Pages 环境变量已同步最新 Tunnel 地址

然后在 RiskTrace 页面执行：

> **Provider 检查**

确认：

```text
Pages Functions        ✅
FastAPI                ✅
DeepSeek Harness       ✅
```

至此，整个 deepseek-harness 后端服务运行正常。