# 仓库清理与派单 ID 修复 · VS Code 接力工单

类型：事实（检查记录；清理建议尚未批准执行）

## 目标

仅处理 `ltzyz2181-collab/ltzzz`。先核对当前 main，保留本机未提交改动，在隔离工作区工作。修复总控 `CONTROL-*` 与任务板 `DAILY-*` 的标识错位；提供清理候选清单，等待 owner 确认后才实施文件删除。

## 输入文件

- [当前状态入口](../CURRENT-STATE.md)：只链接各领域权威回执，不复制成另一份可漂移状态。
- [原轮资金收尾](../../knowledge/results/funded-invest/OWNER-FUNDED-20261017-01-controller-closeout.json)、[PR #134](https://github.com/ltzyz2181-collab/ltzzz/pull/134)、[#126 接单评论](https://github.com/ltzyz2181-collab/ltzzz/issues/126#issuecomment-6246167181)。#126 已有千问认证声明；当前执行器不能据此声称自己又接单或调用了千问原厂模型。
- `scripts/lib/daily-assignment.mjs`、`scripts/lib/daily-task-board.mjs`、`scripts/tests/daily-task-board.test.mjs`。
- [原始 ID 错位诊断](../../knowledge/results/daily-board/diagnostics/2026-10-18-control-vs-board.json)。旧诊断及旧失败账本保留，不改成已恢复。
- [媒体逐文件清单、大小、哈希和字面路径引用](../../knowledge/results/repository-maintenance/cleanup-review-20261018.json)。检查基线 `1183bf0849d641ea1a131edcf39c850971c35dc1`；后续执行必须重新检查引用。

## 输出路径

- 派单补丁：`scripts/lib/daily-assignment.mjs`。
- 防误领测试：`scripts/tests/daily-assignment-control-id.test.mjs` 和 `scripts/tests/daily-task-board.test.mjs`。
- 清理审查：`knowledge/results/repository-maintenance/cleanup-review-20261018.json`，本工单。
- 完成报告写 PR 正文：提交 SHA、实际测试结果、未完成项；不要以 PR 创建冒充部署或日课成功。

## 验收标准

1. 仅当原 `CONTROL-*` 不在板上、且存在唯一的同执行日期、同 AI、`execution_chain=daily`、`status=assigned`、无认领者的 `DAILY-*`，才关联到它。保留 `source_task_id` 和原指令。显式 `board_task_id`、真实存在的 CONTROL 和自定义任务 ID 不被重定向。
2. 不映射其他日期、其他 AI、ANS 链、已认领/已完成任务或重复 ID。不借这次修复重新购买旧失败账本中的日课。已有认证认领、不可变交付哈希、远端读回及独立审核的要求继续适用。
3. 本地执行：

   ```sh
   node --test scripts/tests/daily-assignment*.test.mjs scripts/tests/daily-task-board.test.mjs scripts/tests/daily-board-lineage.test.mjs
   git diff --check
   ```

   本轮 Node v24.19.0：53/53 通过。新增回归在补丁前准确复现两项 CONTROL/DAILY 失败；修复后通过。均为本地规则/模拟状态测试，原厂模型调用 0、资金执行 0，不代表线上日课已验收。
4. 清理前必须获得 owner 对具体清单的确认，核验媒体外部备份或上架证据，并修改依赖页面；没有证据就保留。普通删除不清除 git 历史，也不会立即减小历史克隆体积。

## 待 owner 确认的删除候选

| 文件 | 大小（MiB） | 观察与前置条件 |
| --- | ---: | --- |
| `ltzzz-logo-primary.png` | 3.18 | 未检出仓库字面引用；先确认正式 logo 与外部备份 |
| `finance/73617700929F5B2561DB157B2BBA1831.png` | 1.27 | 已实际查看，是 LTZZZ AGI 标志图，未见账户或证件截图；仍需备份，不代表已审查隐藏元数据 |
| `assets/brand-option-a.png` | 0.88 | `assets/brand-options.md` 引用；先备份并调整候选说明 |
| `assets/brand-option-b.png` | 1.14 | 同上 |
| `assets/brand-option-c.png` | 0.71 | 同上 |

合计 7,519,190 字节，约 7.17 MiB。本轮实际删除 **0**。建议保留 `finance/ltzzz-logo.png` 作为正式版候选，`ltzzz-logo-base.png` 暂留；这份建议不等于 owner 已选定品牌。

## 保留及后续事项

- `videos/instagram/latest.mp4` 与 `2026-10-17/video.mp4` SHA256 相同，但 workflow/打包脚本依赖 latest 路径，保留。其余 MP4 也保留；本轮没有独立复核每条 YouTube/Instagram 外部上架/可恢复备份，不能仅凭“重复”删除。
- 10-05 视频有上传失败的历史回执且仍被工作流引用，保留，不改写历史。
- `sim-trade.html` 被 `agi.html`、文章引用；`donate-sim.html` 被 `agi-lab.html`、`ai-chat.html`、`charity.html` 引用；`moni.html` 被 `agi-real-lab.html`、`agi.html` 引用。先改入口并验证链接，再另案删除。
- `knowledge/results/`、`results/` 原回执不删除、不移动。后续可增建按日期的归档索引，并保持原始证据链接有效；文件日期不明时不以 checkout mtime 判断“30天前”。
- 根目录 HTML/Worker 迁移必须独立 PR，验证 GitHub Pages、wrangler 和相对路径；本轮不混入目录重构。

## 禁止事项

- 不改 `ltzzz-memory/**`、YAML/YML、candidates、wallet、`agent-wallet/**`、`wep3-worker.js` 或根目录 TikTok 域名验证文本。
- 不 reset/clean/强推，不覆盖本机改动，不读取或输出 `.env`、Key、Token、认证头或完整密钥配置。
- 不重投原轮 20 USDC、不补款、不另买外部 AI 单、不重跑烧钱日课、不新增付费 cron。
- 不在当前环境 `gh` 未认证时声称已认证接单；GitHub 连接器可用性与本机 gh 登录是两回事。
- 不把“本地测试通过／PR”写成“线上部署完成”；不把内部积分写成真钱。

## 粘贴到 VS Code Chat 的短指令

> 仅处理 ltzyz2181-collab/ltzzz。先读 main 的 ops/dispatch/REPO-MAINTENANCE-REVIEW-20261018.md 和 ops/CURRENT-STATE.md，检查最新 PR，避免重复补丁。保留未提交改动，使用隔离工作区。先复核已有派单 ID 修复并跑该工单的 53 项测试，交实际 PR/测试结果；清理只出清单，未经 owner 对清单确认不得删文件。不要补款、投资、调用付费模型、重跑日课或动任何密钥。不要因读到 #126 的千问认证声明就把自己写成千问已接单。
