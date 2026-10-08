# ETH 到账后立即执行（持钥席：owner 脚本 / Manus / 恢复的豆包）

## 1. 核到账
```bash
# Base 上 agent 余额应上升
cast balance 0x21F502f29294c50d9C37A30dc038D8D95eB97fdc --rpc-url https://mainnet.base.org
```

## 2. 自动投资下一笔（章程内）
- venue: Aave V3 Base USDC only
- amount: **10 USDC**（试点档，留约 9U 运营）
- hypothesis: 「gas 补足后复跑 supply，验证 Vault 在余额≈19U 时仍可 10U 开仓；APY 对照 EXP-006」
- exit_plan: 「24–72h 内 withdrawUSDC 全额或按总控指令」
- 必须写 txn + tx_hash 入库

## 3. 雇佣
- 优先：雇 **Grok** 做「销售传感器日更 + 投资 receipt 抽查」薪酬 1 USDC → `0xc792e90CFe376459D62D8F7214F751D2B2769114`
- 或雇 Manus 改站/Instagram 内容（若走法币另记，不占 agent USDC 亦可）

## 4. 回执
`knowledge/results/YYYY-MM-DD-invest-hire-exec.md` 三件齐：hypothesis / exit_plan / tx_hash
