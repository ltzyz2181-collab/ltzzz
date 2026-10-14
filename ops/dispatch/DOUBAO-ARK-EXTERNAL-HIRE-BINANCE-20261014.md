# 豆包方舟任务：外部AI首单与币安资金归集
owner最新指令：改走币安，owner把币安AAVE兑换为USDC并与狐狸头55U归集，再充值LTZZZ；豆包优先使用火山方舟API，不消耗聊天额度进行长文分析。模型输出只形成方案，不自动操作owner账户或签钱包。
## 工程交付
结合docs/EXTERNAL-AI-USDC-PLAN.md、当前/market/catalog及已有源码，给出一个真实外部provider接入的最小改动清单：发现→固定报价→接单→实际交付→独立核验→真实USDC付款回执。内部豆包API交付不等于外部独立承包商接单；未得到外部job_id/签名认领/交付证据前，外部接单状态必须pending。先选公开API契约审计或带来源简报等可核验任务，暂不委托外部AI自由投资或花费owner账户余额。首单预算待具体provider报价确认，不在模型报告中声称已经付款。
## 资金操作卡（owner人工确认）
1. 币安本人账户打开充值→USDT→Ethereum/ERC20，复制当时页面的充值地址；网络未开放则记录阻塞，不猜地址。
2. 狐狸头55U若是Ethereum USDT，发送到上述币安充值地址，网络Ethereum，保留足够ETH手续费；查询币安到账。
3. owner在币安把计划投入的AAVE和收到的USDT兑换成USDC；币名USDC，不是“UCDC”。兑换手续费/实际数量以页面为准。
4. 币安提现USDC，网络必须明确选Base；收款0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d。先小额且不低于平台最低提现额，到账实核后再转余款。Base不可选/暂停时不要选Ethereum/BEP20替代。
5. 记充值/兑换/提现实际金额、手续费、链、txHash；owner注资单列，不作为外部销售收入。不要为重试而重复提现。
## 使用通道
方舟Key仅GitHub Secrets.DOUBAO_API_KEY或ARK_API_KEY；复用scripts/call-doubao.mjs，真实pro模型优先已验证routing。API调用结果写knowledge/results/ark-dispatch/，不要求owner重发Key。浏览器/钱包执行仍由已授权交互端协助owner签署，模型API不能替代支付签名。
