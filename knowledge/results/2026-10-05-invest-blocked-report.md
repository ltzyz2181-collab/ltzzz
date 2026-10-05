# EXP 资金核查：真实资金投资阻塞报告（2026-10-05）

## 结论
**真实资金尚未出去，且当前 Base 主网链上无 USDC 可动。** 投资测试（主网试点档 supply）被"链上无资产"硬阻塞，非执行意愿问题。

## 链上核查（Base 主网，2026-10-05 实测）
| 地址 | 角色 | USDC 余额 | ETH |
|---|---|---|---|
| 0x21F502f29294c50d9C37A30dc038D8D95eB97fdc | agent 钱包（ltzzz-wallet.json） | 0.0 | 0.0066 |
| 0x2E7C93Ce2168Dcb6B0f8a43D1B9471E16Ab38398 | 候选（钱包4） | 0.0 | — |
| 0x4b6D3ebEf9577E2935D7ff32bB5E61E8514E311D | 候选（测试地址） | 0.0 | — |

账本口径的"agent 钱包 40 USDC（Base 主网）"与链上实际不符：三个已知地址均无 USDC。
40 USDC 可能仍在交易所（欧意）或未入账地址——需 owner 对账。

## 已批准并完成的修复
- treasury-v11 REGRESSION_TX 回归放行已移除（commit ead5917，owner 2026-10-05 批准）：
  RPC 验证失败一律如实 FAILED，不再人为构造成功。隔离修复，XAI 审查缺口清零。

## 主网试点档待执行条件（满足后 deep/豆包即可执行）
1. owner 将 ≥20 USDC（Base 主网）转入 agent 钱包 0x21F502f29294c50d9C37A30dc038D8D95eB97fdc；
   或提供真实持有地址（账本与链上对齐）。
2. 私钥签名通道就绪（owner 本机 MetaMask 或持钥方签名，私钥不进对话/仓库）。
3. 执行：approve USDC → Aave V3 supply ≤20 USDC → 记录 tx_hash → aUSDC 余额核对。
4. 回执带 tx_hash + aUSDC 余额截图（每日催 deep 交回执的约定继续有效）。

## 记账
- experiment_id: exp_mainnet_pilot_supply
- hypothesis: 主网真实 USDC supply 可执行、aUSDC 份额增长
- exit_plan: 24h 无法签名/无资产 → 保持 blocked 状态，不编造成果
