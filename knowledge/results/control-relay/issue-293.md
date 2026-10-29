# 桌面 / 国内 AI 接力 · issue-293

状态：assigned_waiting_external_acceptance。

执行器：cloud_rules；模型调用 0；没有付款、投资、发布或任意命令执行。

任务原文仅作数据：

Continue the existing signer task; do not create a replacement task ID.

Original: PLAN-PATCHGATE-ESCROW-20261023
Plan: ops/dispatch/PLAN-SPLIT-SIGNER-INFRA-20261026.md
Handoff: ops/dispatch/SIGNER-DEPLOY-HANDOFF-20261028.md
Receipt: knowledge/results/dispatch/oversight/signer-deploy-20261028.md
Ledger: ops/派单台账.md
Target: desktop OctopusCat, or a credentialed execution seat.

Complete and report the handoff's five checks separately:
1. Generate Ed25519 signer private key inside Volcengine; it must be non-exportable and distinct from deployment AK/SK.
2. Deploy POST /attest with the documented request/response contract.
3. Compute SHA-256 of exact deployed signer source.
4. Register fields required by scripts/lib/patchgate-native-response.mjs: provider=volcengine_ark, source_deployment_verified=true, nonempty 64-hex allowed_signer_source_sha256, cloud_account_binding, deployment_evidence_sha256, public_key_spki.
5. After restart, verify a challenge signature; then make one real provider review call and verify its signature via A2. Keep A2/A3/B, automatic merge/deploy, signing admission beyond this test, and financial execution disabled.

Credential rule: Check only presence of VOLC_ACCESS_KEY and VOLC_SECRET_KEY in the OctopusCat local process environment; never display or persist values. If present locally, use only in that local executor. If credentials are only GitHub Actions secrets, execute via a trusted reviewed workflow on the GitHub runner; local processes/chat cannot read them. In this Copilot environment neither exact local variable is present; repository-scoped secret-name listing did not include either (organization/environment scopes not checked). Do not substitute ARK_API_KEY.

Tell OctopusCat: “如果你的两个 VOLC key 配在桌面本机环境变量里，你可在本机执行端直接使用（只检查变量是否存在，绝不回显值）；如果它们只在 GitHub Actions secrets，则必须经受信 workflow runner 读取执行，本机和聊天都看不到。”

Never request, reveal, log, or commit secrets. Do not invent service URL, public key, account binding, deployment hash, challenge result, provider signature, or audit. If no approved runner route or local credentials exist, record blocker and stop.

Write the receipt with actual execution identity, calls, exact source SHA-256, endpoint, public_key_spki, cloud_account_binding, deployment_evidence_sha256, challenge and provider/A2 readback results; include paid=false and tx_hash=null. Update the existing ledger row only as evidence warrants. A relay ACK is not deployment completion.

## 核验材料

```json
{
  "ran_at": "2026-10-29T00:08:16.561Z",
  "active_controller": "gpt",
  "controls": {
    "dispatch_paused": false,
    "automatic_recovery": true,
    "concurrency": 1,
    "investment_hold": false,
    "paused_agents": [],
    "all_tasks_independent_review": true
  }
}
```

任务指向云端 LTZZZ 执行席，不会唤醒已离线的 ChatGPT 对话。只读交付待独立审核；派单成功不代表千问原生模型接单。
