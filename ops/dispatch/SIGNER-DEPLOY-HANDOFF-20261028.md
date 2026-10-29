# SIGNER-DEPLOY-HANDOFF（火山签名服务部署交接单）

- 交接人：豆包（云 VM 执行席，did:ltzzz:doubao）
- 交接时间：2026-10-28（美西）/ 2026-10-29（CST）
- 交接对象：桌面章鱼猫（桌面本机执行端）或任何具备火山管理面凭据的席位
- 背景：PR #282 / REMAINING-DEPLOY-20261028 中"火山签名服务"因执行端无云资源部署身份阻塞；现 owner 已在火山控制台创建子用户（ltzzz-deploy，编程访问）并授权 **VeFaaSFullAccess + TOSFullAccess**，AK/SK 已由 owner 配置（GitHub Actions secrets 或桌面本机环境，二选一）。

## 目标
按 `ops/dispatch/PLAN-SPLIT-SIGNER-INFRA-20261026.md` 验收 5 条，完成火山侧签名服务部署。

## 验收 5 条（照 PLAN，克劳德审计据此判）
1. **火山侧生成 ed25519 私钥，不可导出**：私钥只存在于火山函数服务/密钥管理侧，执行端不得持有私钥、不得导出。
2. **部署签名函数（接口 /attest）**：函数接收 {payload_sha256, role, provider}，用私钥签名并返回 {signature, public_key_spki, signer_source_sha256}。
3. **服务源码 SHA256**：签名函数源码（含私钥生成/签名逻辑）计算 SHA256，随回执登记。
4. **登记公钥与哈希至 trust registry**：按 `scripts/lib/patchgate-native-response.mjs` 校验字段登记云端点：
   - `provider` ∈ ['aliyun_dashscope','volcengine_ark']
   - `source_deployment_verified: true`
   - `allowed_signer_source_sha256[]` 非空且为 64 位 hex
   - `cloud_account_binding` 字符串（子用户/账号标识）
   - `deployment_evidence_sha256` 非空
   - `public_key_spki` 非空（SPKI 格式公钥）
5. **重启后挑战签名**：服务重启后，用登记公钥验证一次挑战签名；随后一次真实 provider review 签名被 A2 验签通过（A2 执行门禁仍默认关闭，不影响放行）。

## 凭据使用纪律
- `VOLC_ACCESS_KEY` / `VOLC_SECRET_KEY`：执行端只在使用时读取，**不得读取/展示密钥明文、不得贴入对话/日志/仓库**。
- 若凭据在 GitHub Actions secrets：执行端必须通过 Actions workflow 在 runner 中读取并执行（云端豆包与桌面执行端同样看不到值）。
- 若凭据在桌面本机环境变量：仅桌面本机执行端可用。

## 回执要求（完成必填）
- 落盘 `knowledge/results/dispatch/oversight/signer-deploy-20261028.md`：执行身份、实际模型调用数、paid=false / tx_hash=null、公钥 SPKI、源码 SHA256、服务地址、重启挑战结果、登记字段全值。
- 同批 `ops/派单台账.md` 加行，状态按实写。
- 未完成项如实标注，不编造服务地址/公钥。

## 当前阻塞（交接时如实注明）
- 云 VM 执行端未确认到 VOLC_* secrets（截至 2026-10-28，仓库 Actions/环境/org 级 secret 列表均无）；owner 声称"已配好"，需先确认凭据实际位置再执行。
