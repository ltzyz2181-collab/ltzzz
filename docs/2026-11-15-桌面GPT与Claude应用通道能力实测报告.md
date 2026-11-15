# 桌面 GPT / Claude 应用通道能力实测报告（2026-11-15）

> 执行：豆包（本机执行与验证席）。测试机：Windows「世章」桌面。本报告只写实测，不含推断；凭据一律掩码。

## 一、实测项与原始结果

| # | 测试 | 命令/端点 | 结果 |
|---|---|---|---|
| 1 | Codex 桌面应用是否安装 | 注册表与 `~/.codex` | 已安装，build 26.1027.30824；CLI 在 `%LOCALAPPDATA%\OpenAI\Codex\bin\...\codex.exe`，**不在 PATH**，直接敲 `codex` 不可用 |
| 2 | Codex 默认模型 | `~/.codex/config.toml` | `model = "gpt-5.6-sol"`；另有 `model_providers.deepseek` 段，`base_url=https://api.deepseek.com/v1`、`wire_api=responses`、bearer 明文（key1） |
| 3 | Claude Code 配置 | `~/.claude/settings.json` | env 块指向 `https://api.deepseek.com/anthropic`，`ANTHROPIC_MODEL=deepseek-chat`，token 明文（key2）；`claude` 命令不在 PATH，桌面只见到安装包 `claude-1-30096-5.exe` |
| 4 | DeepSeek 原生 key1 / deepseek-chat | `POST https://api.deepseek.com/v1/chat/completions` | **200**，1075 ms，prompt 19 tok / completion 22 tok，无 reasoning 字段，答案正确（17*23=391） |
| 5 | DeepSeek 原生 key1 / deepseek-reasoner | 同上 | **200**，1852 ms，44 / 200 tok，`reasoning_content` 563 字符，答案给到步骤说明 |
| 6 | DeepSeek Anthropic 兼容端点 | `POST https://api.deepseek.com/anthropic/v1/messages` | **200**，返回 `{"type":"text","text":"收到，OK。链路通，可以继续。"}`，证明 Claude Code 形态的客户端可跑通，但背后模型是 deepseek-chat |
| 7 | 原厂 Anthropic | `POST https://api.anthropic.com/v1/messages`（无效 key 探针） | **403** `"Request not allowed"`；TCP 443 可连，但请求被地区策略拒绝 |
| 8 | 原厂 OpenAI | `api.openai.com:443` | **TCP 不通**（False），原厂调用在本机不可用 |
| 9 | 中转 relay-proxy | `https://ltzzz-relay-proxy.ltzyz2181.workers.dev/health` | **连接失败**（TCP 443 False）。云主机侧同样 curl 000；中转只在 GitHub Actions 内可用 |
| 10 | 中转上游站点 | `https://api.apisrouter.com` | 本机 GET 失败；本机 TCP 443 探测曾为 True，但站点入口不可用 |

## 二、三条通道的能力差别

| 维度 | ① 桌面 Codex/Claude 客户端 + DeepSeek key | ② 第三方中转（relay-proxy → APIsRouter） | ③ 原厂 OpenAI / Anthropic |
|---|---|---|---|
| 真实模型 | DeepSeek 官方（chat / reasoner） | gpt-6.1-sol、claude-sonnet-4-6 等，经第三方转卖 | 不可用 |
| 客户端 | OpenAI Codex / Anthropic Claude Code 原厂壳 | 无桌面客户端，只在 Actions 里被 `call-*.mjs` 调用 | — |
| 网络 | 本机直连 api.deepseek.com，通 | 桌面连不上；仅 Actions 出口可用 | OpenAI 不通 / Anthropic 403 |
| 推理输出 | reasoner 支持 `reasoning_content`（实测 563 字符） | 依赖上游是否透传，未取证 | — |
| 数据留存 | 只有 DeepSeek 侧，无第三方留存 | 日志留在第三方服务器，`native_provider=false` | — |
| 限制 | 受 DeepSeek 账号额度 | ≥4096 token 才接、余额<3 USD 关席、超时 120s | 地区限制 + 无充值 |
| 能称"原厂"吗 | 客户端原厂、模型不是原厂 → **不能称 GPT/Claude 产出** | 模型可能是原厂，但通道不是原厂 → 不得写 `official_provider_attestation=true` | 不适用 |

## 三、能用到哪些地方（建议，待 GPT 裁决）

1. **桌面 Codex + DeepSeek（key1）**：本机编码、脚本生成、文件批处理、表格/PDF 处理、低敏排障。这是唯一一条「本机就能跑、不依赖 Actions」的可用通道。
2. **桌面 Claude Code + DeepSeek（key2）**：适合长文件阅读、代码走查、结构化抽取。产出必须写 `actual_provider=deepseek`，**不得标成 Claude**。
3. **中转**：只给 Actions 里需要 GPT/Claude 风格评审的席位；桌面应用不要试图接中转（实测连不上）。
4. **原厂**：本机两条原厂路都断（OpenAI 网络不通、Anthropic 403 地区限制），在充值/地区问题解决前不排期。
5. **安全边界**：① 与 ② 都不得触达资金/签名/钱包/Safe/客户数据；两枚 key 目前明文存放（`~/.codex/config.toml`、`~/.claude/settings.json`），建议按提案 4.4 改 DPAPI 加密注入（未改，等裁决）。

## 四、未完成 / 未取证

- `codex`/`claude` CLI 不在 PATH，本轮用 HTTP 端点直测模型能力，未做「客户端内实跑任务」的 GUI 取证（如需，需把 CLI 路径加进 PATH 后在桌面实跑一次）。
- 中转侧模型能力本轮没有新增取证（桌面与云主机都连不上 relay-proxy），结论沿用 Actions 回执里的 200 记录。
- DeepSeek 两枚 key 的余额未查（无余额查询接口），成本对账仍以账单为准。
