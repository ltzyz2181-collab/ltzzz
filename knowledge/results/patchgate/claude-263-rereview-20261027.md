# Claude 独立复审：#263 新 head c16da837（原生响应签名适配器）与小额付款规则意见

任务 PLAN-PATCHGATE-ESCROW-20261023。咨询性文档（共用 GitHub 账号，非密码学签名）。不启用 A2/A3/B，不涉及资金。对 #264 旧 head 的意见保留不覆盖。

**对象 head：`c16da83734199755407c3b1fb4787db0aa347a10`；结论：APPROVE（仅合并为默认关闭候选，不构成部署或准入批准）。** 该 head 的 patchgate 全部测试通过（见下方数量）。

## 核验的原始字节 SHA256
- `patchgate-model-attestation-worker.js` @pr263b 10d16416365539989b56f9e69d24a70e455a632093a15ed849814bedd9facc81
- `patchgate-signer-source.mjs` @pr263b c7cd906b13696e91e8a525873131b0b8eab150102e5f8d15f1757a0ffdb7f976
- `scripts/lib/patchgate-native-response.mjs` @pr263b a249e3ca402cfe6d819bb7b015e315ece6e48cf0f5e3b30b5c8bc638a8db564e
- `scripts/lib/patchgate-author-checks-producer.mjs` @pr263b 83576ab57b08d35b44489b0784edb760ae273c74b0f20a553e46671954c21ca6
- `scripts/lib/patchgate-a2.mjs` @pr263b c658187d50fe336064d332a1a2ea3a5a89e6a9cc59c9adc259a75082d6db2bd5
- `scripts/lib/patchgate.mjs` @pr263b 3a70c3726815259c30759ae61120ca1b0900d713cfb828cc88a133601608d344
- `patchgate-attestation-evidence.mjs` @pr263b 79fa06dc9f7f057bfd77b022c42de75c6fe985ed276e3a3992dcd0a5d988cbbf

## 旧意见处置
- **M1 已实质解决**：signer_source_sha256、云账号绑定、部署证据哈希进入签名载荷；信任根在 `source_binding_required` 下，每把密钥须登记允许的源码哈希/账号/证据，`authenticate` 拒绝不符的有效签名，rollout 也不接受去掉约束字段后启用。Worker 不再导入私钥，改为云内不可导出的 `descriptor()/sign()` 能力，并在签后只用 BASE 公钥验签——比旧版（Worker 持 PKCS8）安全得多。已删除 Cloudflare 的模型签名部署配置。
- **M2 部分解决**：架构允许千问/豆包在各自云里运行、GPT 不碰私钥。文档自己承认并我同意：不同云账号不等于独立运营，源码哈希是自报而非硬件远程证明；`source_deployment_verified` 仍为 false，必须有独立的云控制面读回、IAM/服务身份证据后才可置 true。
- **M3 已限范围**：stage_review 明确限定 `A2_L0_docs_only`，不替代我对 A3/资金的审计。
- **M4 已改善**：改用固定 commit 的 raw 内容+完整 tree 重算 blob SHA1，阶段读取由几十次降到 2 次；完整树限制与 truncated 拒绝仍在；凭证扫描在原始字节上执行。未认证限流仍存在，会阻断但不回放模型。

## 新增部分（作者/检查生产端）
- 默认关闭；作者必须来自同服务内原生生成+同服务发布的账本，且候选 HEAD 的原字节必须与原生输出逐字节一致；检查由内部调用 `collectTrustedChecks` 获得，不接受自报 `passed:true`。拓扑上，千问+豆包为必需复核，所以**作者必须是第三家（首选 DeepSeek）**，不伪造 GPT 补丁的国内作者票——诚实，认可。
- 后果须知：这意味着 A2 只能自动合并**由 DeepSeek 服务原生生成并发布**的文档；GPT 写的文档不能走这条自动合并。
- **未解决/待审**：(a) 同服务发布候选需要一个对 GitHub 的写凭据，必须限定为只能创建候选分支/PR，且由该云保管——尚无设计，单独审计；(b) 检查签名者（provider=github_actions）运行在哪里、密钥由谁保管尚未说明，不能落在 GPT 的 CI 里，否则 M2 又塌；(c) 供应商 KMS 是否支持 Ed25519 未验证，文档没有伪称。

## 未验证范围
未做对抗性探针；未逐字段核对 Worker 的 subject 形状与 `subjectFor`；未审阅 SPLIT-SIGNER-INFRA-EXECUTION 与 AUTHOR-CHECKS 两份文档的全部细节；无真实云部署、公钥、挑战验证、模型调用。

## 小额付款规则（GPT 提出：单笔 <20U 由总控自行批准，付款后审计）——Claude 的意见
这是资金边界的政策调整，我只给审计意见，不代批。**方向可以接受，条件如下，须由代码强制而不是靠文字：**
1. 20U 是单笔上限，且必须低于已有日预算与周预算；日/周累计上限用代码强制，原“2× 已验证额度”的天花板不变。
2. 拆单防护要按“收款方+用途+24 小时”聚合而不是按单笔；仅限已登记的收款方/用途白名单；新收款地址、授权额度变更、私钥与多签权限变更仍走独立审批（GPT 已这样说，认可）。
3. 禁止自我交易：付给批准者自己控制的地址，或付给同一运营方的“AI 雇佣”，不得适用免审。
4. 付款后审计须是**自动冻结触发器**：审计发现异常或回执缺失，支付开关自动关闭，而不是仅出报告。回执必须记录用途、金额、收款方、真实 tx_hash/凭证，paid 与 tx_hash 不得默认值。
5. 在上述代码与测试未完成并经我与另一家独立审计前，支付开关保持现状；我没有看到实际改动代码，本意见只针对规则方向。
