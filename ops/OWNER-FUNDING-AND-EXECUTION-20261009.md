# 本轮实际执行方案 · 2026-10-09

Owner 当前会话授权：个人Aave约1000U；每月计划注入3000人民币；每次拨款≤100USDC、每日≤200USDC；AI实验亏损由owner承担；投资收益及XAI产品的真实外部订单收入用于LTZZZ运营。

## 实现
- `OwnerAaveFunding.sol` 新资金路由：仅Base8453；指定owner、USDC/aUSDC/Pool与固定LTZZZ treasury。初始paused；owner钱包对aUSDC做有限1000USDC allowance，再configure启用1000USDC grant。可撤销allowance、pause、换executor。owner私钥不交给AI。
- executor自动把owner aUSDC转给router，调用Pool.withdraw直接向treasury发送USDC。单次100、UTC自然日200为链上硬限制；重放intent拒绝，失败全部回滚。若仓位在其他网络或资产不是USDC，本实现不可直接使用，不自动桥接/换币。
- 每小时检查运营资金是否不足100USDC，仅补缺口；达到余额目标则不提款，不按cron盲目提款。每日200是总提款上限，归还本金不重置当日提款计数。
- `returnPrincipal` 从归还钱包真实转USDC回owner并减少借入本金，须归还钱包USDC授权；不声称投资收益已到账。收益与外部订单待真实receipt分类入账。owner自行`acceptLoss`确认已实现损失，不由AI伪造“本金归还”。未花掉本金可以归还；1000是初始可撤销拨款总授权，不是已核实余额。
- 每月3000人民币是owner注资计划；本代码不自动扣银行卡，不按猜测汇率换U，也不记未到账收入。owner追加USDC仓位后可补额度。
- 原Aave策略限额单笔20/总敞口100仍保留。新100/200是个人资金拨款限额，不擅自扩大投资策略风险预算。

## 部署与阻塞
`aave-owner-funding.yml` push触发编译+真实本地EVM测试，并在配置齐全时自动部署，部署后保持paused供owner钱包授权。每小时自动检查执行。需要公开配置vars FUNDING_OWNER（个人Aave钱包）、FUNDING_TREASURY（确认运营收款钱包）、可选FUNDING_ROUTER_ADDRESS，以及Secret FUNDING_EXECUTOR_KEY（专用低权限gas执行钱包）。现环境未持有这些配置；不复用有争议的旧私钥，不向owner索取私钥。缺项写blocked_configuration回执，不能称链上部署成功。
授权交易的from/to/chainId/calldata会写在部署回执，owner在钱包签两笔后无需每次签拨款。任何自动化都不能替owner凭空签初次授权。
所有实际拨款回执含tx_hash/block/amount/balance delta；网络不符、签名人不符、健康因子或流动性限制一律不广播/回滚。Aave官方：https://www.aave.com/docs/aave-v3/smart-contracts/pool （withdraw燃烧调用者aToken；转移与提款受协议健康因子检查）。

## 真正调用AI的任务分派
`ops/task-queue.json`为实际输入，`execute-task-queue.yml`push立即触发+每6h重试；调用现有官方API模块与GitHub Secrets。
- DeepSeek：资金合约/退出测试审查。
- 豆包：完整60秒视频脚本+发布链路补丁方案。
- XAI/Grok：WEP3真实支付/交付修复补丁方案。
输出`ops/runs/<task-id>.json`含真实provider状态、usage、input hash、attempt、GHA run；相同成功输入不重复收费，失败最多3次；length截断单独记录。没有AI执行代码权限，因此生成补丁是review_required，绝不记已部署。GPT接收回执后审核并自己应用部署；AI本身不会因为一张工单就自动拥有Cloudflare权限。

## 本轮验证
Solidity经0.8.30编译，并在Ganache8453运行：pause、身份、100/200硬限额、intent重放、提款失败回滚、本金真实归还、owner独占损失确认。队列mock验证三provider、真实状态分层、幂等。以上是本地测试，不是主网交易。
