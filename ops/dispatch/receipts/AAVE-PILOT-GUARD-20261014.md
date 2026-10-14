# Aave pilot 旧 active_intent 防御与只读验收 · 2026-10-14

## 授权与范围

接手豆包的 Worker 故障修复和部署。owner 最新说明：币安 AAVE 暂不转入。本轮不转账、不兑换、不跨链、不扩大额度、不触发 supply/withdraw，不调用付费模型；现有机器人和定时频率不变。

## 修复

- autoAave 不再无条件读取缺失对象的 i.id。旧指针缺记录、记录畸形或指向终态时，返回 blocked_reconciliation，保留原 DO 状态与预算，不另起交易。
- 相同防御覆盖 execute，避免换入口绕过锁。已存在的待确认 intent 预览保留原 ID，并隐藏已签名原始字节。
- RPC 顺序为 mainnet.base.org → base.drpc.org → base-rpc.publicnode.com。状态读取按单个区块读取余额/allowance/储备配置；完整读取失败才切换节点，而不只探测 chainId。只读回退不包含任何签名回调。
- 新增需认证 GET /market/aave/diagnostics 和 POST /market/aave/auto-preview。部署验收仅查询、诊断、预览；不清除旧记录。
- runner 对 HTTP 500/401、服务 ok:false、未确认的真实执行返回失败。只读预览验证到明确的 blocked_reconciliation 时，标记 service_verified=true 和 execution_blocked=true；这仅说明防御接口有效，不表示试投完成。诊断与预览分别存文件，避免覆盖余额证据。

## 测试

本地部署工作流所列 7 个测试文件：55 项全部通过。包含缺失/畸形/终态旧指针、无存储写入/无 RPC 的早期阻断、旧 intent 预览不签名、RPC 整体读取故障回退及错误链拒绝、runner 子进程退出码检查。首次 1 USDC 存入/退出门槛、原试点 20/100 USDC 限制和退出后声誉策略均保留。

## 资金与验收边界

AAVE 代币不等于 Aave 借贷协议；Ethereum USDT 不等于 Base 主网原生 USDC。此 Worker 只支持 Base 原生 USDC 和固定的 Aave Pool，不接收 AAVE 作为该供给步骤的资产。

此前文档把“未看到余额变化/无回执”写为“从未广播”证据不足：缺失交易记录时不能排除签名或广播过的未知交易。禁止仅凭 active_intent 无对象就清锁并重开 intent。新诊断将提供真实生产结果，部署前不宣称其已经核实。

未完成：旧 active_intent 的生产核实/交易对账、1 USDC 存入与退出的真实确认、200 USDC 投资；本回执不是链上付款回执。部署运行及当前阻塞另附实际验收后更新。

## 第一轮线上更正（UTC 09:48–09:49）

PR #49/#50 已合并。第一次 run 38544720777 上传成功但余额验收失败，不计作完整成功；第二次 run 38545041836 全部验收通过，55 项云端测试通过，模型调用 0、交易 0。

**关键反证**：旧 intent DOUBAO-AAVE-FIRST-38380985712 实际存在，状态 prepared，approve 步骤含持久化的已签名交易，哈希 0x9d7f562445248977541c3de755a34a29bfbd7c7a9139ea93c43fa1939f14dd18。因此早期“对象丢失、可直接清锁重开”的高置信根因不成立。预览保留原 intent 和已签名步骤，不广播原交易，也不创建替代交易。

Base block 52591011 只读余额：USDC 349.898316、aUSDC 0、ETH 0.002；allowance 0，首投/首退均未确认。余额读取实际经历官方节点及 drpc 失败后 publicnode 成功，说明单次节点可用性不稳定，需要整次读取回退。

本次观察到部署后短时间仍可读到旧版本响应结构，因此后续验收增加 aave-guard-v3 标识：必须等到服务端返回预期版本再接受结果，避免旧代码 HTTP 200 被当作新部署验证。新增只读 reconcile：在 Worker 内校验存储签名的 chain/from/to/data/hash，再查原 hash 的链上状态和钱包 nonce；不输出原始签名字节，不签名、不广播、不清锁。查不到 hash 只代表被检查节点未找到，不能写成“从未广播”。
