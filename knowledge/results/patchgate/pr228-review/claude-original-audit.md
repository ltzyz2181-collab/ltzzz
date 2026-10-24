# Claude 独立审计：PatchGate A1 只读观察适配器（PR #227）— 结论 REVISE（3 项合并前必改）

- 任务：`PLAN-PATCHGATE-ESCROW-20261023`，阶段 A1（沿同一原单）。
- 审计席：Claude Sonnet 5.5（Claude Code 云端会话，经仓库 PR 交付；无原生 API、无 Key、无钱包、无签名；未用代执行冒充）；author_provider=openai（沿用派单卡，未独立验证）。
- 读取的完整提交：`bf18c9fa2b3a8245db7b3b393cf7fafb8794fd59`（#227 head），其 base `a9902f24aee581b0aec8fd4772e8af4208f53cfe`。
- 原字节 SHA256：
  - `62d88685…15f4b` `.github/workflows/patchgate-a1.yml`
  - `3ca44f2f…e4f2d` `scripts/patchgate-observe.mjs`
  - `273ae415…170ab` `scripts/patchgate.mjs`
  - `07b20f50…b9c6c` `scripts/tests/patchgate-a1.test.mjs`
  - `9201a5ba…f5f5` `docs/PATCHGATE-A1-OBSERVATION.md`
  （完整 64 位值见本稿末尾。）

## 证据等级（按派单卡要求区分）
- **单元测试**：我在该 head 本地复跑 `node --test scripts/tests/patchgate*.test.mjs`，**63/63 通过**。
- **API 夹具**：我用假 fetch/假 API 复现问题（`a1-claude-probe.mjs`），不联网。
- **真实 GitHub runner 运行/幂等**：**未发生**，文档已如实写“首轮创建、重复轮次无重复写入、未知预留对账”三项未验收。本审计同意这个口径：在这三项完成前不得写“分布式运行已验收”。

## 已验证的优点
- 可信边界设计正确：观察器只在 main 的 `pull_request_target`/`workflow_dispatch` 运行，检出 `github.sha`，候选只用 `git fetch` + `git diff` 读取对象，不检出、不 import、不执行；策略/公钥取自 main；`observerContext` 校验仓库、`refs/heads/main`、事件类型和检出 SHA。
- 通知读回只向 `api.github.com` 发请求：`notificationReference` 用锚定正则把引用限制为本仓 `issues|pull` 评论，`redirect:'error'`，token 不会发往攻击者 URL（我读了代码并核对）。
- 预留：`POST /git/refs` 创建唯一 ref；422 必须回读同名 ref 才算重复，否则报错；网络未知不重发——符合“不重复写、不删预留”。
- 观察记录写入前对开关（merge/deploy/rollback/funds/signing/paid/tx_hash/model_calls）与主体一致性再校验；A1 记录里 `signing_admission:false`，不把观察冒充授权。
- `diffBase`（merge-base）只改变 diff 起点，策略仍取自 main，未让候选决定自己的规则。

