# Claude 独立审计：#259（A2 执行工作流）与 #255 令牌修复复审

任务 PLAN-PATCHGATE-ESCROW-20261023。咨询性文档（共用 GitHub 账号，非密码学签名）。不启用 A2/A3/B，不涉及资金。未改动的代码沿用 #254/#257 旧审计，只审新增部分。

| 对象 | head | 结论 |
|---|---|---|
| #259 A2 执行工作流 | 034bbe21f1f8095daa4378bf62201308b82eb771 | **APPROVE（仅合并，A2 保持关闭）**；184/184 通过 |
| #255 密钥持久化（令牌修复） | 519959c1c25bdf3030347e3845d476e152c9278a | **REVISE**：新问题见下 |

## 核验的原始字节 SHA256
- `.github/workflows/patchgate-a2-execute.yml` @pr259 c6ffc93ca6cabec33505c677fd54e29179073bd1301d58cd36c85c0edf12f754
- `scripts/lib/patchgate-a2-executor.mjs` @pr259 88fe5819c13a68baaa0bf3b95b32974a7edcb16db2fd57ce757122c5f56384a4
- `scripts/patchgate-a2-execute.mjs` @pr259 0d149cffa2b94ec1aeea576c5f92de582f6051b3a6fbb6b8bb4f151e4c6dac95
- `scripts/patchgate-a2-preflight.mjs` @pr259 7b9db77b0dc990f682b3ccf866329c2dbe7ad9506e043bcb80052f36249b6a96
- `scripts/provision-patchgate-challenge-keys.mjs` @pr255b 85220dc1b5aba08c4d141169addc372f861c437ec45034b8ea8baece2596c36a
- `patchgate-key-challenge-worker.js` @pr255b 48778c30399b50ba3986f1611ee21cad1d4b7f414f8a37a7b541e63ffd91494c

## #259（approve，仅合并）
做得对的地方：
- 只响应 `workflow_dispatch` 且 `ref=main`；执行步骤检查 `GITHUB_WORKFLOW_REF`、`GITHUB_SHA==checkout`、仓库与事件，PR 触发只跑测试，不进入 gate/execute。请求以环境变量传入（不拼进 shell），仅接受已有的收集身份 schema，≤4096 字节。
- gate 在任何阻断项存在时（A2 未启用、签名未登记、bundle 未批准、`execution_authority` 未登记等）不做网络调用、不进入 execute；execute 前后两次读取运行身份（run_id、attempt、workflow_id、path、head_sha、`in_progress`）并绑定登记的 workflow_id。
- 候选范围再校验：仅普通 L0 Markdown、100644、非二进制、不得修改自身检查、扫描无发现；检查结果必须来自受信收集器且摘要匹配；准入证据读自固定分支/内容并重算 blob SHA1，绑定 subject、base、head、checks 摘要；合并只走已审计的 `mergeDocsOnce`（密码学 quorum、停止闩、合并后整树读回）。
- 执行器与工作流四个新文件已纳入 bundle 清单，修改会使已批准的 bundle 哈希失效（已核对 preflight 差异）。输出报告固定文件名、`wx` 写入，无令牌。

建议（不阻断合入）：
1. N1：`execute` 作业整体持有 `contents: write` + `pull-requests: write`，且任何有写权限的人都可 dispatch；伤害被“密码学 quorum + L0 + 停止闩”限定，但启用前建议用 GitHub Environment 加保护（owner 无需操作，配置由 GPT 完成），或至少在 gate 里要求候选 PR 的作者属于登记名单。
2. N2：准入证据的**生成端（真实签名适配器）尚不存在**——没有它 execute 永远进不了合并路径。适配器是下一个最敏感的组件，必须单独审计，并采用 #257 建议的“Worker 内部调用真实模型，拿到 provider 响应后才签名”。

## #255 令牌修复复审（revise）
- 已修：每个执行器各生成独立随机 `CHALLENGE_AUTH`，不再共用 `LTZZZ_AGENT_TOKEN`。
- **新问题 K3（中）**：该随机令牌只存在于运行器内存，运行结束即丢失（Cloudflare Secret 无法导出，已存在的 Worker 直接报 `existing_executor_auth_not_exported_no_rotation`）。结果：首次运行内的“重部署前后两次挑战”可以通过，但**之后任何人（包括未来的签名适配器、重启后验证）都无法再向 Worker 发起认证请求**，持久性无法被后续独立验证。建议改用 GitHub Actions OIDC：Worker 验证 OIDC JWT 的 `repository`/`workflow_ref`/`ref` 声明，无需保存共享令牌，也不依赖 GPT 保管任何秘密。
- 该分支落后 main（与当前 main 的差异含大量无关文件），合并前需 rebase；我只审了 provisioning 脚本与 Worker 的差异。

## 未验证范围
未读 #259 的测试逻辑与 `collectTrustedChecks` 的新增调用细节，未做对抗性探针，未验证任何真实运行；#255 的测试 6/6 来自 GPT 声明，我只重跑了上一版。

## 启用前仍须满足
真实签名适配器及其单独审计；登记 `execution_authority`、真实千问/豆包签名执行器；#246 的真实首次合并验收；对启用提交再审一次。A3/B/资金不在范围内。
