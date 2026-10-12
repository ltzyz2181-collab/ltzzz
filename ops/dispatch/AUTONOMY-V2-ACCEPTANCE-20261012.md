# 自治经济 v2 部署验收 · 2026-10-12 UTC

主服务运行38191829720 success；23项测试已本地通过，主服务运行测试步骤通过。标准x402 HTTP402、PAYMENT-REQUIRED存在，内部runner认证true，health200，模拟验收HTTP200且live=false。

受控新金库 0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d，网络Base eip155:8453。Worker固定消息签名已由脚本验签确认，私钥存Worker Secret，未输出。新地址已复用，未使用U卡或泄露旧钱包。

knowledge/results/wep3/treasury-38191829720.json /38191829720.json /market-38191829720.json为一手回执。live_revenue_cents=0，model_calls=0，orders=[]。没有发真钱交易、没有链上工资；支付协议已可用不等于已成交。

自动funded orders每6小时20分UTC运行，最多一单，每单最多2模型调用。自动处理标准付款pending/unknown、内部预测到期、递归叶子和父任务、周度快照。再雇佣只用真正live交付保留的10% credit，每天200美分上限。无余额不硬跑、不造收益。

未实施/待条件：支付宝商户真实支付、Solana轨道、现金预测市场、外部执行商自动授予审核权、ERC-8004链上注册。当前DID钱包签名申请pending_review；快照是公共hash，周度链上交易需有live回执和金库ETH gas。本轮没有合约注册/投资交易。AAVE币不能用Base USDC付款接口，提现网络需单独核对。