## 问题
**H5（高，合并前必改）公开仓库 + `pull_request_target` + `contents: write`：任何外人开 PR 就触发有写权限的作业。** 我核对了仓库：`visibility: public, allow_forking: true`。观察器对每个指向 main 的 PR（含 fork）都会 `POST /git/refs` 创建 `patchgate-a1-observations/<key>` 分支并写文件。外人可批量开 PR/推新提交，制造任意多个分支、占用 Actions 时间、污染仓库。注意 `key = sha256(task_id:head_sha)` 中的 `task_id` 取自 PR 正文，攻击者可自选。建议：①仅观察 `author_association` 为 OWNER/MEMBER/COLLABORATOR 的 PR（或仅响应 `workflow_dispatch`/标签）；②对观察分支数量/速率设上限；③在 workflow `if:` 里加这个判断而不是只放在脚本里。
**H6（高）通用 API 包装器允许任意写，与“只能写观察分支”的承诺不符。** 复现（`a1-claude-probe.mjs`）：`githubApi` 只校验路径前缀 `/repos/<本仓>/` 且无 `..`，下列调用**均被放行**：`PUT /pulls/1/merge`（合并 PR）、`POST /issues`、`PUT /contents/config/patch-policy.json`。令牌是 `contents: write`，因此观察器内任何一个 bug 或日后改动都等于“有合并/改配置权限”。文档称“代码对写入路径、分支前缀再次校验”，但校验只发生在 `publishObservation`，不在传输层。建议：把包装器改成**白名单**（方法+精确端点模式）：`GET /pulls/{n}`、`GET /issues/comments/{id}`、`GET /git/ref/heads/patchgate-a1-observations/{64hex}`、`POST /git/refs`（且 body.ref 必须匹配该前缀）、`PUT /contents/knowledge/results/patchgate/a1/{64hex}.json`（且 body.branch 匹配前缀）。其余一律拒绝，并加测试。
**M3（中，合并即激活）没有开关。** `pull_request_target` 触发器在合并到 main 的瞬间对所有后续 PR 生效，没有“先合并、后启用”的空间；与文档“上线前需双审、再激活”的流程不一致。建议 `observe` 作业加 `if: vars.PATCHGATE_A1_ENABLED == 'true'`，合并后由总控在三项真实 runner 验收通过后再开；出问题时关变量即停，不需要回滚代码。
**M4（中）预留之后失败 = 永久孤儿预留，且无失败记录。** 复现：`collect` 抛错（例如单文件 diff 超过 `execFileSync` 的 2MB `maxBuffer`、`file_limit_exceeded`、网络抖动），`observe` 在已创建 ref 之后抛出，**没有向已预留的分支写任何记录**；重试返回 `existing_claim_reconcile_no_repeat`，写入数 0。结果：同一 head 永远无法观察，也看不到失败原因。建议在预留成功后用 try/catch，向同一预留分支写 `observation_failed`（含错误码、不含敏感信息）；超大 diff 在到达 git 输出前就按 `max_diff_bytes` 截断并记 `diff_limit_exceeded`。
**L4（低）通知评论作者未做白名单。** `notificationMatches` 核对评论的 TASK_ID/HEAD_SHA/SUBJECT_SHA256 标记行和 `OWNER=@ltzyz2181-collab`，并要求签名证明中的 actor 与读回一致，但不检查该 actor 是否属于受信通知者；公开仓库里任何人都能在 PR 上写出这些标记行。A2 前请在 base 信任根里登记允许的 `actor_id`。
**L5（低）fork PR 的 head 对象能否被 `git fetch origin <sha>` 取到未验证。** 夹具把 git 调用桩掉了，未覆盖。上线验收时请用一个 fork（或“同仓分支”与“fork”各一）实测，并写明结果。
**L6（低）观察键被 PR 正文中的 task_id 影响**：外人复制合法 PR 的 task_id 并把同一提交推到自己的 fork，可以抢占该 (task_id, head) 的预留，使合法 PR 的观察被判为“已存在预留”。H5 的限制（只观察受信作者）会同时消除这点。

## 对合并/启用的建议
1. 合并前必须处理 H5、H6，并强烈建议同时加 M3 开关；M4 也应在三项真实 runner 验收之前修好（否则验收时遇到失败会留下无法对账的孤儿预留）。
2. 修复后我复审新 head；启用顺序：合并 → 关着开关做一次真实验收（同仓 docs 测试 PR：首轮创建、重复触发无重复写入、人为制造失败后能在预留分支看到失败记录）→ 开启开关 → 观察期（至少一批真实 PR）→ 再谈 A2。
3. 在此之前：A1 不得声明上线；A2（自动合并/签名准入）与 B（托管放款）保持关闭。

## 未验证范围
未在真实 runner 运行；未接触 Secret；author_provider 沿用声明；千问本期回执内容未读；`fetchNotificationReadback` 之外的网络行为均基于代码阅读与夹具；A2/B 不属本期。

## 完整原字节哈希
- `.github/workflows/patchgate-a1.yml` 62d8868577820ccd5632d5a58a2b1ff0ddfbe9882be609fbea5134fc74915f4b
- `scripts/patchgate-observe.mjs` 3ca44f2f59daf80efef6acc19cac1222e5d27232c73ecf61fedf11ef079e4f2d
- `scripts/patchgate.mjs` 273ae41527fd793a7a6fe5ef4a1153f22ba3f293c78cd9313ec1acf4b1b170ab
- `scripts/tests/patchgate-a1.test.mjs` 07b20f5047e6dac225b145edb40812bd9d76de3e3573976a4a6dcb71150b9c6c
- `docs/PATCHGATE-A1-OBSERVATION.md` 9201a5ba201d380ab970b899e49ea796063de32f867c14ffebccc5b9444e5f25
