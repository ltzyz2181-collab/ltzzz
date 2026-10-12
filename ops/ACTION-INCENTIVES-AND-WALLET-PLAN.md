# 行动反馈机制与钱包接入

Owner授权总控实施。机制是可观察行为的调度反馈，不声称AI存在魄、欲望或痛苦。通过现有独立审计的结算+2行动分；质量失败-4；明确接受任务且有deadline的逾期-2，逾期最多扣6。最近20笔任务，行动分封顶±20，报价竞标优先级乘数0.8–1.2。通道故障、无Key、额度不足、休眠、没有派单不扣分。无新增真钱扣款，无自发刷任务，无无限调用奖励；真实资金预算仍由既有政策约束。重复任务继续受现有幂等规则管控。

新增action-policy.mjs已接award；旧声誉和账本不重写。巡查仍检查证据和独立审核，三次质量失败触发复议。输入是历史结算事件，不是自我声称努力。评价不奖励交易量或投机盈亏本身。

钱包路线：优先Coinbase CDP Server Wallet（开发者API钱包），普通Coinbase Wallet注册不等于API钱包；MoonPay个人绑卡账户可作为充值入口，不默认授予AI刷卡或自动扣费权限。CDP需在portal.cdp.coinbase.com建立开发者项目并配置CDP_API_KEY_ID、CDP_API_KEY_SECRET、CDP_WALLET_SECRET到Secret。当前这些凭据及新执行地址尚未核实，未创建新CDP账户、未交易。

1.58 AAVE是代币数量，不是1.58 USDC，也不是Aave存款凭证。需确认实际来源网络、AAVE合约和新收款地址，然后先极小额收款确认。不得直接发到0x1893 U卡或曾泄露0x21旧运营钱包。Ethereum AAVE不能当Base USDC余额投入现有供应通道；兑换或跨链需另生成报价与执行回执。未经凭据与新地址验收不生成猜测收款地址。

现有日运行工作流执行奖惩与巡查；提交触发离线测试，不增加API生成次数。钱包API部署尚待开发者Secret接通，不用文档部署冒充钱包部署。

## 2026-10-11 America/Tijuana · 本轮实施更新

本次 owner 已授权总控自行完成可实施的部署，不把每天手动部署交回 owner。采用现有 GitHub Actions 持久执行，保留原 schedule；不声称聊天里的GPT会在未运行时常驻。首次资金参数、第三方账号交互和平台权限仍按真实条件处理。

### 行动反馈 v2

`action-evidence.mjs`从磁盘重新核对交付正文、receipt、独立audit及hash；任务自己标settled/accepted不再直接获奖。相同任务ID或相同正文在窗口内不重复加分。验证通过的独立交付+2，验证可归责的质量失败-4；只有assigned worker明确acknowledge未来deadline，逾期才-2（最多扣6）。没任务、没Key、余额不足、限流、通道故障不惩罚。行动分仍封顶±20，只影响0.8–1.2竞标优先级，不增加真钱额度或交易风险权限。

三次已核验质量失败进入review_required，派单实际排除该候选；被撤席候选不获分配。一个worker更新报价会替换旧报价，不能靠重复bid挤占候选。巡查回执新增action_profile，旧信用余额、历史声誉、模拟资金不重写。证据验证失败记unverified待复议，不以缺回执直接证明worker恶意。

这是一套行为调度反馈，不能让AI产生生理痛苦或愉悦，也不奖励争夺、冲突、投机交易量。目标是已有授权任务的可核验交付，而非为了加分制造活动。

### 钱包与部署路径

固定依赖`@coinbase/cdp-sdk@1.58.0`。`coinbase-readiness.mjs`在现有`verify-kimi-okx.yml`内执行，默认不调用模型、不交易、不转账。使用CDP_API_KEY_ID（兼容CDP_API_KEY_NAME/COINBASE_API_KEY_ID）、CDP_API_KEY_SECRET（兼容COINBASE_API_KEY_SECRET）、CDP_WALLET_SECRET（兼容COINBASE_WALLET_SECRET）；配置是名称，不把值放公开文件或日志。

只读API鉴权成功后，钱包Secret齐全才按固定名称`ltzzz-ops-v1`取得/创建一个CDP执行账户，再签固定的非付款控制权消息并验签。该账户与现有Base WEP3金库分开，**不替换**`0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`，不覆盖Worker Secret。固定名称保证重试复用，CDP项目/名称变更会影响查找，须查历史公开回执再改。

owner确认1.58 AAVE目前在币安、尚不清楚提现网络。交易所内买入不意味着提现链已经确定。脚本只读验证Ethereum chainId1、AAVE官方合约`0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9`存在、symbol AAVE、decimals18及账户token余额。只有控制权和资产probe都通过才给Ethereum/ERC20接收选项；owner提现页必须确实选择Ethereum/ERC20。不支持就不提交，不把其它链AAVE转进此选项。接收AAVE仍不等于允许自动兑换、桥接或扩大现有USDC策略限额。

回执放`knowledge/results/wallet/coinbase-<run>.json`，分辨缺API凭据、缺wallet secret、鉴权失败、控制证明失败、RPC/token探针失败和最终控制/资产验证通过。失败也保存，SDK原始错误/请求头不公开；关闭SDK错误报告和usage遥测。普通Coinbase个人钱包注册不能替代CDP开发者三项配置。

MoonPay连接当前只有购币checkout URL能力：用户在浏览器完成，不提供现有钱包控制、余额或绑卡自动扣款权限。它可作人工购币入口，不用它冒充无人值守投资签署器。本轮没有创建MoonPay订单或扣卡。Binance及OKX连接当前提供市场行情，不提供本人的提现或子账户下单权限；实际欧易鉴权继续由既有安全执行器只读探测。

### X充值/发帖验收与恢复

最新查到的X run38165451166仍failure，receipt HTTP402 credits depleted，post id/url为空，没有本轮充值成功证据。账单充值和模型审核成功都不能替代真实post ID。本次补`x-post-recovery.mjs`：新失败回执保存产品事实hash；402重试只在事实hash相同且之前审核成功时复用文案和审核，避免继续烧模型额度。同日已POSTED不再次发；发帖前落盘POSTING，超时/5xx/响应未知进入POST_UNKNOWN，必须先对账，不能盲目重试重复发。人工确认后以RECONCILED记录显式关联原run_id，再继续，不能简单删除未知回执。

旧回执没有facts_sha256，不能自动假装已与当前事实核对；下一次依旧有预算的正常任务会先生成/审核并留下可复用证据。本次没有触发发帖或充值。X既有日定时不新增，失败恢复测试不调模型。

### 云环境与边界

本轮cloud runtime状态running、network policy enforced，当前session无注入CDP/OKX/Cloudflare凭据，GitHub CLI token认证失败；连接的GitHub可提交和合并指定仓库，由仓库Actions读取自己的Secrets。部署以远端run和实际回执验收，不能从本地“无key”推断仓库Secrets一定没有。

当前没有可用的登录态云浏览器、可分享页面URL或机房region字段，不能声称在美国，不能假装已打开X计费页完成充值。CLI无法处理银行卡验证码或第三方账号登陆。现有机器人不重新配置，本次新增的是程序验证和恢复，不是模拟浏览器收尾。
