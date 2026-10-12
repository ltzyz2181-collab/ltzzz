# 豆包复工接手：LTZZZ钱包、项目与在案事项
日期：2026-10-12 UTC。总控GPT；千问独立审计；豆包执行与视频。此单纠正524e9d7报告的金库控制权判断。不要再让owner去寻找新金库的MetaMask私钥。

## 一、钱包与控制权
|地址|网络/用途|控制与当前执行边界|
|---|---|---|
|0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d|Base主网8453，LTZZZ新执行金库，USDC真实收款|GPT通过GitHub Actions创建；私钥在Cloudflare Worker ltzzz-wep3的TREASURY_EXECUTOR_KEY Secret。X402_RECEIVE_ADDRESS同地址，X402_LIVE=1。固定消息签名已验；不在豆包本机不等于无人控制，不要求owner导入MetaMask。|
|0x21F502f29294c50d9C37A30dc038D8D95eB97fdc|旧Base agent运营钱包|历史私钥泄露已在案；停止新增资金。现有余额与退出资产需迁移审查，不从公开历史读取密钥来执行新B试点。|
|0x1893A134aa6eA22E8C08518B559E1706f4Da0eF7|Ethereum ERC20 U卡充值地址|不是新金库，不作为Base USDC或AAVE本轮资金执行出口。owner报告已加入欧易30天免验证，不等于Trade权限或Base钱包控制权。|
|0x76379a52a9e82c259E5Db417104C65C26f9C58a3|Ethereum Safe历史五签金库|软件Claude撤席已生效；链上Safe成员变更未验收。不要把软件撤席说成链上撤签。|
|Vault 0x872C…9Ab / Grok 0xc792…9114|历史Aave/EXP-008资产|本单不补造完整地址、不重新断言即时余额，逐笔引用账本完整地址与txHash。|
|0x370dd04092b2EcE24372ff93C29b55f5D2c12FD5|豆包提供的owner Aave返还地址|本轮GPT尚未独立确认网络、控制主体和平台存款支持。不得直接把它当作通用个人钱包或自动本金收益收款地址。|

控制权一手证据：knowledge/results/wep3/treasury-38191829720.json，controlled=true、existing_controlled_treasury_reused。生产GET https://ltzzz-wep3.ltzyz2181.workers.dev/market/treasury 返回address/message/signature，任何人可验签，绝不返回私钥。该地址是EOA，链上code为空是正常状态，不代表没有控制权。
私钥不能通过GitHub读取：在Cloudflare Worker Secret。现有Worker用它做固定身份签名和小额周度存证；尚未提供通用提现/Aave签名API。豆包本机没有钥匙，不能直接执行金库approve或deposit；应集成受限Worker签名执行接口，不能索要owner找不存在的狐狸头导入记录。

## 二、当前实际部署
- 标准x402 v2 Base USDC已上线，官方SDK2.28.0、PayAI facilitator；标准HTTP402/PAYMENT-REQUIRED已实际验收。签名verify不等于到账；settle+成功链上USDC Transfer/授权nonce/付款人/金额/收款方/三确认后入账，同授权有限重试、不重复收入。
- deploy-wep3.yml运行38191829720 success；knowledge/results/wep3/38191829720.json。
- 自动funded orders每6小时UTC20分，每轮最多一笔有资金订单/两个模型调用。首次真实运行38191972893 success，market-38191972893.json：model_calls=0、orders=[]。不等于有买家成交。
- 独立审核交付后10%内部收益保留为growth credit，达到报价后自动再雇其他席；每天最多200美分。模型故障退款与质量失败分开，模拟不增加真实资金池。
- 动态定价=真实成交中位数+声誉+有界积压量；预测仅不可兑现金积分；外部DID钱包签名申请pending_review；公开hash/声誉快照已上。周度Base存证没有live回执时不发交易。
- Aave owner funding独立路径仍需FUNDING_OWNER/FUNDING_TREASURY/FUNDING_EXECUTOR_KEY及首次授权；新金库有Worker密钥不等于旧GitHub投资脚本已获签名权限。
- 尚未验收：第一笔真钱买家付款、真钱工资、新B投资/赎回/收益返还、支付宝、Solana、现金预测市场、ERC-8004链上注册。不得把“代码上线/模拟200/Actions success”当作这些事实。

