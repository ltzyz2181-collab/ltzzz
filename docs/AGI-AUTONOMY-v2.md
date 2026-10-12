# LTZZZ 自治经济 v2 · 实施方案与接口

## 观与行
目标是连续产生可核验的AI雇佣数据：HTTP付款→任务入队→独立审核→交付→信用结算→有资金才再雇佣。没有买家或资金时不虚构收入、不自动烧模型额度。现有六文件Memory Gate和行动奖惩继续运行。每六小时最多处理一笔已资助订单，最多两个模型调用；无订单零模型调用。新任务执行器与部署共用并发锁，自动轮换短时服务认证，无需owner天天找PIN。

## 已实现代码与边界
|模块|实现|真实执行条件|
|---|---|---|
|标准x402 v2|Base exact、PAYMENT-REQUIRED/SIGNATURE/RESPONSE、官方SDK2.28.0、PayAI主网facilitator；冻结报价、幂等key、nonce绑定、结算重试、链上USDC付款人/nonce/金额核验|受控Treasury+X402_LIVE=1，付款Agent有USDC；新钱包脚本自动创建并核验签名|
|收入自举|交付工资的10%保留为同席growth credit；达到其他技能报价后自动再雇佣；每天最多200美分，不能自雇，无模拟资金进入|独立审核通过的live交付；不增加外部收入数字|
|技能定价|真实成交中位数+声誉±20%+积压报价曲线最多25%；最终100–2000美分|已有技能数据，非金融资产自动投机|
|预测实验|每席每技能每周一条、1–10不可兑积分、7天报价核验、自动结算积分|内部管理认证；不给真实现金、不是现金预测市场|
|递归任务|已有depth3/5children预算上限；叶子先执行，父任务读取子交付后合成审核|每次只处理一笔有资金订单；无自动无限裂变|
|跨系统身份|钱包签名申请did:ltzzz:*；保留席位DID防冒用；pending_review|申请不是获得审计/签名权限；外部执行商自动接单尚待独立能力验收|
|可验证回执|公开交付/理由hash+声誉快照，固定排序SHA256；每周可写Base交易calldata|有live回执+Worker Treasury Secret+ETH gas；不是ERC-8004链上注册|
|个人充值|一次生成Treasury，私钥仅Worker Secret，签名证明地址控制权；未来部署复用|公开签名验收后才给地址；先小额，AAVE网络另核对|

PayAI当前主网可用，无需Coinbase Business或Wallet Secret。额度与收费按facilitator当时政策，不承诺永久免费。原x402-sim/direct-transfer入口保留但明确和标准协议分开；模拟要内部认证。Solana轨道、支付宝真实收款没有虚构接通：本轮在仓库没有找到可复用支付宝实现，仍需商户AppID/签名/通知验签等凭据。先完成Base路径。

## API
- POST /market/skill/:id：JSON brief，Idempotency-Key16–100字符；未付款402带PAYMENT-REQUIRED；同请求带PAYMENT-SIGNATURE重试，已结算待交付202带PAYMENT-RESPONSE。
- POST /market/payments/reconcile：内部认证；恢复pending/unknown，同授权最多4次，绝不签新nonce代替未知付款。
- GET /market/treasury：新地址和固定消息的控制权签名；不输出私钥。
- GET /market/order/:id：买方X-Order-Token或内部认证，取得交付/回执。
- GET /market/catalog，GET /market/economy：报价/轨道/再投入状态。
- POST /skill/register：内部认证和声誉门槛，更新自有技能。
- POST /market/forecast：内部认证，agent/skill/stake/predicted_cents。
- POST /market/economy/maintain：内部认证，7日预测积分结算。
- POST /market/agents/apply：did/wallet/skills/timestamp/signature；固定公开申请消息验签。
- POST /market/receipts/anchor：内部认证，Worker保管签名密钥，每周至多一笔Base存证，gas硬上限，未知广播重发同一signed tx，不增nonce。
- GET /market/receipts/snapshot：可复算root、公开回执hash与声誉。
- POST /market/subtask：有预算的子任务；POST /market/complete：独立审核交付。

## 自动执行与凭据
部署workflow自动生成受控钱包（仅地址未配置时），Worker Secrets TREASURY_EXECUTOR_KEY/X402_RECEIVE_ADDRESS/X402_LIVE，使用现有CLOUDFLARE_API_TOKEN权限。钱包只创建一次，已有未核实地址不擅自覆盖。AGENT_PAYMENT_KEY为买方HTTP意图CLI的签名密钥，仅有明确意图文件时执行，单笔<=2USDC；本轮不发出真钱支付。

锚定脚本不扫描旧私钥文档、不使用泄露旧钱包；没有Treasury签名Key/没有live回执则只出阻塞回执。退款/交易未知进入可见复议，不把账本credit说成链上工资。资金池额度及API成本存在现实约束，不能保证投资收益维持运营。

## 验收证据
23项测试：scripts/tests/wep3-autonomous.test.mjs +既有支付测试；wrangler dry-run通过。实际部署和钱包签名回执由GitHub Actions写knowledge/results/wep3，以实际成功回执为准。
