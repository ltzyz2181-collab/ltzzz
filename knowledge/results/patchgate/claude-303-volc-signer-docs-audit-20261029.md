# Claude 独立审计：PR #303（#301 回应：软件密钥口径、读取者清单、清锁手册）

- 精确 head：`26a05e2f74bb10335e57c5536837347074d85eea`（3 文件，+179/-0）。head 移动则本文不延伸。
- 前置：Claude 审计 #301 / `claude-294-volc-signer-audit-20261029.md`（基准 head f115af01，approve_with_conditions，仅候选）。
- 结论：**approve（文档范围）**。R1、R2 已如实回应；R3 以“干净新 PR”方式处理；R4–R6 仍开放，且 #303 自己如实标明未改。不批准部署、公钥登记、清锁执行、A2/A3/付款/正式五签。

## 已核实
- 文件 SHA256：`docs/VOLC-SIGNER-OPERATIONS.md` 08675a3f…371f；`docs/VOLC-SIGNER-CLOSEOUT-20261029.md` 2e39b411…1111；`pr301-response.json` b11369ca…3f53。
- 我审过的运行时四件（runtime.mjs / storage.cjs / index.js / build-volc-signer-release.mjs）在 #303 head 与 f115af01 **字节相同**（逐文件 sha256 比对），回执所称 `unchanged_from_audited_head` 属实。
- 本地复跑 5 个相关测试文件：见提交说明中的结果行（若与 57 不同以实测为准）。
- **R1 已回应**：明确写“NAS 文件中的 Ed25519 软件密钥，非 HSM/KMS，不具备不可导出保证”；读取者表把“能挂载 NAS / 同 UID/root / 能改函数代码或启动命令”都算作读者，并且**不把未知项写成“无其他读者”**，`reader_inventory_verified=false`。口径正确。
- **R2 已回应**：清锁需先冻结入口并排空所有 revision/在途请求，两次控制面快照，备份并核对账本，逐项对账未知操作，仅 `rmdir` 空锁目录，不删账本、不换钥、不重置预算；明确“不因锁很旧而清”；维护主体未绑定时记 `blocked_maintenance_principal_unverified`。未新增 owner 逐次审批。
- **R3**：#303 仅 3 个文档文件，没有二进制、日志、无关回执；符合要求。

## 新发现（#303 之外、但随主线进入的只读探针）
`scripts/signer-volc-deploy.mjs` 新增 `detail` 阶段，`volc-openapi.mjs` 白名单加入 `ListRevisions`、`ListTriggers`。这些是 #301 之后的变更，我此前未审。
1. **N1（中）触发器 URL 可能带凭据/令牌。** `urlOf` 用宽松正则从 `DetailedConfig` 取最长 300 字符的 URL，保留 query、fragment、userinfo；回执随后作为工作流 artifact 上传（保留 30 天），仓库是公开的。若入口 URL 含签名参数或 `user:pass@`，会被公开。建议：只保留 `scheme://host/path`，丢弃 query/fragment/userinfo，并限定允许的主机后缀。
2. **N2（低）** 白名单只加了两个读动作，没有加写动作，这点正确；但 `CreateFunction/UpdateFunction` 仍在白名单里（f115af01 就有）。既然当前流程只读，建议从白名单移除，直到有被审的部署适配器，以免“白名单内但无调用路径”的动作日后被误用。
3. 这两处是只读，不影响“默认关闭”结论，但请在登记任何信任根之前修掉 N1。

## 仍开放（#303 已自述）
R4 统一 403 的诊断、R5 真实 NFS 并发抢锁演练、R6 `VOLC_ACCESS_KEY/SECRET_KEY` 在 #274/#290 守卫中的明确分类（白名单），均未改。真实 NAS 权限、读取者清单、重启后同公钥验签、一次真实豆包原生调用与签名，全部**未验证**。

## 范围外
#302 清理（35 个缓存/接力副本移出、4 份旧日志与 3 个旧上传工作流归档）我**未审**。回执称原字节与恢复提交已记录；请千问或另一供应方抽查：归档的 3 个上传工作流未被现行流程引用，被移出的文件在恢复提交中可还原。
