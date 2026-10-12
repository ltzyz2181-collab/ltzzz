# 公开配置回执 · DOUBAO-AAVE-OWNER-SETUP-20261011（v2 方案·待执行）

- 时间：2026-10-11（PDT）· 豆包
- 性质：**公开配置回执（不含任何密钥值）**——本文件只记地址、网络、Secret 名称与注入状态

## 地址与网络（已核实）

| 项 | 值 | 网络 | 状态 |
|---|---|---|---|
| LTZZZ Base 运营金库（复用）| `0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d` | Base eip155:8453 | ✅ 已受控复用（10-12 验收，Worker 签名验签通过）|
| Aave V3 Pool | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | Base 主网 | ✅ 官方 address-book |
| USDC（Circle）| `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base 主网 | ✅ 官方 |
| aUSDC（Aave 计息份额）| `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB` | Base 主网 | ✅ 官方（不是 AAVE 治理代币）|
| Safe（五签）| `0x76379a52a9e82c259E5Db417104C65C26f9C58a3` | Ethereum 主网 | ✅ 链上核实 3/5（见 SAFE-STATUS-20261011.md）|

## Secret / Variable 注入状态（不含值）

| 名称 | 类型 | 计划值 | 状态 |
|---|---|---|---|
| FUNDING_OWNER | Variable | owner Aave 公开地址（Base 持 aUSDC）| ⏳ 阻塞：等 owner 提供 |
| FUNDING_TREASURY | Variable | `0x5df57a…32d`（复用金库）| ⏳ 未注入（方案已定，待执行）|
| FUNDING_EXECUTOR_KEY | Secret | 新建 executor 私钥（脚本生成）| ⏳ 未注入（确认缺失，单独准备）|
| 现有 16 项 Worker Secret | Secret | — | ✅ 保持不动（不覆盖）|

## 当前链上/资金事实

- 最新 funding 执行（38153503363.json，10-11）：`blocked_configuration`，缺 FUNDING_OWNER / FUNDING_TREASURY / FUNDING_EXECUTOR_KEY——三者均未注入，无半截状态
- 现有 worker secrets 16 项（ANTHROPIC/ARK/CF/DeepSeek/Doubao/LTZZZ_AGENT_*/Moonshot×2/OKX×3/OpenAI/XAI 等）：无 FUNDING_*，无冲突
- 未发生任何提款/转账/部署；无 tx_hash 项一律标"未执行"

## 批次预算（owner 指令③）

- 总授权 200 USDC（approve 200e6 raw + configure remaining 200e6）
- 首笔 1 USDC 真实验证（计入总额）→ 分笔 ≤100 USDC / 日 ≤200 USDC 推进
- 本金 200U 应还 owner；利息按 Aave 实际利率补偿；分笔记录；无 receipt 不标完成

## 待 owner 动作（只需公开信息/签名，不交私钥）

1. **提供 Aave 公开钱包地址**（Base 主网持有 aUSDC；MetaMask 复制收款地址即可）
2. **确认五签 signer 归属**（5 地址 → 席位/人，见 SAFE-STATUS-20261011.md）
3. 部署回执出来后：在钱包确认两笔授权（approve + configure，chainId 8453）
