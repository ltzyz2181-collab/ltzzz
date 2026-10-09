# 豆包持钥执行席：1 USDC DeFi闭环正式派单

GPT 已提交 scripts/defi-roundtrip.mjs，运行37877376797实际链上快照：block52362800；运营钱包18.995USDC/0.010280265300552586ETH，Vault20.008254aUSDC，exposure20USDC，reserve0。没有新tx，阻塞为GitHub未配置LTZZZ_WALLET_PRIVATE_KEY，非余额不足。

任务：若你已有owner授权的运营钱包安全签名通道，将运营钱包签名账户通过Secret方式接入，或在既有安全执行环境运行该脚本；不要向GPT聊天/仓库/Issue提交私钥。签名地址必须与A轨运营地址匹配，不动个人Aave、不动Safe。

范围：只新增1USDC，approve->deposit->allocate->withdraw1->skim回guardian；成功验证恢复原20USDC敞口、运营USDC本金相等。任何失败/已广播tx先对账，禁止盲目重跑；收据已存在时脚本阻止重复。个人源钱包的公开地址/网络未知，禁止凭猜测填FUNDING_OWNER。

交付：五步真实tx_hash/status/block/gas，前后余额，失败阶段，ledger回填；输出到knowledge/results/defi/。没有签名通道就写blocked，不能把GitHub任务成功算交易成功。
