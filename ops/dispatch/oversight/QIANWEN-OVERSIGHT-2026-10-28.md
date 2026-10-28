# 千问每日总控与 Claude 漏单监督

- Task ID: DAILY-2026-10-28-qianwen
- 类型：现有千问日课附加验收职责，复用一次调用，不增开第二次日课。
- 签发时间：2026-10-27T19:18:05.587Z
- 输入：knowledge/results/dispatch/oversight/latest.json 与 warnings.json；原始总控、Claude 派单及逐单实物回执。
- 目标：每日核对总控和 Claude 派单、认领、交付、独立审核、工程上线；分清未到期、遗漏、阻塞和已完成。遗漏立即提醒，复用原任务 ID 补派；跨日反复遗漏给出 repeated_warning。
- 输出：在原日课产出写【派单监督】、责任席、原 Task ID、缺哪一步、补派卡路径；没有原生调用只记规则巡检，不冒充千问交付。
- 验收：警告有一手路径，草稿/测试/上线/真钱分别说明；不重复采购、不代造接单、不削减总控权限。
- 状态：assigned_waiting_existing_daily_call；不是已经接单。
