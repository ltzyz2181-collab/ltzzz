# 事实与方案：小额付款默认关闭实现（#268修订）

原任务 `PLAN-PATCHGATE-ESCROW-20261023`。单笔及收款人＋用途组滚动24h合计严格 <20 Base USDC；采用6位精度整数。日/周共享已登记预算，取登记限额、owner绝对上限、2×独立已核额度的最小值，缺失/过期即拒绝。2×只是额外天花板，不作新增授权，不复活旧20/60预算，不扩大已有0.05U雇佣或投资授权。

控制/经济主体、用途与地址须核实登记；同一operator、controller控制收款方、别名掩盖控制关系不得走豁免。新地址、新用途、额度和控制字段变化会改变policy摘要，旧批准立即失效；登记变更要双独立审计，新增收款地址沿独立登记权限处理（#268 R5）。这些事实本身仍需真实证据核验，不能仅填control_verified=true。

## R3：谁能批准与开关确认

`small-payment-authorization.mjs` 只做公钥验签，不生成生产密钥、不调用模型、不登记信任根、不写支付开关。必须同时收到：

1. 千问 `aliyun_dashscope` 与豆包 `volcengine_ark` 两个不同受信执行器，对**当前policy、release、完整authority摘要**的Ed25519签名。要求原生响应元数据、非空结构化approve、实际模型/request ID、finish_reason=stop、output SHA256、已登记源码与独立云部署绑定。公钥从部署端已审的固定登记取得，禁止请求者临时给一把公钥。已有A2的L0意见/角色不能复用成payment_policy_review。
2. 独立owner公钥对同一个subject、enabled=true和有效期的确认签名；owner钥不得与模型执行器共用。这里确认的是当前版本/政策启用范围，不是每笔<20U付款都再问owner。有效期由owner签下并受登记key寿命约束，不让AI自动延长。owner/latest要求仍是保持关闭，本轮没有此真实确认或登记。

千问/豆包的“原生响应签名”实际指：已登记云执行器在自己真实调用提供商并取得完整响应后签名。不是声称阿里/火山模型API自行提供密码学签名，也不是让模型生成签名字符串。现有云执行器尚未部署/注册此资金审核角色，所以本轮只是验签实现与合成测试，不能称真实两签到位。

Claude 共用GitHub账号的PR回读是**咨询审计**，不证明原生Anthropic身份、不计入密码学法定人数；配置approved[].verified或callback返回verified=true不能启动。验签后只产生同进程、不可序列化/伪造的opaque proof，确定性策略也校验该proof。没有真实登记、两签、owner确认就拒绝。

`config/small-payment-activation-authority.json` 为空且关闭；owner公钥、模型公钥、云部署/IAM证据未登记。部署宿主必须把authority锚定到已审主线和独立控制面，不允许AI通过同一请求换根、自签或改云IAM。代码签名验证不等于已证明管理员独立；真实密钥控制、信任根治理和部署验收仍属阻塞项。

## R2：状态机与故障闭环

先在跨worker串行事务持久预留、取得持久alarm确认，再给一次性30秒permit执行。相同ID同意图只对账；换意图冻结；不同ID的并发预留累计预算；未知结果跨天/周占额，不自动重付或按时间释放。

alarm和**每次预留事务**共用到期检查：已有receipt/audit超时立即持久写switch_enabled=false/frozen=true，不创建新预留。调度等待到期也在dispatch前再次检查。故定时器故障不能允许下一笔继续。存储无法落盘时准确返回freeze_persisted=false并本进程停付，不谎称已持久冻结。

实际提交哈希保留作对账，不等于paid。确认回执必须显式paid/status/金额/收款/用途/真实tx_hash与独立证据；不从false/null默认补造付款结果。同一交易不能认领两笔。延迟确认按新观测时窗占预算；后到的正常审计不能自行解冻。已广播交易不能被事后冻结撤回。

## R1/R4：资金出口范围

完整路径/守卫与两个旧脚本的实际生产证据见 `FINANCIAL-EXITS-20261027.md` 与唯一 `config/financial-exit-inventory.json`。旧凭据发现/付款/部署脚本退役，生产Market不消费资金私钥，旧广播、交易所POST和默认已付中继关闭，只读/对账保留。wallet-lib真实转账与signer factory均要求内部运行时能力。旧调度固定模拟，不下发钱包私钥。

外部客户自持钱包和已部署合约受外部/链上权限约束，本轮不声称它们被JS守卫全局冻结，也不称唯一出口。源码清单是变更检测器，不是任意程序沙箱。候选修改尚未部署到远端，未删除任何真实Secret。

## 保留的R6与上线阻塞

真实`verifySettlement`必须独立读Base链、USDC合约、转出/入地址、raw金额、成功和确认性；verifyAudit必须读独立提供商/执行器及精确receipt摘要；loadBudgetEvidence读受控原件；存储跨worker原子且重启持久；scheduleAudit需要持久云alarm回读。当前均是部署方接口，尚未接通/实装线上验收，不把布尔值自报当证明。原始密钥不能进GPT会话或通用runner。

owner/模型真实公钥、独立IAM、持久存储/alarm、钱包/结算/审计服务、线上故障探针及两家实际原生签名尚缺；Claude仍须复审。新policy和authority、支付开关及A2/A3/B保持关闭，没有真实付款、生产签名或新增付费cron。合成测试、PR CI、HTTP200均不等于生产支付验收。云publisher/checks设计另见 `PATCHGATE-CLOUD-PUBLISHER-AND-CHECKER-20261027.md`。
