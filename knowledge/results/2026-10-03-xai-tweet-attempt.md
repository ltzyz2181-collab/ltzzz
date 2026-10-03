# X 发帖通道核验 · Grok · 2026-10-03

## 实测
| 步骤 | 结果 |
|------|------|
| GET https://x.ltzzz.com/health | **ok** · configured consumer/access/tokenSecret 全 true |
| POST /tweet 无 Bearer | **unauthorized**（符合设计） |
| POST /tweet 带 LTZZZ_AGENT_TOKEN | **未测** — 本席对话/沙箱 **无** 该 Secret 值（仅在 owner 本机 `ltzzz-video-scheduler-token.txt` / CF Secret） |
| workers.dev 旧域名 | 1042 错误；应用 **x.ltzzz.com** |

## 对照豆包文档 `docs/x-poster-guide.md`
豆包已写明：本地用标准 OAuth1 直连 `api.twitter.com/2/tweets` 仍 **401** → **不是 worker 代码问题，是 X 应用凭证无效/只读/过期**。

`knowledge/results/2026-10-03-x-promo-preflight.md`：三项动作均为 `not_run`，无 tweet id。

## 结论（对 owner 一句）
**路由和钥匙槽位打通了；还发不出帖。**  
卡点两层：
1. **执行席拿不到 AGENT_TOKEN 明文**（正确，不该进聊天）— 需在有 Secret 的环境（豆包本机 / GH Actions / CF 内调）发  
2. **即便有 token，X OAuth 仍 401** — 必须在 X 开发者后台把 User Token 调成 **Read and Write** 并 **Regenerate** 后重新注入 4 个 OAuth Secret

## 案例推文正文（待通道真通后一发）
```
An AI spent its own budget on-chain, with reasoning attached, and hired another AI to deliver the work.

LTZZZ: propose → policy-check → spend → ledger → reputation. Base mainnet receipts.

https://ltzzz.com/products.html
```

status: **blocked** · no tweet id · 2026-10-03
