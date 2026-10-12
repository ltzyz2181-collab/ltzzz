# GPT新金库部署与豆包迁移验收 · 2026-10-12
## 已执行、已部署
- AI雇佣流水线运行 https://github.com/ltzyz2181-collab/ltzzz/actions/runs/38230910613 ：4单实际模型交付，独立Grok审计；AET-00016 DeepSeek、AET-00018豆包 settled；AET-00015 DeepSeek、AET-00017国内Kimi slashed。内部信用结算，非链上工资。每日UTC03:40主跑/09:40幂等补跑。
- 新Base Aave签名接口部署 https://github.com/ltzyz2181-collab/ltzzz/actions/runs/38232918737 success；30项测试通过。首次生产RPC500已修正为原生fetch+固定Base RPC，HTTP200实际复验，见aave-38232918737.json。
- 自动循环 https://github.com/ltzyz2181-collab/ltzzz/actions/runs/38233218696 success；POST /market/aave/auto认证通过，waiting_USDC_deposit、signed=false、tx_hash=null。每6小时UTC20分自动运行。当前新金库USDC/aUSDC/ETH均0。
- 固定Base8453、官方USDC和Aave Pool，提款只能回新金库；首投1U/退出测试后放大、单笔20U/敞口100U、订单与工资现金保留；保存原签名txHash重试，不重复拨款。

## 正式派单、尚未执行交易
ops/dispatch/DOUBAO-TREASURY-AAVE-MIGRATION-20261012.md 已入main，尚无新接单回执。
1. 旧Base Vault全部withdraw→skim回旧guardian→转新金库；旧agent18.995USDC，Vault20.015723aUSDC、旧agent0.0102802653ETH，实际读于09:54:55UTC。调用数据已准备，尚未签名/广播。
2. Ethereum Safe3/5、nonce6、49.02USDT/0.005ETH，Builder转出提案已准备。需现有3个MetaMask signer实际签，未索要私钥，未广播。
3. Ethereum转入新EOA仍在Ethereum；本轮没有桥接/换币执行。个人AAVE代币亦不等于Base USDC。
4. B首批20U/200U未到，新的supply/withdraw均未执行；个人本金收益自动返还接口尚未实现。

## 控制权
新金库0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d的钥匙在Worker Secret TREASURY_EXECUTOR_KEY，不在owner MetaMask；豆包不需要新金库私钥。新资金直接官方Pool，不复用旧guardian Vault。
