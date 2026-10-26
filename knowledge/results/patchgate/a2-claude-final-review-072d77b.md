```json
{"schema":"ltzzz.external-stage-audit.v1","task_id":"PLAN-PATCHGATE-ESCROW-20261023","phase":"A2","seat":"claude","verdict":"approve","scope":"merge_candidate_code_with_A2_disabled_only_not_activation","reviewed_source_commit":"072d77b0707b065c030e6fe7860642597f9d3ee0","runtime_bundle_sha256":"ffe95b96a57e51a2f80b62fd52513b6be461da81744ffb6513cf2d855482674a"}
```

# Claude 最终复审：PatchGate A2 #240 head 072d77b0（有限放行）

**放行范围仅限：把候选代码合并进 main，且 `enabled:false` 保持不变。不是启用 A2，不是 A3/B/资金放行。** JSON 中的 approve 即此意；作者与我（审计方）分离——这次的改动是 GPT 按我的 #248 意见写的，我没有改代码。该文件是共用 GitHub 账号提交的咨询性文档，不是密码学签名。

## 核验
- head `072d77b0707b065c030e6fe7860642597f9d3ee0`；`node --test scripts/tests/patchgate*.test.mjs` 136/136 通过；bundle 摘要由该 head 的 `bundleDigest` 计算（见上方 JSON）。
- 已读原始字节并计算 SHA256：
- `scripts/lib/patchgate-a2.mjs` 80ecd4691cc0edb4a93587538828ebc9fec8b21f03e806ec8d157cee0bb189ed
- `scripts/lib/patchgate-a2-readback.mjs` 1fdf149fa4135e564c2bb0ec353bfd8310eec57d7631526ff72d7e490d3c205c
- `scripts/lib/patchgate-a2-collector.mjs` eccc715b22ff1e2a6d70711c15ea4e41e570685e9798408b513ddcf634f004ef
- `scripts/patchgate-a2-collect.mjs` f2cd844877fe4b05ff25abf021bd3341efaaf15c704adecf52f80116a60b91fc
- `scripts/patchgate-a2-preflight.mjs` 46b964b033d13c826c82bf649bd76e4238482d5c7c254d9284d4f2a3dada09e0
- `.github/workflows/patchgate-a2-base-checks.yml` a2c3de6a67caf646e75923ba920683aeb37cf5d92c781932937b0d33e07b6bea
- `config/patchgate-a2.json` d6ff8bc0459c8f99a2c20080e6bb8524a89f563118c0ad59b48e6916bc273c8c
- `docs/PATCHGATE-A2-PR248-REPAIR-20261025.md` 0747e0df6d39b2e5001b1fcf670e77046aae000fc0f9efd71e65cc952635e216

## 前次意见处置
- **C1**：已咨询化（`required_before_rollout:false`，`admission_authority:none_shared_github_login`），`rolloutApproved` 不再读外部审计——通过。
- **C2**：base-check 改 `pull_request_target`，仅检出 `github.sha`（主线），`if` 限定 main、同仓库、OWNER/MEMBER/COLLABORATOR，权限只读——通过。该 workflow 在合入 main 前不会生效，且开关默认关闭。
- **C3**：`patchgate-a2-verify.yml` 已纳入 bundle 清单——通过。
- **B2（L0 补偿）**：合并前对 base/head 两棵完整树做差，合并后要求 2 个 parent、第二 parent=批准 head、第一 parent 为批准 base 的后代、并发 base 变更仅限 L0 Markdown、实际树差（路径+blob+mode）与批准清单逐项一致——设计正确。`patchgate-a2-stop` 全局闩在合并前原子占位，仅在读回通过且回执落盘后释放，任何异常都保持停止——fail-safe。仓库当前树 4935 项（上限 20000，未截断），余量足够，超限会 fail-closed 而非放行。
- 豆包 revise（F1–F5）裁定：F1/F2/F3 属于**启用前的活体验收**（当前 head 的生产 checker 签名、真实跨 runner 验证、真实签名执行器登记），并非代码缺陷，且其审阅的是旧 head 8361dfef；全部同意保留为启用前置条件。F4 属实：这不是原子 expected-base，仅是 L0 文档的补偿控制，限定 L0，不得外推到 L1+/A3。F5 同意。

## 残余风险（不阻断合入）
1. 异常后闩保持占位，需要有人/流程清除并写调和记录；请 GPT 写出自动化的调和步骤（不应由 owner 手工做）。
2. 并发 L0 文档变更在合并后才发现冲突时，合并已发生；仅 docs 影响，属可接受。
3. 首个 PR 合入 main 之前，base-check 与 collector 工作流不生效；合入后须读回真实 workflow_id 与字节哈希并走审计后再登记。

## 未验证范围（诚实声明）
- 未读新增测试的全部逻辑、PR247/PR248 evidence JSON、`patchgate-a2-collector.yml` 完整内容、collector 改动的 4 行之外的部分；未亲自重做对抗性探针（依赖豆包 18 项与千问审查，且这两者与作者同用一个 GitHub 账号，不替代我的独立性）。
- 未验证任何真实 Actions 运行、生产签名或真实合并。

## 启用 A2 前仍须满足
真实千问/豆包签名执行器登记并重启后验证（B4）；主线注册 checker workflow_id 与哈希（B3）；一次真实无害文档 PR（#246）的自动合并及读回验收（B6）；之后对启用提交再做一次审计。A3/B/资金不在此范围。
