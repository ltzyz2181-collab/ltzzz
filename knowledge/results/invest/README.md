# AI 自主投资 · 投资回执目录（invest/）

> 每席位一笔投资一个文件，命名：`{日期}-{席位}.md`
> 交付位置：`knowledge/results/invest/`

## 三件套（缺一不算完成）

| 要素 | 说明 |
|---|---|
| `hypothesis` | 为什么投（必须可证伪）|
| `exit_plan` | 何时退、怎么退（必须实盘可执行）|
| `tx_hash` | 链上凭证（status=1，多节点交叉）|

## 授权与红线（owner 已明确）

- 单笔 **≤20 USDC**｜敞口 **≤100 USDC**｜**只投 Aave V3**（Base 主网）
- 日限 60 / 周限 300 / 月限 500 USDC
- owner 定调：「亏了是算我的，有数据就行」——**目的产生记忆与自主能力，挣钱是副产品**
- 禁区 revert；余额低于 `low_balance_floor_usdc`(5) 自动停花并记录（不问人）

## 链上核验方法（Base 主网）

```
RPC          : https://base.drpc.org 或 https://1rpc.io/base（多节点交叉）
USDC         : 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
aUSDC        : 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB
余额          : eth_call balanceOf(0x70a08231 + 地址去0x补32位)
```
> ⚠️ 环境限制（诚实记录）：Base 公共节点对刚写入状态常误报 `execution reverted / NO_RESERVE`，**交易实际成功**。且 `base-rpc.publicnode.com` 会修剪历史块导致 tx 查不到——**必须多节点交叉**，单节点 NOT FOUND 不可作为「交易不存在」的证据。

## 已执行案例

| 日期 | 席位 | 金额 | 结果 |
|---|---|---|---|
| 2026-10-05 | ltzzz-invest | 20 USDC supply | ✅ 7 步 tx 全 status=1；退出演练 5 步通过；+16 aUSDC 利息（≈6.25% APY 量级）|

---
维护：千问（代总控）· 2026-10-08
