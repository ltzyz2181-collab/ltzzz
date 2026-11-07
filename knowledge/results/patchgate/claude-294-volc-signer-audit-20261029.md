# Claude 独立审计：PR #294 火山签名修复（2026-10-29）

- 审计对象：精确 head `f115af017e021b34dab8d7ffa10e70929f5498cc`（对 main 的合并提交；PR 正文所称 `3d589efd…` 是它的祖先，已核实）。head 若移动，本文不延伸到新 head。
- 来源：PLAN-PATCHGATE-ESCROW-20261023 / SPLIT-SIGNER-INFRA-20261026。Claude 身份：独立审计，非原生签名；共享 GitHub 登录无法证明作者身份。
- 结论：**approve_with_conditions，仅限“默认关闭、只读就绪检查 + 运行时候选代码”。不批准部署、不批准登记公钥、不批准启用 A2。**

## 已核实
- 本地 Node 22.22.0 复跑 `volc-signer-closeout / model-attestation / oidc / signer-source / attestation-evidence` 共 **56/56 通过，0 失败/跳过**（与 GPT 的 56/56 一致；GPT 的运行环境是 22.23.4）。
- 文件 SHA256：runtime.mjs `99fadcbb…19e4c`、storage.cjs `dcd59938…e55`、index.js `7c43e704…e4c`、signer-volc-deploy.mjs `e520089d…a07`、volc-openapi.mjs `7e2eb242…a88`、build-volc-signer-release.mjs `0452aa2e…23a`、deploy-signer-volc.yml `38c45db7…e76`、测试 `d3c3a608…bb3`。
- 工作流：PR 任务不带任何云凭据；只读探测仅在 `main` 的 workflow_dispatch 上带 VOLC_ACCESS_KEY/SECRET_KEY，且只调用 ListFunctions/GetFunction，回执不含凭据值。没有任何部署/写入云资源的命令。
- 运行时：私钥损坏时**不再静默轮换**（`persisted_signer_key_invalid_no_regeneration`）；崩溃遗留的锁**不被偷取**（失败即停）；账本损坏不可重置；账本键只允许固定格式；`/challenge` 需要 OIDC 且绑定 `deploy-signer-volc.yml@refs/heads/main`；`/attest` 默认 503；签名只接受固定 key_id 且限长；签的是原生响应而非调用方断言。
- `restart_verified` 与 `restart_challenge_verified` 一律为 false：PR 没有谎称已完成重启证明。

## 需要说明或修改
1. **R1（中，口径）私钥是 NAS 上的文件，不是“不可导出的云签名能力”。** 计划原文写的是云侧持有、不可导出。现实现是 0600 的 PKCS8 文件，凡能读该 NAS 目录的火山账号/角色都能取走私钥。这仍然把私钥放在豆包一侧而不是 GPT 的 CI 里，方向对，但必须在登记文件里写明“软件密钥，非 HSM/KMS”，并列出谁有 NAS 读权限。火山 KMS 的 AsymmetricSign 当前未列 Ed25519，所以这是已知的折中，不是缺陷，但不能写成“不可导出”。
2. **R2（中，可用性）锁文件永不过期。** 崩溃后需要人工清锁，签名服务会一直不可用。方向安全（失败即停），但要写运行手册：谁、凭什么证据、如何清锁；清锁本身必须是留痕操作。
3. **R3（中，范围污染）PR 含 55 个文件，其中大量与签名无关**：`video-output/*`（二进制）、`ops/joblog-*`、`work/relay/*`、`knowledge/video-scripts/*`、`funded-invest/2026-10-17-cex-dryrun.json`、`protection-client/*`，以及合并带入的 funded 订单状态检查记录（2046 行，来源提交 a71fbf1）。我没发现其中有放款代码，但这会让“精确 head 复审”失去意义。建议拆出签名相关文件另开干净 PR，或至少在 PR 正文逐项说明为何包含。**我只审了 cloud/signer-volc-attest、脚本、工作流、测试；其余文件未审，不在本结论范围。**
4. **R4（低）** 运行时把所有异常统一映射为 403 `cloud_signer_unauthorized_or_unconfigured`，模型上游错误与配置错误无法区分，排障要靠云日志；建议只在内部日志区分，不改对外响应。
5. **R5（低）** NFS 上用 `mkdir` 作锁依赖 NFSv4 语义；测试用本地文件系统，没有覆盖真实 NFS。上线前需在真实挂载做一次并发抢锁演练。
6. **R6（信息）** 工作流使用仓库 Secret `VOLC_ACCESS_KEY/SECRET_KEY`。请确认 #274 的“敏感 Secret 引用守卫”对它给出明确分类（白名单），不要靠例外放行；本 PR 未验证与 #290 意见的关系。

## 未验证
真实火山账号/区域/NAS 挂载、VeFaaS 实际行为、真实重启后公钥不变、真实一次原生豆包调用与签名、公钥登记、豆包是否已在火山侧操作（用户口头提到，无回执可核）。IAM Secret 对是否已更新：PR 正文称**未更新**，我无法独立核实。

## 边界
本审计不批准启用 A2/A3/托管/付款/正式五签，也不新增 owner 拍板或总控削权条款。
