# A2 豆包探针执行入口

类型：工程实现与未验证边界。原任务 `PLAN-PATCHGATE-ESCROW-20261023`，不另开业务订单。代码作者为本次 GPT/Codex（OpenAI）会话，不冒充豆包。

本入口必须先合并并获审成为可信 main 代码，再由 root 在 main 新增固定卡片 `ops/dispatch/probes/patchgate-a2-doubao.json`。本 PR 故意不附有效触发卡；仅合并基础设施不会调用付费模型。没有定时任务，也不会启用 A2/A3/B。

卡片示例（`candidate_head` 必须换为 B1 修订后的真实 40 位 head；未填写时拒绝）：

```json
{
  "schema": "ltzzz.patchgate.doubao-probe.v1",
  "task_id": "PLAN-PATCHGATE-ESCROW-20261023",
  "candidate_pr": 240,
  "candidate_head": null,
  "run_live_cas": true,
  "model_review": true,
  "scope": "candidate_adversarial_probe_not_production_admission"
}
```

执行分三层，身份分别记录：

1. **无凭证 candidate job**：精确 checkout 候选 head，下载可信 main 产出的固定 harness。执行伪造 head、同键并发、回执注入、422 但没有 ref 四项对抗性测试；测试密钥只在内存中临时生成，不能登记成生产签名。候选 job 没有模型密钥，也没有仓库写 token。报告标记为 fixture 探针，不能替代受信生产检查器 B3。
2. **两个真实 main runner 的 CAS**：只运行可信 main 脚本，各自对同一 `patchgate-a2-probe-races/<hash>` 创建 ref。结果一边 201、一边 422 且能回读原 ref，才计本次跨 runner 抢占通过；旧 ref 导致两个 422 不计新的并发验收。仅创建保留证据分支，不合并、覆盖或删除任何候选。
3. **豆包原生模型评估**：main 固定代码验证收集的结构化结果后，先创建 `patchgate-a2-doubao-probes/<hash>` 永久占位，再通过已有认证豆包代理最多调用一次。HTTP 422/未知先对账，不重放付费请求。真实 shell 执行者是 GitHub Actions；豆包只读取实际探针证据并产出模型意见。回执明确分开 logical seat、shell provider、实际模型提供商及 `model_source`，不能声称模型自己跑了 shell。

模型输出与探针状态分开：工作流 job 成功只说明收集/上传完成，必须检查 `deterministic_probe_passed` 和各项计数。即使探针全过、豆包 approve，也不等于生产签名执行器、基线原子门禁、可信检查采集器或首次自动合并已通过。

幂等键只绑定原 Task ID、精确候选 head 和固定字段规范化后的卡片内容。source main 提交、run ID、JSON 字段顺序不进入幂等身份；无关 main 前移后重跑仍复用原占位、零新增模型调用。source main 仍校验并记录为运行证据。修复探针后若需要新的验收，必须使用新的候选 head；不能把无关代码提交当成新调用授权。

回执由 create-only 写入 `knowledge/results/patchgate/a2-doubao/<hash>.json`，位于隔离占位分支；main 不自动追加回执。Actions 同时保留工件，写入失败或进程中断后仍有占位，不能自动重调。模型密钥只由现有 Secret 注入，未索取/生成/公开任何私钥；`paid=false` 表示没有现金结算，API 用量仍按提供商计费，账单金额未核验。

待 root 完成：基础设施跨提供商复核与合并 → B1 修订的新候选 head → 新增固定卡触发 → 回读真实 run / 两个 CAS job / 模型原始回执 → 把证据和新 head 交 Claude 复审。不得把本地测试当成豆包原生调用或线上验收。

回执里的 evidence_sha256 绑定结构化探针证据，output_sha256 绑定实际保留的脱敏模型文本，二者用途不同，不要求相等。超长正文截断会明确标 output_truncated=true，并且不得记原生完整生成成功；缺模型配置时仍可写零调用blocked回执，不代表任何业务准入。
