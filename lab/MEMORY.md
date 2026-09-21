# LTZZZ 长期记忆

最后更新：2026-09-21

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
| Memory Gateway | 可用（`ok:true`，source=github，r2_bound=false） |
| DeepSeek Worker | 可用 |
| 豆包 Worker | 2026-09-21 复测 `/health` ok=true，has_key=true |
| Daily Scheduler Worker | 线上 `/health` ok，**dry_run=true** |
| Patrol → daily summary | T022：Actions 写 `memory/daily/summary-*.md`，仍 dry-run |
| 钱包连接只读 | 可用 |
| pay-proxy 账本只读 | 可用 |
| Safe 3/5 链上 | 已确认 |
| 支付宝真付 | 挂起 |

## 失败与禁区

| 事件 | 教训 |
|----|------|
| 提币错网（X Layer） | 网络必须与收款方一致 |
| 豆包 TikTok OAuth 502 | 与方舟 API 无关 |
| 支付宝权限/风控 | 等官方重签；不绕过 |
| Key 进前端 | 禁止 |
| AI 当多签 owner | 禁止 |
| 账号被封（机器人） | 不代登录、不代操作账号 |

## 禁区（对所有 AI）

- 索要私钥 / 助记词 / 验证码
- API Key 写入公开仓库或网页
- 宣称 AI 接管资金
- 未授权的自动扣款与大额链上转账
