# EXP-004 · Aave V3 Base Sepolia 8 步演练（WETH 版）· 2026-10-04

> 状态：**链上全部通过（status 1）** ｜ 测试钱包：0x4b6D3ebEf9577E2935D7ff32bB5E61E8514E311D
> 网络：Base Sepolia (84532) ｜ RPC：base-sepolia.drpc.org / publicnode 双验证
> 目的：在章程试点档动主网 USDC 前，验证 Vault 依赖的 Aave V3 池子机制（supply→aToken→withdraw 闭环）。

## 链上交易清单（Basescan 可复核）

| 步骤 | 动作 | tx hash | status |
|---|---|---|---|
| 0 | 初始 ETH 余额 0.0001（Coinbase faucet 到账） | — | ✅ |
| 1 | WETH.deposit（wrap 0.00006 ETH） | `0x8c99b3dee63fa90540efb922a64b55ce3d7d0baadc278e06793d0808b2fac378` | 1 |
| 2 | WETH.approve → Aave Pool | `0x3b24a0d6d0182393f5290eeaa1d4d440829eb98cfd002d0051edb5bf21ae03da` | 1 |
| 3 | Pool.supply(WETH, 0.00006, self) | `0x2b8b81abb959ba99baebdf1986eade31d5a9d40b9593bafad42fe04546887c49` | 1 |
| 4 | aWETH 到账确认（0.000060000001857277） | — | ✅ |
| 5 | Pool.withdraw(WETH, 0.00006, self) | `0x7200f2b7603cf4f39a99ada21e1cdd39c442144f245707faa853394d74ba307a` | 1 |
| 6 | 回账确认：WETH 0.00006 全数回到钱包 | — | ✅ |
| 7 | 禁区验证 | 待 Vault 合约部署后验证（池子层已通过） | 挂起 |

## 关键地址（官方 bdg-labs/aave-address-book AaveV3BaseSepolia，2026-10-04 抓取核验）

- Pool: `0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27`（代理有代码 1853B）
- WETH: `0x4200000000000000000000000000000000000006`；aWETH: `0x73a5bB60b0B0fc35710DDc0ea9c407031E31Bdbb`
- USDC: `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f`；aUSDC: `0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC`
- DataProvider: `0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b`（reserve：WETH active/ltv 83.5%、USDC active/ltv 82.5%）

## 踩坑记录（防下次）

1. **drpc.org 免费节点瞬时异常**：supply estimateGas 曾间歇 revert、balanceOf 返回陈旧值 → 双 RPC 交叉验证可解（publicnode 可用：`https://base-sepolia-rpc.publicnode.com`）。
2. **总控旧地址勿再用**（混入 Ethereum Sepolia）：Pool `0x07eA79…`、USDC `0x036CbD…` 已由官方 address-book 纠正。
3. **测试网 ETH 不能从交易所提**，只能 faucet；Coinbase CDP faucet 实发 0.0001 ETH（页面「申请已提交」= 到账）。
4. 测试 USDC 未到账（Coinbase 只发 ETH）；USDC mint 为 Ownable 非公开 → 主网投资资产为 USDC，演练机制已用 WETH 等价验证。

## 下一步

- 主网 aUSDC 地址未确认前，Vault 不可生产部署（aTokenOf() 占位待替换）
- 待总控复核通过后，试点档（≤20 USDC）主网首笔：hypothesis / exit_plan / tx_hash 三件齐
