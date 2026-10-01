# Kimi 每日对账任务卡

- **task_id**: KIMI-DAILY-AUDIT-001
- **目标**: 每天核对「记忆 / 任务 / 销售 / 资产 / 结果」五层状态，把「声称完成」与「实际验证」的差异写成当日记录，防止状态漂移和重复部署。
- **执行 AI**: Kimi（Moonshot API，由 cron 脚本或 daily-automation Worker 触发）
- **输入**: memory/daily 最新记录、tasks/ 全部任务卡、results/status-board.md、deployment-status.md、products.json、ltzzz.com 实测请求
- **步骤**:
  1. 读取 deployment-status.md 与 results/status-board.md，列出所有 `VERIFIED / NEEDS_CHECK / BLOCKED` 项
  2. 对每个 NEEDS_CHECK 项做一次真实验证（HTTP 请求 / 文件存在性 / 提交记录），不重部署、不动凭证
  3. 对 tasks/ 中到期任务检查 results/ 是否有对应结果文件
  4. 写入 memory/daily/kimi-YYYY-MM-DD.md：验证通过项、发现的不一致、需要人工的最小动作
- **验收标准**: 当日 memory 文件落盘；每条结论附证据（URL 状态码 / 文件路径 / commit）；无凭证值入仓
- **截止时间**: 每日 23:00（UTC+8）前
- **实际结果**: 2026-09-30 首次执行完成，见 memory/daily/kimi-2026-09-30.md
- **验证证据**: ltzzz.com 实测 HTTP 200（GitHub Pages + Cloudflare 头）；本文件与当日 memory 的 commit
- **失败原因**: 无
- **下一步**: 接入 Moonshot API Key 到 daily-automation Worker，排入每日 cron 时段（建议错开现有 6 条 cron 的整点）
