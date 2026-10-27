# 事实与方案：小额付款自主权的默认关闭实现

原任务 `PLAN-PATCHGATE-ESCROW-20261023`，承接 Claude PR #266。这里只实现“已登记用途、单笔严格小于 20 USDC”的新豁免路径，不扩大已有外部雇佣 0.05 USDC/日一单、Aave 试点、白名单或绝对上限。代码不是付款授权，测试不是生产验收。A2/A3/B 不开启，现有支付环境变量不变。

## 五条规则如何强制

| #266 要求 | 执行位置与拒绝条件 |
|---|---|
| 单笔 <20U、日周预算、2×已验证上限 | `small-payment-policy.mjs` 使用 USDC 6 位精度 BigInt；每个维度取已登记限额、owner 绝对上限、2×独立核验额度的最小值。缺任何一项、未登记、过期、将来时间均阻断。2× 只是额外天花板，不是新增授权。旧 20/60 日预算没有复制回来。 |
| 防拆单、已登记地址/用途 | 新通道固定 `base_usdc`；按真实地址小写＋已登记 purpose group＋滚动24小时累计，包含不同 controller、收款别名和用途别名，合计也必须 <20U。日/周共享 budget_id。未决保留直到独立对账，不按日期自动释放。 |
| 禁止自付和同一经济主体 | controller/payee 都须登记已核实 operator/control；相同 operator、controller 控制的 payee、同地址别名隐藏控制关系均不走豁免。未知经济关系不自动认证。 |
| 异常/缺回执自动冻结 | `small-payment-runtime.mjs` 先事务预留、再确认持久 alarm、再执行一次。独立结算回读不合格、超时/结果未知、独立审计异常或到期缺审，实际写 `switch_enabled=false,frozen=true`。不是只生成告警。 |
| 生效前 Claude＋另一提供商审 | 配置 `enabled=false`，注册/预算/approval 为空；运行时要求独立激活验真能力绑定实际 policy SHA256、release SHA256 及 Claude/不同提供商审计。没有真实登记/复核不能启动。测试的 approve 全是明确标识的合成夹具。 |

20U 只针对本服务支持的 Base USDC 总扣款；请求 `amount_raw` 必须包含全部 USDC 扣款，不允许执行器另扣 USDC 手续费。ETH gas 是独立费用，当前没有实现自动补 gas 或新增 gas 预算授权。其他链、币种、银行卡/API 账单、投资和 Safe 托管不能套用这个豁免。

## 可信输入与部署接口

请求严格只有 `payment_id/controller_id/payee_id/purpose_id/amount_raw/rail` 六个字段。地址、额度、paid、审批、模型身份、预算证据、权限变更都不能塞进请求。`createSmallPaymentService` 只能由受审云执行器构建；没有公开 HTTP 路由。它的认证、存储、结算、审计与调度回调是部署者注入的可信能力，不能由请求者提供。

部署适配器尚未实现/配置，必须逐项验收：

- `authenticateController` 与 `authenticateAuditor` 验证真实工作负载/签名身份；模型自称、共享 GitHub 作者或请求布尔值不是认证。未认证的审计请求无权冻结服务。
- `loadBudgetEvidence` 从受控登记与认证原件取回 `authenticated_budget_limits`：预算 ID、controller/rail/purpose_groups、USDC精度、单/日/周 limits、verified 和 owner_absolute、来源、摘要、verified_at/valid_until。余额或旧交易不能代替预算。空登记保持拒绝，不让总控自行抬绝对上限。
- `verifyPolicyActivation` 独立核实真实 Claude＋另一提供商对**当前 release 和当前 policy**的批准。运行时比较两者摘要；配置内 `approved` 只是登记字段，不是密码学证明，也不能用 fixtures 注册。外部激活证据独立保存，不要求文件包含自身哈希。
- `store.transaction` 必须跨 worker 串行、原子、持久，覆盖整个豁免预算域；每台机器自己的 JSON 文件或最终一致 KV 不够。初始 state 的付款开关也为 false，本库不提供启用/解冻 RPC。
- `scheduleAudit` 必须在转账之前持久保存并确认同一 payment_id 的 receipt_due_at（60秒）/audit_due_at（1小时），由云 alarm 或受管调度器自动调用 `alarm()`，重启后仍有效。当前没有新增 cron，也没有把本地测试 scheduler 当成云调度。
- `execute` 只接受服务内发的一次性、不透明、30秒有效、不可序列化 permit；绑定收款地址、raw金额、用途、rail。外部签名服务需另审等价的绑定/防重放传输，不能把 `{}` 或 payment_id 当 permit。执行器有钱包控制能力，属于可信计算基；本库不能约束被攻陷宿主绕过代码直接签名。
- `verifySettlement` 从独立 RPC/平台原件核对 Base chain、USDC 合约、转出钱包、收款人、真实 raw 扣款、成功状态、确认性及 payment_id 绑定，再给显式 `paid:true/false`、tx_hash、provider_receipt_id、证据摘要。交易提交自报不是确认。这个回读适配器当前未接通。
- `verifyAudit` 验真实不同提供商/执行器、经济独立性、当前 receipt SHA256 和来源原件。缺审不是自己写 approve；真实审计到期才由 alarm 冻结。