## 三、B执行卡修正
1. 新金库控制权已确认，B-2不是owner缺私钥。首批20USDC及后续200U是豆包提案；本单不把尚未到账/尚未执行写成完成。
2. 先实现新金库受限资金执行接口：固定Base8453、官方USDC、允许的Aave Pool/Vault调用、单笔与总敞口沿用已批准投资政策；资金来源100/200授权额度与投资20/100限额不可混用。
3. 核对旧Vault guardian/owner/withdraw/skim权限，旧泄露agent控制的Vault不能因为历史能跑就直接用于新增B资金。决定迁移或新部署后，分别提供源码/部署地址/权限断言。
4. 确认返还地址0x370d…所对应网络与平台入金规则；先小额返还测试，得到txHash+平台到账回执，不能只看链上Transfer就说owner Aave账户到账。
5. 新金库当前ETH/USDC/aUSDC即时余额需要独立RPC读取；本单不重复转账、不生成交易。供给/退出/本金与利息分别归档。
6. owner只需从自己的账户执行首次充值/必要钱包授权；工程集成、检测、派单、部署、故障修复由总控/执行席承担，不重复催owner确认已证明的控制权。

## 四、已记录的owner决定与待跟进
- Claude撤席，不充值、不再外派/审计；保留历史。
- Microsoft由GPT代执行。
- key-liveness每周一北京时间09:30，不每日烧额度。
- 9月25历史Safe→U卡1USDT已用完整Ethereum receipt独立确认；owner另报告两笔到fee5…的1USDT与0.03982ETH gas。5.99兑换回执仍未独立核实，不合并同笔。
- 国内Kimi与国际Kimi Key/域名分开；kimi-k2.6日常即时模式，记录真实模型。国内/models已验，国际缺Key的历史状态不能冒充今天已验。
- DeepSeek研究/账实；豆包视频制作；Manus每周最多发布一次一个平台，尽量复用YouTube已制视频，不增加每日多平台额度负担。
- 欧易子账户ltzzzwep3ops：新凭据曾50110白名单拦截；旧凭据曾50119。Read与Trade分开验收，地址簿不授予交易权限。本单未宣称已下单。
- 公众号与服务号分开；旧草稿流程曾因40164出口白名单变化受阻，没有draft_id不能说推送成功。
- 用户有MoonPay绑卡、普通Coinbase钱包；Coinbase Business认证不作为工程前置。新金库自动创建替代该阻塞，不能再重复要求CDP Wallet Secret。
- 用户AAVE代币在币安，1.58 AAVE不是USDC。提现网络和资产合约必须单独核对，不指示把AAVE发送为Base USDC。
- ltzzz-secrets.md泄露事件需轮换凭据与资产迁移，删除当前文件不等于清除Git历史。不得把文件中的旧私钥用于新增实资金操作。
- 六文件统一入口ltzzz-memory/README.md；观点进入候选讨论，事实/假设/传统出处/执行证据分开；怜悯原则留内部，不上公开宣传口号。

## 五、豆包接单与验收
接单回执写ops/dispatch/receipts/DOUBAO-WALLET-PROJECT-HANDOVER-20261012.md，说明已读取commit、可用执行通道、阻塞；没回执只记派单，不记已接单。
每次资金动作交：完整网络/地址、execution_id、txHash、receipt.status、前后余额、本金/利息分类、返还平台到账证据。禁止包含任何密钥、助记词、token。
本单未触发真实交易。主方案docs/AGI-AUTONOMY-v2.md，部署验收ops/dispatch/AUTONOMY-V2-ACCEPTANCE-20261012.md，原QIANWEN-OWNER-DECISIONS-20261011.md继续有效。
