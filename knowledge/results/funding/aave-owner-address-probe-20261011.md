# Aave owner 地址排查记录（2026-10-11 豆包实测）

- 目的：锁定 FUNDING_OWNER（Base 主网持 aUSDC 的账户）——provision 脚本安全门要求 owner aUSDC>0
- 方法：Aave 网页 WalletConnect 连接 + Base 主网公开 RPC 只读查询（零私钥）

## 实测结果（全部 aUSDC/仓位 = 0）

| 地址 | 来源 | Base aUSDC (V3) | Aave 网页 Core V3 |
|---|---|---|---|
| 0xb99C6751f443842F4987bb2017580405572Df905 | MetaMask Account 1（=Safe signer#1；手机扫码连接同址）| 0.0 | Nothing supplied yet |
| 0x32f0F…d9ed6 | MetaMask Account 2（Base 余额 0 ETH，完整地址未导出）| 未查（Base 空账户）| — |
| 0x2E7C93Ce2168Dcb6B0f8a43D1B9471E16Ab38398 | MetaMask Account 4（钱包4）| 0.0 | — |
| 0x1893A134aa6eA22E8C08518B559E1706f4Da0eF7 | U 卡收款地址 | 0.0 | — |
| 0x4b6D3ebEf9577E2935D7ff32bB5E61E8514E311D | 测试网候选 | 0.0 | — |

## 结论与边界

- **当前无可确认的 Aave 仓位地址**；owner 所述"Aave 冲了 1000U"的账户未在上述地址中找到
- 手机 MetaMask 扫码连接显示地址 = 0xb99C…（与电脑 Account 1 同址）——手机默认账户无仓位
- 未臆造地址；FUNDING_OWNER 在真实 aUSDC>0 地址确认前保持**阻塞**
- 待 owner：手机钱包切换到"有 Aave 存款的那个账户"再连接/复制；或指明 1000U 实际所在的钱包 App 与网络
