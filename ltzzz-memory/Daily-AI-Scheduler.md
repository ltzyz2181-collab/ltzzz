# Daily AI Scheduler

## 架构
服务器/Cloudflare Worker
+
定时任务/Cloudflare Cron
+
API/各 AI API
+
Memory Engine
+
Task Center
+
Result Center

## 每日标准循环
00. 安全检查：禁止读取核心邮箱、禁止输出 Secret。
01. Memory manifest。
02. 读取长期记忆与昨日结果。
03. GPT 总控规划。
04. 分派 AI 任务。
05. 各 AI 执行。
06. 记录真实结果。
07. 交叉验证。
08. 生成候选记忆。
09. 写入 daily memory。
10. 生成下一步任务。
11. 邮件/Telegram 汇报。

## 验收
只有以下条件全部满足才标记“已上线”：
- cron 真实触发
- API 真实调用
- 结果真实落盘
- 有 execution/result ID
- 失败能记录
- 无 Key 泄露

## 当前限制
现有 LTZZZ Daily Automation Worker 已有 cron 与六 AI任务骨架，但其中 scanRepo 与部分 AI 调用仍是 dry-run/占位，Memory Engine 尚未成为所有 AI 的统一真实读取入口。
