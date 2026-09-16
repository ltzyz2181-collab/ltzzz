# LTZZZ Agent Payment + 视频发布自动部署任务

## A. 云端任务队列
把现有 `网页 POST /run + 手工授权码` 升级为：

任务队列 → Cloudflare Queue → Worker Consumer → 豆包 → Cloudflare Sandbox → GitHub/Cloudflare

要求：网页只负责写任务，不再要求用户输入部署授权码；保留 GPT=总控、豆包=执行、Microsoft=考察员、核心治理 3/5 + 用户确认。

优先使用 Cloudflare Queues；增加任务状态 queued/planning/running/completed/failed、重试、日志和结果摘要。Secret 只能存 Worker Secret。

## B. Agent Payment：从模拟 402 推进到测试网真实链路
检查现有 `agent-pay.html`、`agent-payment-policy.json`、`agent-pay-worker.js`。

使用 Cloudflare Agents 官方 x402 能力，测试网络使用 `base-sepolia`，测试 USDC；同时评估 MPP 兼容层。先完成 dry-run + testnet 真实支付 + verify/settle + receipt/ledger；不要启用生产资金自动支出。

测试流程：
1. 建立一个 LTZZZ paid test endpoint。
2. 未付款请求返回 HTTP 402。
3. Agent 根据支付挑战生成测试网 USDC 支付。
4. 验证并结算。
5. 重试原请求并取得资源。
6. 在 ledger 中记录金额、网络、recipient、tx/receipt、时间和结果。

支付私钥只允许放 Cloudflare Worker Secret，不得写入 GitHub/HTML/日志。

## C. 支付宝
不要把支付宝和 x402/MPP 混为一谈。检查当前支付宝审核/接口状态；如果生产接口尚未获批，则只做沙箱/模拟联调，并记录具体缺口。不要自行发真实 0.1 元转账。

## D. Gemini
检查现有 Gemini/Veo Worker。若 `GEMINI_API_KEY` 已配置，真实测试视频生成；若未配置，不停工，只报告缺少该 Secret。Secret 只放 Cloudflare Worker Secret。

## E. YouTube / TikTok
检查现有 `ltzzz-youtube-post`、`ltzzz-tiktok-post` 与 OAuth/KV 状态。

找到昨天已经制作好的 MP4 和对应标题/描述/素材，按真实授权状态执行：
- YouTube：真实上传，默认 `privacyStatus=private`，记录 video ID、processing 状态和错误。
- TikTok：如 `video.publish` 已授权则 Direct Post；未审核/受限时按平台实际权限走可用模式，不伪造公开发布成功。

## F. 最终报告
完成后报告：
- Queue/Consumer 是否部署
- x402 testnet 是否真实完成 402→pay→verify/settle→retry
- receipt/ledger 是否记录
- MPP 是否已接入或只完成评估
- Gemini/Veo 状态
- YouTube 上传结果
- TikTok 发布结果
- 支付宝审核/沙箱状态
- 仍缺哪些 Secret/授权

执行方式：检查 → 修改 → 测试 → 部署 → 验证 → 记录。不要只给部署教程。