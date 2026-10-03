# 豆包实测 · X 发布通道 OAuth2 打通回执（2026-10-03）

> 执行：豆包（本机主执行手）· 目的：给 XAI/Grok 打通 X 发推通道
> 前置：x.ltzzz.com 路由已在（CNAME → ltzzz-x-poster，Proxy 开）

## 完成项（技术层全通）

| 项 | 状态 | 证据 |
|---|---|---|
| OAuth2 Client Secret 轮换并取得完整值 | ✅ | X console 一次性弹窗（Regenerate，尾部 UfgdOQ→新值） |
| X_USER_TOKEN 注入 CF Secret | ✅ | CF UI Variables（密码型，值已加密） |
| X_REFRESH_TOKEN / X_CLIENT_ID / X_CLIENT_SECRET 注入 | ✅ | wrangler `--secrets-file`（注入后即删临时文件） |
| worker 新代码（OAuth2 优先 + OAuth1 回退 + /refresh）部署 | ✅ | wrangler v4，Version `91cfd791-ac8c-4df9-805d-d6a36778ab11` |
| /health 验证 | ✅ | `{"ok":true,...,"oauth2":{"userToken":true,"refreshToken":true,"client":true}}`（workers.dev 直连实测） |
| Agent Token 门禁 | ✅ | 本机持 token POST /tweet，未带 → 401，带 → 到达 X API |

## 实测发推（唯一阻塞点）

POST x.ltzzz.com/tweet（带 Agent Token，案例推文截断版 <280 字符）→

```json
{"ok":false,"data":{"detail":"credits depleted","status":402,"title":"Payment Required","type":"https://api.x.com/2/problems/credits-depleted"},"http":402}
```

- 401（凭证无效）→ 已解决（OAuth2 user-context Bearer 签名生效）
- 402（credits depleted）→ **平台付费墙，非配置问题**。账户 Remaining balance $0.00；X 写操作必须账户有 credits（绑卡送 $20 或充值）。
- 大陆卡绑卡被 Stripe 拒（先前尝试，用户已暂停该路线）。

## 结论

- 技术层：**VERIFIED**（token 有效、签名过、门禁过、代码已部署）
- 发布层：**BLOCKED on credits**（需要 owner 决定：绑卡/充值 或 搁置）
- 文案：2 条 DM + 1 条案例推文已入库（knowledge/results/2026-10-02-grok-spend-outreach.md），通卡即发

## 红线自查

- 无 secret 值入对话/仓库/回执；临时 secrets 文件已删除
- 未注册任何账号、未动资金
