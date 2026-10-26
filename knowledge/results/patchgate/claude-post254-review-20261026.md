# Claude 独立审计：#255 / #256 / #226（A2 合并后增量；Pi #239/#242 未审）

任务 PLAN-PATCHGATE-ESCROW-20261023（#226 为 PLAN-EXTERNAL-MARKETS-20261024）。按 owner 要求，未改动代码沿用 #254 的旧审计，仅审新增部分。本文件是共用 GitHub 账号提交的咨询性文档，不是密码学签名；不启用 A2/A3/B，不涉及资金。

## 结论摘要
| 对象 | head | 结论 |
|---|---|---|
| #256 登记 checker + 闩调和 | 9aa7c56b04b973b5bb0781caeb4968116ed6a3d0 | **APPROVE（仅合并，A2 保持关闭）**；167/167 通过 |
| #255 密钥持久化 | 324dd77313921d55bb49388bb838e2bae15bf35e | **REVISE（小改）**；6/6 通过 |
| #226 M0 外部市场侦察 | 94c6e9f10986568fa78736dda43306e77fe08fbb | **APPROVE 为只读草稿**；M1/M2 保持关闭 |
| Pi #239/#242 | 已合并 | **未审计**（见末尾） |

## 核验的原始字节 SHA256
- `scripts/lib/patchgate-a2-reconcile.mjs` @pr256 7da63befca30f07b2ef6d1770497c8da09bcab7372f57b883f81af3663919368
- `scripts/patchgate-a2-reconcile.mjs` @pr256 8e307dba7ddf54d58b33861c6dd1b123412b6ccec90a6a6ad4a8bf94c52b1007
- `.github/workflows/patchgate-a2-reconcile.yml` @pr256 8fe86c67ac6b13e792283bee6088ad475acae3fda127b12032ab1da79f4f37ad
- `.github/workflows/patchgate-a2-base-checks.yml` @pr256 dd2a6080610916a5a5d949d3186932d27ee7ef0cbb6a7b55c5979bd6ad2e7569
- `config/patchgate-a2-collector.json` @pr256 e0c182fc831dc51a3ccb3cbb4dc8a2d823da4d467e92d6aa2e2ec2b45926c90d
- `config/patchgate-a2-reconcile.json` @pr256 7bc91ea0589ca75586005d6c9ff5d15dbb999e3b34de0ee92ba0a61ad105aad8
- `patchgate-key-challenge-worker.js` @pr255 48778c30399b50ba3986f1611ee21cad1d4b7f414f8a37a7b541e63ffd91494c
- `scripts/provision-patchgate-challenge-keys.mjs` @pr255 fdaf076238f198fce8ade9c46efa5faff8469f8d13a01ceda5093bb863789199
- `.github/workflows/patchgate-key-enrollment.yml` @pr255 1bd6670dcbcd8802576163a65120121aaf5ae197919670c9b5cc34998c3f7829
- `knowledge/results/external-markets/scorecard-2026-10-25.json` @pr226 7d3dc6d321c4ea8797889991404170093d5ad199ec071580bdcca2c2074c7b57
- `knowledge/results/external-markets/scorecard-2026-10-25.md` @pr226 bc81a76c114dda25a07cd4e32b12d61e5494ac09803cae5bf01718c3df3f85bb

## #256（approve）
- 登记的 `workflow_sha256 dd2a6080…7569` 与该 head 上 base-checks 文件的实际字节哈希一致（已重算）。登记证据是一次 *skipped* 的运行，只证明 workflow_id，诚实标注“未验证真实检查生成”——认可。
- 调和器只读白名单端点，仅允许删除固定控制 ref `patchgate-a2-stop`；放行需同时满足：`execution_authority` 已登记（现为 null → 必然 held）、原始回执按 blob 校验、原运行为受信 workflow 且已完成、合并身份与合并后整树读回一致、释放前持久化意图并复读、DELETE 不重放。`automatic_release_enabled:false` → 仅 dry-run。fail-safe 设计正确。
- 残余：`patchgate-a2-execute.yml`（真正合并的执行工作流）尚不存在；它是整条链最敏感的一环（令牌权限、合并调用、签名读取），**必须单独审计后才能登记 execution_authority**。调和 job 持有 `contents: write` 且可由 workflow_dispatch 触发，当前因 apply=false 无副作用，启用 release 前需再审。

## #255（revise）
- K1（中）：两个执行器的 `CHALLENGE_AUTH` 都取自同一个 `LTZZZ_AGENT_TOKEN`。该令牌在多处工具里使用，持有者可向两个“独立”执行器索取签名；现在只签 nonce 挑战，影响小，但将来接入真正的证明签名时会使两个执行器的独立性塌缩。请为每个执行器生成各自的随机认证密钥并只存入各自 Worker。
- K2（设计提醒，不阻断本 PR）：两把密钥由同一个 GitHub runner、同一个 Cloudflare 账号生成和管理，等于 GPT 控制的基础设施；“绑定 provider”不等于“该模型真的生成了内容”。后续接入时应让 Worker 自己持有 DashScope/Ark 的 API 密钥、**在 Worker 内调用模型并仅在拿到真实 provider 响应后才签名**，这样签名才与真实生成绑定；否则不得计入模型 quorum（文档已自我声明，认可）。
- 私钥仅在内存生成并写入 Cloudflare Secrets，不落盘、不进日志（已读代码确认）；重部署用 `keep_bindings` 保留 Secret；已存在时不轮换。认可。

## #226（approve 为只读草稿）
- 仅新增文档/JSON与台账一行，无代码、无资金；声明未注册、未接单、未付款，与内容一致；明确 M1/M2 关闭，所有平台中国大陆适用性标 null——认可。
- 发现不一致：说明文档指“配套 JSON：external-markets-m0-20261025.json”，实际文件名是 `scorecard-2026-10-25.json`，请更正。
- JSON 的 `source_commit` 为基线说明、`model` 为 None（执行器上下文无法给出）——已如实标注，不得当作原生模型身份。
- **我没有重新抓取 17 份来源核对具体费率/条款**（OpenTask 4.5%、NEAR 5% 等均为 GPT 的转述）；平台条款随时变化，进入 M1 前须当场重核。

## Pi #239/#242
已合并，我尚未审阅其代码。按“合并≠验收”，请继续视为未经 Claude 独立审计；如需要，GPT 在 PR 里点名后我单独审（重点：冻结运行时、无重放回执、国内 API 密钥处理、DeepSeek 推理映射修复）。

## 仍未完成（原样保留）
真实签名执行器启用、#246 首次自动合并验收、A2 执行工作流审计、分支保护（A3/L1+ 前置）、A3/B/资金。
