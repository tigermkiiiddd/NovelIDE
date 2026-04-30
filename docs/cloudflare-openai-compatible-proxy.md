# Cloudflare OpenAI-Compatible 代理部署说明

这个代理用于解决浏览器无法直连部分 OpenAI-compatible 供应商的问题，例如 Kimi 返回缺少 `Access-Control-Allow-Origin` 导致 NovelIDE 页面被 CORS 拦截。

## 当前代理入口

Cloudflare Pages Functions 会自动加载：

```text
functions/api/ai/openai-compatible/[[path]].ts
```

Kimi 的前端 Base URL 配置为：

```text
/api/ai/openai-compatible/kimi
```

NovelIDE 的 OpenAI SDK 会自动拼出：

```text
/api/ai/openai-compatible/kimi/v1/chat/completions
```

代理再转发到：

```text
https://api.kimi.com/coding/v1/chat/completions
```

## Key 存放方式

这个代理按 BYOK 设计。Kimi key 不放在 Cloudflare Pages 环境变量里。

用户在 NovelIDE 前端 AI 设置里填写自己的 API Key。NovelIDE 现有配置会保存到浏览器本地 IndexedDB 的 `settings/global`，请求时由浏览器通过 `Authorization: Bearer ...` 发给同源 Worker。

可选覆盖 Kimi 上游地址：

```text
KIMI_OPENAI_BASE_URL=https://api.kimi.com/coding
```

默认已经是这个地址，通常不需要配置。

## NovelIDE 前端配置

进入 NovelIDE 的 AI 设置，选择默认新增的：

```text
Kimi Proxy (Cloudflare)
```

确认字段：

```text
Base URL: /api/ai/openai-compatible/kimi
API Key: 你的 Kimi key
Model: kimi-for-coding
```

Worker 只转发当前请求里的 `Authorization`，不会保存 key，也不会从 Cloudflare 环境变量读取平台 key。

## 部署

正常部署 Cloudflare Pages 即可。Pages 会同时部署静态前端和 `functions/` 下的代理函数。

本地构建命令仍然是：

```bash
npm run build
```

Cloudflare Pages 构建命令仍可使用项目已有脚本：

```bash
./build-cloudflare.sh
```

部署后可以用浏览器访问 NovelIDE，再用 Kimi Proxy provider 发起一次 Agent 请求。请求应该打到同源地址：

```text
https://novelide.pages.dev/api/ai/openai-compatible/kimi/v1/chat/completions
```

不应该再从浏览器直接请求：

```text
https://api.kimi.com/coding/v1/chat/completions
```

## 约束

- 这个代理只解决 OpenAI-compatible 协议的转发和 CORS。
- 它不是 Claude/Anthropic 协议适配器。
- 当前内置 provider 白名单只有 `kimi` 和 `moonshot`，避免变成任意公网转发代理。
- 流式响应会透传给前端，NovelIDE 仍按原来的 OpenAI-compatible streaming 逻辑处理。