## 预留、重试与真实结果

预留在外部调用之前持久化。同一 ID 同意图只回读原单；换意图立即冻结。并发不同 ID 在同一事务中累计预留，因此不能共同穿透额度。执行后结果未知保留 `unknown_reconcile_no_retry`，没有自动再付款。

未决预留跨天/跨周继续占预算；只有独立核实的 cancelled/rejected/failed 才可解除。当前运行时没有自动释放或人工解冻接口，不能靠重启清账。

确认付款必须有显式 `paid=true` 和真实交易哈希；当前链上适配契约还要求 `provider_receipt_id=null`。缺字段、失败、模拟哈希、不同地址/金额都冻结，不能补造 `paid=false,tx_hash=null` 来掩盖未知结果。顶层工程回执的 paid=false 仅指本轮工程没有付款。

数据库故障无法落盘冻结时，返回 `freeze_persisted=false` 和 `durable_state_unavailable_reconcile_only`，当前进程停止继续提交；不谎称冻结已持久化。恢复必须独立核对未决操作和持久开关，不能自动重新初始化 state。已经广播的交易无法被之后的冻结撤回。

## 旧钱包入口的迁移边界

`scripts/wallet-lib.mjs:executeTransfer` 的真实路径现在先检查/消费运行时 permit，再读取环境中的钱包凭据和加载 ethers；不能由旧 CLI 直接传地址/金额跳过五条规则。live 金额使用精确十进制字符串；交易 receipt.status=1 才记提交侧 confirmed，仍须独立结算回读。

原来的 `run-agent-spending.mjs`、`execute-agent-payment.mjs` 未接 permit 服务，所以在真实模式会明确拒绝，不能声称迁移完成。`LTZZZ_WALLET_DRY_RUN=true` 的原模拟路径保留；未明确选择模拟的本地调用现在也要 permit，而不是凭存在私钥就执行。现有 Actions 默认明确 dry-run，本轮未运行/改动其定时或设置。

本改动不覆盖直接使用其他 treasury/Aave/x402 脚本的付款，不声称全项目所有资金已由新服务约束；这些路径继续受原有更窄授权和预算。后续接入要单独列执行入口、审计和测试，不能拿本库代替整个资金系统验收。

## 真实验收前的状态

本地合成测试只证明确定性策略和状态机，包含双实例并发、回执缺失、持久冻结、重启、时窗边界和旧入口拒绝。新只读 PR CI 不用凭证、不花款、不调用模型；它是候选离线测试，**不是受信主线 checks 签名或生产准入**。

尚未完成：当前 release 的 Claude/另一真实提供商独立复核、真实预算/经济关系登记、持久存储和自动 alarm 云适配、真实钱包/结算/审计通道及线上冻结探针。以上补齐之前不启用，不执行 20U 测款。云 GitHub 发布器与独立 checks signer 见 `PATCHGATE-CLOUD-PUBLISHER-AND-CHECKER-20261027.md`，也只是待审设计。
