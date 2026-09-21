# LTZZZ 长期记忆

最后更新：2026-09-21
晋升：CAND-20260921-001 / 002 / 003（人工确认）

## 项目是什么

- **名称：** LTZZZ 数字实验室
- **定位：** 用 AI、代码、数据做可验证实验；不是单纯短视频号。
- **主线：** 观 → 行深 → 实验 → 结果
- **网站：** https://ltzzz.com
- **仓库：** https://github.com/ltzyz2181-collab/ltzzz
- **主权：** 人类控制域名、仓库、钱包与商户
- **记忆入口：** https://ltzzz-memory-gateway.ltzyz2181.workers.dev

## 已验证链路

| 项 | 状态 |
|----|------|
| GitHub Pages | 可用 |
| Memory Gateway | `ok:true`，source=github，**r2_bound=false**（桶 ltzzz-memory 未建） |
| DeepSeek Worker | 可用 |
| 豆包 Worker | `/health` ok=true，has_key=true |
| Daily Scheduler | `/health` ok，**dry_run=true**；现网 cron 仅 **`0 * * * *`**（Free 最多 5 条，6 条分时未挂上） |
| Patrol → daily summary | T022 dry-run |
| 视频资产 Worker | `ltzzz-t026-video-assets`，KV `asset:` |
| 结算记录 Worker | `ltzzz-auto-withdraw`，KV `withdraw:`，**AUTO_TEST_MODE=true** 不真打款 |
| 共用 KV | `63c6bb670cfc42b18b4d232605d5bcad` |
| 钱包连接只读 | 可用 |
| pay-proxy 账本只读 | 可用 |
| Safe 3/5 | 已确认 |
| 支付宝真付 | 挂起 |

## 失败与禁区

| 事件 | 教训 |
|------|------|
| 提币错网（X Layer） | 网络必须与收款方一致 |
| 豆包 TikTok OAuth 502 | 与方舟 API 无关 |
| 支付宝权限/风控 | 等官方重签 |
| CF Token 无 R2 Write | 不能 `r2 bucket create`；不能写 r2_bound=true |
| Workers Free cron 10072 | 全账号最多 5 条触发器 |
| Key 进前端 | 禁止 |
| AI 当多签 owner | 禁止 |

## 禁区

- 索要私钥 / 助记词 / 验证码
- API Key 写入仓库或网页
- 宣称 AI 接管资金
- 未授权自动扣款与大额链上转账
- 把 proposed 写成 applied
