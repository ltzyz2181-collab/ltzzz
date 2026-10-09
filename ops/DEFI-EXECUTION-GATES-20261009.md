# 新DeFi测试执行条件与阻塞登记

状态：blocked_missing_signing_channel，交易未执行；owner本轮明确个人授权准备等豆包恢复，不能因为等待就报已完成。

## A：使用LTZZZ现有运营资金做1USDC测试
这一步不需个人Aave的两笔授权，也不必等个人注资。资金已有本轮链上证据：block52362800，运营18.995USDC/0.010280265300552586ETH，Vault20.008254aUSDC/exposure20USDC。
执行条件：安全签名环境有运营钱包对应的签名Secret；网络Base8453；签名者、Vaultguardian、Pool/USDC/aUSDC与脚本断言一致；Vault未暂停/未否决；保留至少5USDC运营底线；新增敞口不超100USDC；无未对账历史提交交易。运行时重读余额和状态，不依赖旧快照。
具体阻塞：GitHub中缺LTZZZ_WALLET_PRIVATE_KEY。API模型Key不等于钱包签名Secret。代码scripts/defi-roundtrip.mjs和control-handover-verification工作流已提交；有Key后运行该workflow，执行1USDC approve/deposit/supply/withdraw/skim回运营账户并验证前后余额与原20USDC敞口恢复。无Key仅记录真实读链和阻塞。
责任：豆包恢复后通过既有安全持钥渠道接入/执行；若无持钥渠道仍回填blocked。可由其他已有授权安全签名执行席接替，不需要模型额度作为签署凭证。严禁向聊天/仓库传私钥。无tx_hash不能标完成。

## B：从个人Aave自动拨款到LTZZZ
与A独立。缺个人资金源公开地址/网络、经核实收款地址、专用执行账户配置和已部署拨款router；准备好后个人钱包签有限aUSDC approve和configure启用两笔链上交易。单笔100、UTC日200硬限额。owner表示个人签署准备等豆包恢复，记waiting_doubao_preparation；工程准备不替代个人钱包最终确认。
步骤在ops/OWNER-WALLET-SIGNING-20261009.md。当前router未部署，无签署目标，不能让owner提前授权占位地址。

## 结束条件
完成必须有每步真实tx_hash/status/block、前后USDC/aUSDC/exposure、gas成本、失败阶段或成功结论，并回填账本。本金变化/失败已提交交易先对账，禁止盲目重跑；资金损失可作为实验结果记录，但不放宽资金目标、上限和凭证要求。
