# LTZZZ Token 调度台账（单一事实来源 · 根治"天天找 key"）

> 立此文件原因（owner 2026-10-06 原话）："天天找 key、天天申请新 key，也不调度 token，各 AI 充值额度一分没用，这个怎么能跑起来。"
> 本文件是**唯一**的 token 状态来源。任何 AI/席位判断"用哪个 key"时，先读本表，**不要再各自找 key、各自申请新 key**。

## 一、调度铁律（先读这个）

1. **key 只在此登记，不在别处散落。** 新 key 必须在此登记后才能用；未登记的 key 视为不存在。
2. **先看状态列，再决定用不用。** 余额耗尽（⛔）的 key 不派单，除非先充值并更新本表。
3. **申请新 key 是最后手段。** 先确认现有 key 是否可用、是否只是模型名/限流问题；可用的绝不重申请。
4. **每把 key 的每次调用都应有对应席位。** 无席位的 key 不保留。
5. **额度变化必须回写本表。** 谁充值、谁耗尽、谁轮换，当天回写，不留"台账滞后于现实"。

## 二、AI 模型 Key 调度表（2026-10-06 快照）

| 归属 | 席位 | key 掩码 | 存放位置 | 状态 |
|---|---|---|---|---|
| DeepSeek | deepseek | `sk-a****2dfa` | ltzzz-deepseek-proxy | ✅ 可调用 |
| 千问/百炼 | qianwen | `sk-w****Mr34` | ltzzz-qianwen-proxy | ✅ has_key |
| Kimi/Moonshot | kimi | `sk-a****9T9S` | ltzzz-kimi-proxy | ⚠️ 模型名已修为 kimi-k2.6，限流待观察 |
| GPT/OpenAI | gpt | `sk-p****-NIA` | — | ⛔ 余额耗尽（429） |
| Claude/Anthropic | claude | `sk-a****6gAA` | — | ⛔ credit too low |
| 火山方舟 | doubao | `ark-****3a78` | doubao-proxy | ✅ 在用 |
| Grok/XAI | grok | 见密钥台账 v3 | owner 本机 | ⚠️ 私钥文件与地址不匹配 |
| Microsoft | microsoft | — | 未部署 | ⏸️ skipped |

## 三、平台凭据调度表

| 平台 | 状态 | 备注 |
|---|---|---|
| 微信小店/小程序/公众号 | ✅ 已具备 | 虚拟商品类目受限 |
| TikTok | ⚠️ 应用审核未过 | 客户端密钥在，链路未通 |
| GitHub | ✅ 在用 | git 凭据管理器 |
| Cloudflare API Token | `cfut****bdd2` | 归属待 owner 确认 |
| YouTube OAuth | ⚠️ scope 已扩权，需重新授权 | 见 §四 |

## 四、已知卡点与下一步

| # | 卡点 | 根因 | 下一步 |
|---|---|---|---|
| 1 | GPT 余额耗尽 | 未充值 | owner 充值后回写本表 |
| 2 | Claude credit too low | 未充值 | owner 充值后回写本表 |
| 3 | YouTube 自动发布 | OAuth 未重新授权 | owner 走 /auth/start 授权 |
| 4 | Grok key 文件 | 私钥与地址不匹配 | owner 确认真实归属 |
| 5 | 各 AI 读不到记忆 | 未按指引读仓库 | 派单 MEMORY-FIX-013 |

## 五、调度闭环（怎么"跑起来"）

1. **每日任务生成时**：按本表状态选席位——⛔ 不排，⚠️ 排观察项，✅ 排主任务。
2. **每日回执时**：回执带 `token_status` 字段，任何异常当天回写本表。
3. **充值动作**：owner 充值 → 总控把 ⛔ 改 ✅ → 下一轮调度才重新启用。
4. **申请新 key**：只有本表明确"无可用 key"时才发起。

> 一句话：**key 不是"找到"的，是"调度"的。**

---
*立：千问（代总控）· 2026-10-06*