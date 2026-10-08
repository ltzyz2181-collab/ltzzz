# LTZZZ Token 调度台账（单一事实来源 · 根治"天天找 key"）

> 立此文件原因（owner 2026-10-06 原话）："天天找 key、天天申请新 key，也不调度 token，各 AI 充值额度一分没用，这个怎么能跑起来。"
> 本文件是**唯一**的 token 状态来源。任何 AI/席位判断"用哪个 key"时，先读本表，**不要再各自找 key、各自申请新 key**。

## 一、调度铁律（先读这个）

1. **key 只在此登记，不在别处散落。** 新 key 必须在此登记后才能用；未登记的 key 视为不存在。
2. **先看状态列，再决定用不用。** 余额耗尽（⛔）的 key 不派单，除非先充值并更新本表。
3. **申请新 key 是最后手段。** 先确认现有 key 是否可用、是否只是模型名/限流问题；可用的绝不重申请。
4. **每把 key 的每次调用都应有对应席位。** 无席位的 key 不保留。
5. **额度变化必须回写本表。** 谁充值、谁耗尽、谁轮换，当天回写，不留"台账滞后于现实"。

## 二、AI 模型 Key 调度表（2026-10-08 更新）

| 归属 | 席位 | key 掩码 | 存放位置 | 状态 |
|---|---|---|---|---|
| DeepSeek | deepseek | `sk-a****2dfa` | ltzzz-deepseek-proxy | ✅ 可调用 |
| 千问/百炼 | qianwen | `sk-w****Mr34` | ltzzz-qianwen-proxy | ✅ has_key |
| Kimi/Moonshot | kimi | `sk-a****9T9S` | ltzzz-kimi-proxy | ⚠️ 模型名已是 kimi-k2.6，限流待观察 |
| GPT/OpenAI | gpt | `sk-p****-NIA` | — | ✅ **10-07 实测在用**（旧"余额耗尽"条目已过时，当日消耗 9038 tokens） |
| Claude/Anthropic | claude | `sk-a****6gAA` | — | ⛔ credit too low（10-07 实测 api_error；唯一真耗尽席位）|
| 火山方舟 | doubao | `ark-****3a78` | doubao-proxy | ✅ 在用（10-07 实测消耗 10061 tokens）|
| Grok/XAI | grok | `xai-…`（值存 Worker Secret）| ltzzz-xai-proxy | ✅ **10-08 已注入 Worker Secret，模型 grok-4-fast** |
| Microsoft | microsoft | — | 未部署 | ⏸️ skipped |

## 三、平台凭据调度表

| 平台 | 状态 | 备注 |
|---|---|---|
| 微信小店/小程序/公众号 | ✅ 已具备 | 虚拟商品类目受限 |
| TikTok | ⚠️ 应用审核未过 | 客户端密钥在，链路未通 |
| GitHub | ✅ 在用 | 已引入 GitHub MCP 写通道（总控可直写仓库，不再依赖本地 git push）|
| **Cloudflare API Token** | ✅ **已启用** | `cfut****bdd2`（Key.doc 内），2026-10-08 总控实测登录成功，账号 `44acab6e…1972`。具备 Workers:Edit；**缺** Workers Routes:Edit / DNS:Edit（挂自定义域名需补）|
| YouTube OAuth | ⚠️ scope 已扩权，需重新授权 | 见 §四 |

## 四、已知卡点与下一步

| # | 卡点 | 根因 | 下一步 |
|---|---|---|---|
| 1 | Claude credit too low | 未充值 | owner 充值后回写本表（唯一真干席位）|
| 2 | YouTube 自动发布 | OAuth 未重新授权 | owner 走 /auth/start 授权 |
| 3 | Grok key 文件（0x93f4…）不匹配 | 私钥与地址不匹配 | owner 确认真实归属 |
| 4 | 各 AI 读不到记忆 | 未按指引读仓库 | 已发 docs/MEMORY-ACCESS-GUIDE.md |
| 5 | CF Token 缺路由权 | 待补 Workers Routes:Edit + DNS:Edit | owner 在 CF 后台补勾 |
| 6 | Wallet Ops 每 6h 失败 | 缺 contents:write | ✅ 已修（commit 56da710）|

## 五、调度闭环（怎么"跑起来"）

1. **每日任务生成时**：按本表状态选席位——⛔ 不排，⚠️ 排观察项，✅ 排主任务。
2. **每日回执时**：回执带 `token_status` 字段，任何异常当天回写本表。
3. **充值动作**：owner 充值 → 总控把 ⛔ 改 ✅ → 下一轮调度才重新启用。
4. **申请新 key**：只有本表明确"无可用 key"时才发起。
5. **自动自检**：`.github/workflows/key-liveness.yml` 每日 09:30 自动探测各席位 key 存活，结果落 `knowledge/results/key-liveness-YYYY-MM-DD.json`。

> 一句话：**key 不是"找到"的，是"调度"的。**

---
*立：千问（代总控）· 2026-10-06 · 更新 2026-10-08（CF token 启用 + XAI 部署 + wallet-ops 修复）*
