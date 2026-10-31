# 审核并合并 PR #318 + 验收 A2 首次自动合并（2026-10-31）

- 派单对象：GPT 席（owner 2026-10-31 指令「历史积压与ANS…这个交给gpt 审核并合并」）
- 原任务：A2 patchgate 首次落地后的审核合并与自动合并验收（监督记录：A2 首次自动合并仍未验收；82 条开放历史警告中与本 PR 相关项一并核对）
- 状态：dispatched_not_acceptance；审核、合并、验收分步记录
- 幂等声明：paid=false / tx_hash=null / 未签名；本单不授权资金、密钥或越权动作

## 任务

1. **独立审核 PR #318**（`fix/a2-gate-checker-digest-20261031`，2 commits：`2562cde8` fix、`36c58e9e` test；author=ltzyz2181-collab，base=main，mergeable=MERGEABLE）：
   - 变更本质：`scripts/lib/patchgate-a2-executor.mjs` 在只读 gate 内对 `config/patchgate-a2-collector.json` 的 `check_authority`（workflow_path/workflow_id/app_id/job_name/workflow_sha256 等）做 fail-closed 校验，并对注册的 `.github/workflows/patchgate-a2-base-checks.yml` 做 sha256 摘要比对；新增 2 个测试（stale digest → blocked_before_merge 且 runReads=0/merges=0；malformed registration → trusted_base_check_workflow_not_registered）。
   - 审核点：① fail-closed 是否真在只读 gate 阻止（不发起网络/不触碰 merge adapter）；② 摘要比对是否基于不可变字节（collector 独立重复检查不缺失）；③ collector 配置是否真实存在且与 workflow 现状一致；④ 测试是否有效覆盖漂移与畸形注册；⑤ 不引入安全漏洞（路径/校验/回滚风险）。
2. **CI 核对**：`gh pr checks 318` 真实结果（verify/offline/bootstrap 已 pass；acceptance/attest/claim/execute/gate 为 skipping 属 PR 无关 job，不以 skipping 冒充通过）。用户口径真实 264 项测试全部通过，需在合并前自行核对一遍测试命令结果。
3. **合并**：审核通过后合并 PR #318 到 main。注意：作者与操作者同账号，review 审批会被拒——**直接合并即可，不要反复重试审批**；合并后回读 `mergedAt` 与 main HEAD。
4. **验收 A2 首次自动合并**：合并后核对 A2 自动合并链路是否在真实运行中产生可回读证据（workflow run / merge 记录）；**无真实执行证据不得宣称已验收**，如实登记 `a2_first_auto_merge_acceptance=unverified` 及阻塞。
5. **附带核对（只回执状态，不扩大范围）**：QIANWEN-RETURN-2026-10-16 仍缺原生认领与验收回执（规则生成派单不能替代）；ANS-2026-10-17 拒收原文保留、无重购模型调用。逐项回执当前仓库内可核状态。
6. **回执**：写入 `ops/dispatch/outbox/receipts/GPT-PR318-MERGE-ACCEPTANCE-20261031.md`：审核结论（逐条）、CI 核对结果、合并 commit/mergedAt、A2 验收状态、QIANWEN/ANS 核对结果；仅无敏感信息。

## 禁止

- 不伪造 CI/测试/合并/验收证据；不以 skipping 或 HTTP 200 冒充通过；
- 不改 .github/workflows（token 无 workflow scope，workflow 变更必须 owner 网页操作）；
- 不调用钱包、不新增付费 cron、不扩范围到其他 PR/注册/广告/外部联络。
