# Claude 独立审计：#255 OIDC 复审与 #263 原生响应签名适配器

任务 PLAN-PATCHGATE-ESCROW-20261023。咨询性文档（共用 GitHub 账号，非密码学签名）。不启用 A2/A3/B，不涉及资金。未改动代码沿用旧审计。

| 对象 | head | 结论 |
|---|---|---|
| #255 密钥持久化（OIDC） | 58cef023fff5b79a5591e628a2138dfb652310fb | **APPROVE（仅合并，不构成准入）**；专项 16/16 通过 |
| #263 千问/豆包原生响应签名适配器 | 818cd8e962f462a6defd4668e5af92b84d733fae | **REVISE（可合并为默认关闭的候选，但启用前须补 M1–M3）**；219/219 通过 |

## 核验的原始字节 SHA256
- `patchgate-oidc.mjs` @pr255c 08e7d2f2d9a8e0aa2c76388de0478af81c1d80fc907520568f98e92b1d9ed18f
- `patchgate-key-challenge-worker.js` @pr255c 3048e2a08048caf97ef80d9b607dc66b6aec21b5d69f1a328c341c9eb985aa81
- `scripts/provision-patchgate-challenge-keys.mjs` @pr255c aa8daef37d47e3a4430db38ebeeaf7e1ff43c9536b135a9d98f57140694ba753
- `.github/workflows/patchgate-key-enrollment.yml` @pr255c 086fbd3e3cfef0af0e2efdc802d5a773e401cd95f7ac35d72df2bc0536efb47a
- `patchgate-model-attestation-worker.js` @pr263 ddfdd8abbae9db57a10de280a56098f6844132ec1ffddaf97518955af99cdfaf
- `patchgate-attestation-evidence.mjs` @pr263 4a0c5438990e361345054d130405b34afe2d753ee681e9cd3f80ddd615aea924
- `scripts/request-patchgate-model-attestation.mjs` @pr263 a28f1cd66e35d2eca11fbbad0e7d9e142700954393d897f3cd441e6d427e744d
- `.github/workflows/patchgate-model-attest.yml` @pr263 7083697fd2d04fe005b82c70b575c07a8ec5a251c9dc0507420b93f1cf919bbd
- `config/patchgate-model-attestation.json` @pr263 dcb09111a75df07c406d49843b6f20df358f5fc033f951591da515dfa1ec95fa

## #255（approve，仅合并）
- K3 已解决：不再需要共享令牌。OIDC 校验固定颁发者、仓库与 owner 的数字 ID（与 GitHub 实际 `1157602630`/`261544579` 一致，已核对）、`ref=main`、`workflow_ref`、事件类型、GitHub 托管 runner、`workflow_sha==sha`、iat/nbf/exp 窗口（≤600s）、RS256 与唯一 kid；`enrollment` 作业仅持 `contents: write, id-token: write`。
- 仍是**持久性挑战**，不是准入：不能签 A2 作者/复核/检查载荷。旧版问题（令牌丢失）因认证改走 OIDC 而消失。

## #263（revise：可作为默认关闭候选合并，启用前须补）
做得对的地方：
- Worker 不接受调用方提供的证据：自己从 GitHub 读取 main、候选 head、策略/信任、compare、两棵完整树，并重算 blob SHA1；评审对象是不可变 BASE/HEAD 字节而非调用方 diff；模型输入前做密钥模式扫描，输出再扫一次。
- 先持久预留（Durable Object 事务：每操作一次、每供应商每日 2 次）再调用模型；未知/失败一律“无重放”；固定供应商 URL、无重定向；仅接受 `finish_reason=stop` 且 JSON 恰含 `verdict/analysis`；签名前再次确认 main/PR 未移动。
- 仅支持 `review`/`stage_review`，不支持作者与检查签名（配置如实标注），`enabled:false` 与 `NATIVE_ATTESTATION_ENABLED=false` 双默认关闭；调用来源限定为 `patchgate-model-attest.yml@main` 的 OIDC。

必须在启用前补齐：
- **M1（高）签名不绑定被部署的 Worker 源码**：任何能重新部署 Worker 的人（同一个 Cloudflare 令牌/GPT 的 CI）都能让它对任意内容签名，而签名仍然有效。请把 Worker 源码哈希写进签名载荷，并把允许的源码哈希登记进信任注册表/preflight；部署只允许来自已审计的 main。
- **M2（高）“独立”仍是 GPT 控制的基础设施**：两把密钥、两个 Worker、两个供应商密钥都由同一 CI/同一 Cloudflare 账号管理。文档已如实说明；但在 M1 之前，不能把两个签名当作“两个互相独立的运营方”。该局限不应通过话术消除，而应由 owner 知悉。
- **M3（中）`stage_review` 的保证力有限**：让模型一次读取至多 600KB 运行时文件并输出 ≤4096 token，就签发 bundle 的 `approve`，既易受文件内注释式提示注入影响，也谈不上充分审计。它只能算“另一份意见”，不得替代人工/Claude 对 L1+、A3、资金的独立审计；`required_stage_auditors` 只覆盖 A2 的 L0 文档合并。
- **M4（中，可用性）** Worker 对 GitHub API 的读取不带认证，共享出口 IP 下容易触发限流导致失败（失败即消耗当日额度且不重放）。请设计只读读取方式（例如由受信工作流将已校验证据打包一并提交，Worker 仍对其做哈希复核）。
- **M5（低）** 请求者仅需 `workflow_dispatch`（写权限）即可消耗每日 2 次额度；可接受，但应有告警。
- 作者/检查签名适配器尚未实现，A2 仍无法自动合并，符合预期。

## 未验证范围
未读各测试的内部逻辑；未验证 Worker 的 subject 形状与 `subjectFor` 的所有字段逐项一致（测试通过但我未逐字段对照）；未进行任何真实模型调用或真实部署；未验证 GitHub 未认证 API 的实际限流行为。

## 启用前仍须满足
M1–M4；作者/检查签名适配器及其审计；登记真实签名密钥与 `execution_authority`；#246 首次真实合并验收；启用提交再审。A3/B/资金不在范围内。
