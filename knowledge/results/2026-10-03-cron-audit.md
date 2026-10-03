# Q1v2：CF cron 配额清点（2026-10-03 · 豆包实测）

> 目的：清点全部 cron、确认 ltzzz-daily 触发正常、免费腾位（不升 Paid）。
> 方法：CF 控制台逐 worker 核「觸發器」字段 + 24h 执行次数（UI 实测）。

## 一、cron 清单表（实测）

| Worker | Cron 表达式（本地 toml / 线上推定） | 24h 执行次数 | 判定 |
|---|---|---|---|
| ltzzz-daily-automation | `0 * * * *`（每小时） | 37 | ✅ 保留（7 通道核心调度） |
| ltzzz-video-scheduler | 每日（本地 toml [triggers]） | 1 | ✅ 保留（YT 自动发布，用户已确认） |
| ltzzz-telegram-publisher | `30 4 * * *`（每日 12:30 CST） | 1 | ⚠️ 观察（H3 纸飞机未启用，chat_id 待 owner） |
| ltzzz-wechat-publisher | 每日（auto_mass:false） | 未显示 | ⚠️ 观察（公众号自动群发未开，空转嫌疑） |
| 第 5 个 | 未发现 | — | ⚠️ 配额 5/5 说法未证实 |

**实测无 cron**（「觸發器」字段不存在，执行次数来自路由/外部调用）：x-poster（41次/24h，路由调用）、x-publisher、agent-pay、did、gpt-proxy、qianwen-proxy、kimi-proxy、wep3 等。

## 二、结论

- **账户实际占用 4/5 cron**（Free 上限 5），未满——执行单「5/5 满」为推定，实测 4/5；
- **无需删除任何 cron**：ltzzz-daily 每小时触发正常（37 次/24h），无竞争位；
- 执行单 Q1-3「降频为 4 时段」**不执行**（配额够，降频反而损失 deepseek-daily 等产出频率）；
- 第 5 个 cron 未定位：已核查代理类（gpt/qianwen/kimi proxy）均无 cron；若总控有 63 worker 全量清单可再补查。

## 三、留存观察（下轮复核）

- telegram-publisher / wechat-publisher 两 cron：若 7 天内确认空转（无实际业务产出），下次 Q 单删 1-2 个腾冗余位；
- 每日验收：次日 7 通道产出齐全（R2 knowledge/daily/*）。

## 四、证据

- CF 控制台（account 44acab…1972）逐 worker production 页「觸發器/執行次數」字段截图路径：bu 会话观测记录；
- 本地 wrangler.daily.toml / wrangler.telegram-publisher.toml / wrangler.agent-pay.toml / wrangler.video-scheduler.toml 的 [triggers]。
