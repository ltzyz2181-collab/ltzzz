# 每日派单与其他AI自主找任务

Owner最新要求：GPT逻辑总控每天派单；其他AI可自主发现、认领、提交实物。任务日期沿用仓库Asia/Shanghai，不冒充原厂GPT模型每天都生成过意见。

1. 每次开始工作，读取 AI-START-HERE.md、最新Pulse状态和任务池：`https://ltzzz-pulse.ltzyz2181.workers.dev/tasks`。也可读仓库 `knowledge/results/pulse/latest.json` 中的 task_board。
2. 每日保证两条明确基础派单（DeepSeek、豆包）及三条可自主认领的ANS/奖惩/连续性任务。Pulse五分钟循环按日幂等生成；原每日总控工作流无论模型成功/失败都保存派单。模型不可用时来源标 `coordinator_rules_zero_model_baseline`，保留真实模型阻塞，不空转也不伪造模型发言。
3. 选择适合自身能力的 available 任务；assigned 任务仅对应席位认领。认领由一致状态存储原子处理，其他席不能抢已认领单，不自动重新购买未知模型请求。
4. 有现成GitHub Actions执行身份时自行执行：

```sh
# 不调用模型，只列可做任务
gh workflow run pulse-agent-work.yml --repo ltzyz2181-collab/ltzzz -f agent=deepseek -f action=discover
# 不填task_id即选择一个可认领任务；也可明确选择公共任务ID
gh workflow run pulse-agent-work.yml --repo ltzyz2181-collab/ltzzz -f agent=deepseek -f action=claim
# 先提交实物文件，再提交已认领任务证据；执行器重读文件计算SHA256
gh workflow run pulse-agent-work.yml --repo ltzyz2181-collab/ltzzz -f agent=deepseek -f action=submit -f task_id=实际任务ID -f evidence_path=knowledge/results/实际文件.json
```

执行器使用已有秘密完成认证，不把CF/Pulse Token贴给聊天窗口。控制凭证声明“谁代谁认领”，不证明对应原生模型已生成；真实模型身份与用量以交付回执验证。

5. submit只进入submitted_pending_review，不冒充验收、结算、工资。后续独立审核和原有行动奖惩以真实artifact/audit/receipt哈希为依据。基础设施故障不扣分。
6. 没有GitHub写/Actions身份的外部会话可以读取、选题、提交可复用草稿，由已认证执行器代存；不得宣称已经认领或已写仓库。聊天窗口不因出现任务池而变成24小时后台进程。已部署的Pulse和现有GitHub执行器会持续运行。

既有日课调用会优先读当天总控派单；其他席可从可用任务中选题。回执记录assignment来源，但选题不冒充已认领；需要排他工作时使用认证claim入口。沿用原有日课调用次数，不为选题额外调用模型。

没有新增付费模型定时任务。新增自动任务发现/独立监控均是规则和HTTP/RPC代码；需要真正生成内容时仍使用已有授权的模型调用与预算。
