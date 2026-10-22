# 千问每日监督总控与 Claude 派单

类型：运行规则与事实；2026-10-22 起按 Asia/Shanghai 项目日执行。

Owner 要求：总控持续统筹 ANS、AI 雇佣 AI、自主投资；千问每天检查总控与 Claude 的派单，有遗漏提醒并补派，反复遗漏警告。评审监督、提醒，不削减总控权限。

## 已接线

- 现有每小时 Dispatch Sentinel 执行 `scripts/lib/dispatch-oversight.mjs`，无模型、无采购、无资金调用。
- 千问现有一次原生日课增加【派单监督】输入与职责。不增加日课次数；已消费过的当天预留不会重新调用。
- 总控现有审查读取监督警告，下一轮优先处理已有遗漏。Claude 的免费客户端不能由此自动唤醒，规则派单不冒充 Claude 原生规划或千问本人接单。
- 单一状态入口：`knowledge/results/dispatch/oversight/latest.json`；跨日警告：`warnings.json`；当日监督卡和同 ID 催办卡：`ops/dispatch/oversight/`。
- Actions 成功只证明扫描/落盘完成；`native_qianwen_review_verified=false` 保持到真正日课交付，不能用此规则扫描冒充原生独立审计。

## 判定与补派

扫描最近七个项目日的总控 JSON、真实 daily-board 认领/提交、Claude 每日任务及三项已接团队任务、ANS 与现有每日雇佣回执。JSON 日课即使没有 Markdown 卡也必须被识别。历史 Pulse 快照不能覆盖较新的日课账本。

沿用已签发 Task ID；CONTROL → DAILY 仅采用现有 resolver 写入的 `source_task_id`，不按相似名字猜。每项问题仅创建一张催办卡，不覆盖已有卡或认领。规则催办进入现有总控和千问流程，不直接重启模型、订单、投资或付款。

新监督 SLA：总控每日审查/派单 17:00（现有 cron 16:20 后留余量）；Claude 卡 09:00、认领/交付 22:00；日课提交和独立审核 22:00；ANS 阻塞跟进 03:00；内部雇佣已有交付 12:00。到期前记 `not_due`。这些时间是本次监督约定，不冒称历史任务原来就有这个截止时间。

同一任务/问题每个实际观察日最多一次警告；跨两个观察日未闭环为 `repeated_warning`。记录首次发现时间，不补造前几天的警告。不扣真钱、声誉，不暂停或撤销总控权限。超出窗口但没有复查的旧问题继续保留，不因“没再看见”自动关闭。

认领不等于交付；完整生成不等于独立审核；工程草稿通过不等于提交代码或上线。工件和审核 SHA-256 必须回读一致，实际作者与审核供应方必须不同。Claude 团队登记缺交付链接只记 `delivery_link_missing`，先找已有 PR，不能据此断言它没做。

代码任务闭环可补 `knowledge/results/dispatch/oversight/closeouts/<原TaskID>.json`：`task_id`、40 位 `source_commit`、数字 `run_id`、本仓 `pr_url`，及 `artifact:{path,sha256}`、`tests:{path,sha256,passed:true,count}`。测试 JSON 必须同 run/commit，`passed=count, failed=0`；还须原任务已有哈希绑定的异供应方审核。该证明只关闭代码交付，部署需另验，扫描器不推断 `deployed=true`。

## 本次核查基准 e149150（不是本次新增成果）

| 方向 | 已有证据 | 实际限制 |
|---|---|---|
| 总控派单 | `control/latest.json`：10-21 DeepSeek v4-pro 代执行逻辑 GPT，向 10-22 DeepSeek/豆包各派一单；10-22 daily-board 已认领提交 | 原厂 GPT 付费日课停用不等于总控撤任；当前聊天不是常驻进程 |
| ANS | Pulse 有真实健康反馈；#186 监督接线 61 项通过；#187 Claude 红队及豆包复核 22 项通过 | 10-22 ANS 审核为 `blocked_provider_or_incomplete`；schema 仍为 candidate，未实现任意补丁全自动部署 |
| AI 雇佣 | 10-20 外部订单 0.003 USDC，付款/交付/异供应方复核分别留证；10-22 WEP3 内部积分结算 | 外部单是提示词复述与回归草稿，不是原创设计或上线；当前内部雇佣等 ANS 交付，未新付 USDC |
| 投资 | 已有 Aave 持仓/历史供应及退出凭据，既有流程持续只读核对 | 10-21 funded-invest 本轮 0 笔；10-22 funding 为 `blocked_prior_operation_requires_reconciliation`，没有新增交易 |

本次部署回读以 Actions 主分支运行及监督 JSON 为准；本页不提前声称原生千问已交新监督日课。
