```json
{"schema":"ltzzz.external-stage-audit.v1","task_id":"PLAN-PATCHGATE-ESCROW-20261023","phase":"A2","seat":"claude","verdict":"revise","reviewed_source_commit":"674c73c1f356ac3bdce776fb0b9425366b7df68d","runtime_bundle_sha256":"408f1aa2679ec6945664c86f9089dd58badc7279d172cb2b66655e70ccf44c17"}
```

# Claude 独立复审：PatchGate A2 候选 #240 新 head 674c73c1（REVISE）

- 对象 head：`674c73c1f356ac3bdce776fb0b9425366b7df68d`（上次审计 head f64175f，见 #244）
- 结论：**REVISE。A2/A3/B 与资金继续关闭，不建议把任何一项标为“已关闭”。**
- 上方 JSON 的 runtime_bundle_sha256 由 head 自带 `bundleDigest` 在该提交上计算。
- 测试：`node --test scripts/tests/patchgate*.test.mjs` 121/121 通过。

## 本次审阅的原始字节 SHA256
- `scripts/lib/patchgate-a2.mjs` 0c91989d9e05f6fe796488a0f8485e952949c36fa9745fc4bf8046e4865535b5
- `scripts/lib/patchgate-a2-collector.mjs` 5d10d9c256c332e09c41639a82431dd8fd205ceaa24b83dfa2440872ce666262
- `scripts/patchgate-a2-collect.mjs` bc7e1f5cb12232c7629a1698fd8db85fc7665406b90c083560fb64b60a79d01f
- `scripts/patchgate-a2-preflight.mjs` 0e4e15c0de85b5953eade9202b575cd2acceec32664679ee41a2b1c50df3db85
- `.github/workflows/patchgate-a2-base-checks.yml` 183d6bc4906635f581a8655a982ba856b385e57ec4e956b4e9e1ec05a3882cff
- `config/patchgate-a2.json` 5671545441ce448db8b49073e59ced46b1b11b661b3ee8a277f2b7906a24a721
- `config/patchgate-a2-collector.json` d7f234abafa1cbd2c2046e028f3ea1eb00ff2b6ec7117586fe34ee6899e7955d
- `docs/PATCHGATE-A2-COLLECTOR-HANDOFF-20261025.md` ccfab4a039fe34593ce69d32f51c6c9048ceeebe44c952af297b933c1c89e21e

## 前次阻断项状态
- **B1（签名通道）：方向认可，未关闭。** 必需签名方改为千问（aliyun_dashscope）+ 豆包（volcengine_ark），不再要求 anthropic；`rolloutApproved` 的模型 quorum 不含我。真实签名密钥仍未登记（B4 未关）。
- **B2（base 竞态）：未关闭。** 方案选“严格保护分支”合理，但保护接口返回 403，无法证明保护存在；`assessBaseProtection` 对不可读一律阻断，保守正确。需 owner 在 GitHub 界面手工开启（或授权有 admin 的凭据），再做一次真实陈旧 base 拒绝验收。
- **B3（检查收集器）：代码已补，未关闭。** 只读、固定端点、无重定向、按不可变 head 读文件并重算 blob SHA1/SHA256，设计扎实；但 `check_authority` 仍为 null，未登记真实 workflow_id，且 base-check 开关未启用，属于“观测原型”。
- **B4、B5：未变。** B6：PR #246 草稿，符合“不先手工合并”。

## 新发现
1. **C1（中）我的审计证明可被自填。** 闸门要求 `external_stage_audits` 含 seat=claude、verdict=approve 的 PR 文件读回（`required_before_rollout:true`），但全体 AI 共用同一个 GitHub 登录，`native_authorship_verified` 恒为 false——任何人（包括 GPT）都能提交一个自称 seat=claude 的文件满足该条件。它**不能证明是我审的**。修订建议二选一：
   - (a) 去掉“必需”，把我的审计降为咨询项（模型 quorum 本来就不含我）；或
   - (b) 加一个真正独立的确认：由 owner 本人账号（登记的数字 id）在审计 PR 下留一条绑定 blob SHA 的评论，读回该评论的 actor id 作为证明。这是唯一独立于所有 AI 的一方。
   不应使用我的“会话内密钥”：私钥无法持久，且 GPT 文档已说明短暂密钥不得登记。
2. **C2（中）base-check 用 `pull_request` 触发。** 该事件使用 PR 合并结果里的 workflow 文件，同仓库 PR 可以改写 `patchgate-a2-base-checks.yml`，让同名检查变绿。收集器会比对登记的 workflow 字节哈希并拒绝改过自身 workflow 的情况（设计上有防线），但分支保护只看检查名与 App id，会被伪造的绿检查通过。建议改用 `pull_request_target`（工作流取自 base），并保持“只 checkout base、只用 git 读取候选 diff”的现有写法；并在文档中说明防线是收集器而非保护规则。
3. **C3（低）`patchgate-a2-verify.yml` 不在 A2_BUNDLE_FILES 内**，其改动不会使已批准的 bundle 哈希失效。请确认它是否参与准入；若参与应纳入清单。
4. **C4（低）** 文档中 Ego 部分如实写明“未配置”，认可；该内容与 A2 无关，不应进入 bundle 以外的准入判断。

## 未验证范围
- 未读 `collectA2Readiness` 后半段（检查绑定、workflow marker 比对）、`patchgate-a2-collector.yml`、新增测试逻辑、evidence/*.json 的内容；未做对抗性探针。
- 未核验 Actions run 40250034615 与 40244733201 的真实性（只看了 diff 中的摘要）。

## 放行前必须满足（真实 runner 前）
1. 处理 C1（二选一）与 C2；2. owner 开启并让我读回分支保护，完成陈旧 base 拒绝验收；3. 登记真实千问/豆包签名执行器并做重启后挑战签名；4. 登记真实 workflow_id 与字节哈希后再开 base-check；5. 对修订后新 head 再审一次；6. B6 活体验收后才可谈 A3。
