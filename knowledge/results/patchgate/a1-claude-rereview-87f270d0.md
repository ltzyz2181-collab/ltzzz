# Claude 复审：PatchGate A1（PR #227 新 head `87f270d0`）— 结论 APPROVE-WITH-CONDITIONS（H5/H6/M3/M4 已关闭；可“关开关合并”，不可开启）

- 任务：`PLAN-PATCHGATE-ESCROW-20261023`，阶段 A1（沿同一原单；沿用 #228 审计意见）。
- 审计席：Claude Sonnet 5.5（Claude Code 云端会话，经仓库 PR 交付；无原生 API、无 Key、无钱包、无签名）；author_provider=openai（沿用声明，未独立验证）。
- 读取的完整提交：`87f270d08195c3bd2be5892ab6800921c5140a03`（与上一审计 head `bf18c9fa` 比较，变更 7 个文件）。
- 原字节 SHA256：


## 证据等级
- **单元测试**：我本地复跑 `node --test scripts/tests/patchgate*.test.mjs`：**69/69 通过**。
- **夹具/假 GitHub（经真实 githubApi 校验器）**：`a1-claude-probe-rereview.mjs`、以及对 #228 的原探针复跑（下）。
- **真实 GitHub runner**：**尚未发生**。变量 `PATCHGATE_A1_ENABLED=false` 是 GPT 回读的结果；我这边的代理拦截 Actions 变量路径（HTTP 403），**无法独立核验**。该变量缺失时 `vars.X == 'true'` 为假，故默认是关闭（失败安全）。

## 上次问题的关闭情况（我自己复现）
- **H5 关闭**：workflow 的 `if:` 对 `pull_request_target` 要求 `author_association ∈ OWNER/MEMBER/COLLABORATOR`；脚本里 `candidateIdentity` 再校验一次（我用无该字段的 PR 调用，得到 `trusted_pr_author_required`）。
- **H6 关闭**：原探针重跑，`PUT /pulls/1/merge`、`POST /issues`、`PUT /contents/config/patch-policy.json` 全部 `observation_api_request_not_allowed`。`validateObservationRequest` 是白名单：只允许读 PR/评论/观察分支 ref、读观察文件、`POST /git/refs`（body 仅 ref+sha，ref 必须是 `refs/heads/patchgate-a1-observations/<64hex>`）、写观察/失败文件（路径、分支、提交信息、base64 内容、记录字段全部校验，文件哈希须等于分支哈希）。通知读回也改为走这个包装器，令牌不会发往别处。
- **M3 关闭**：`observe` 作业要求 `vars.PATCHGATE_A1_ENABLED == 'true'`；`acceptance` 作业仅在其**不等于** `true` 时可手动运行；脚本里 `observerMode` 再校验，且 `patchgate-observe.mjs` 拒绝 acceptance 模式。
- **M4 关闭**：我让 `collect` 抛错，经真实校验器：返回 `observation_failed`（阶段 collect，错误码被泛化为 `observation_collect_failed`，未泄漏细节），**失败记录已写入** `…/a1/<key>.failure.json`；重试仍是 `existing_claim_reconcile_no_repeat`，没有第二次写入。头在读取后移动（`expectedHead` 不符）→ `observation_target_moved_requalify`。

## 对千问 A1 回执的裁定（我读了三份原生回执，原结论均保留）
- `A1-BOUNDARY`（revise）：
  - **P0（runnerSha 可被伪造）→ 我不采纳。** `runnerSha` 来自 `GITHUB_SHA`，`observerContext` 要求它等于本次检出的 `git rev-parse HEAD`（即真实存在的提交）；`POST /git/refs` 对不存在的 SHA 返回 422。千问没有看到这个交叉校验。
  - **P1（base.ref 可能是 `refs/heads/main`）→ 我不采纳。** GitHub REST 的 `pull.base.ref` 是分支短名 `main`；且更严的做法是现在的精确等于比较。
  - 其余发现我只见到截断的前两条，未能核对，仍待总控逐条裁定。
- `A1-FLOW`（approve）与 `A1-REPAIRCHECK`（approve）：多数描述与我读到的代码一致；注意它们审的是旧 head（63 项时期），不覆盖本次的白名单、开关和失败记录——**不能替代对新 head 的千问复审**。

## 新增检查：`patchgate-a1-acceptance.mjs`（手动验收脚本，新增代码）
读完全文：只在 main、`workflow_dispatch`、开关关闭时可运行；要求两个**仅含 `docs/patchgate-a1-acceptance/*.md`** 的同仓测试 PR 且 head 不同；三个场景（首轮创建、重复触发无新增 PUT 且 ref/blob 不变、预留后失败有失败记录）；全部走带白名单的 `githubApi`；不改开关；失败写“先对账再重试”。我认可。局限：**不覆盖 fork PR**（脚本自己也说明）。

## 剩余问题（均不阻塞“关开关合并”）
- **L4（低，A2 前）**：通知评论作者仍无受信 actor_id 白名单（公开仓库任何人可写出标记行）。
- **L5（低）**：fork PR 的 head 对象能否被 `git fetch origin <sha>` 取到仍未验证；因 H5 只观察受信作者，影响面有限。
- **L7（低）**：多处提示信息/回执里的 `patchgate-a1-{key}` 与实际分支 `patchgate-a1-observations/<key>` 不一致（千问回执亦有此笔误）。不影响行为，建议文档统一。
- 观察分支仍会逐头产生；建议验收后加定期清理（只清自己创建的观察分支）。

## 对流程的建议（沿用 owner 要求“不跳期”）
1. **可以合并 #227，但保持 `PATCHGATE_A1_ENABLED=false`。** 合并本身不激活观察（已验证 `if:` 条件）。
2. 合并后用 `acceptance` 模式做三项真实 runner 验收：准备**两个仅含 docs 测试文件**的同仓 PR（head 不同、作者为 owner/协作者），手动 `workflow_dispatch` 一次；回执须含 run id、两个 artifact 路径、blob SHA、PUT 计数。结果我会读回核对。
3. 验收通过且千问对**新 head**给出复审后，由总控把变量设为 `true`；观察一批真实 PR；任何异常把变量改回 `false` 即停。
4. A2（自动合并/签名准入）与 B（托管放款）继续关闭，不得借 A1 验收结果提前启用。

## 未验证范围
真实 runner 行为；仓库变量实际值；fork 对象可达性；千问 BOUNDARY 回执后半截内容；author_provider；A2/B。
