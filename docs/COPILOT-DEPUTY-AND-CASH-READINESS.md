# 桌面接力、千问代总控与真钱采购

## 能联系谁

桌面 Copilot 可以把任务送到 LTZZZ 云端总控/千问岗位，前提是桌面客户端能使用终端或 GitHub 工具、登录的账号有仓库权限，并能访问 GitHub。它不会把消息送给停用的 ChatGPT 对话；Copilot 也不是 VPN 替代品。电脑关机或 Copilot 停用后，既有 Actions/Worker 仍依赖自身额度和供应商网络运行。

部署入口：[接力工单](https://github.com/ltzyz2181-collab/ltzzz/issues/new?template=control-relay.yml)。仅 owner 新建工单会执行，默认零模型。豆包/千问客户端如果没有 GitHub 写工具，不能仅凭一段对话自动接通。

VS Code Copilot Agent 在仓库内读取 `.github/copilot-instructions.md`。已装 Node.js、GitHub CLI 且已登录后可执行：

```sh
node scripts/ltzzz-relay.mjs submit qianwen_inspect work/relay-task.txt
node scripts/ltzzz-relay.mjs status 具体工单号
```

也可在 Copilot 输入 `/ltzzz-relay`，或在 VS Code“终端 → 运行任务”选择“LTZZZ：总控派单给千问只读核验”。工程任务须先由 Copilot 写入 `work/relay-task.txt`，再选择对应任务。仓库包含这些配置，不代表已经复制到 owner 本机；本机需拉取最新仓库并登录 GitHub。

`qianwen_inspect` 实际走 GPT 角色认证派单 → 千问角色认证执行固定只读检查 → 验证远端派单已消费 → 保存证据 hash 和 Issue 回复。两个角色是 CI 执行器凭据，不是两个模型或独立审计者；结果保留待审核。`dispatch` 只派任意工程任务，等待实际外部接单；不运行任务文字中的 shell。暂停、过期传感器和未知响应均留阻塞，重复工单运行不会重做远端动作。

本轮不接管 owner 电脑；没有桌面连接证据就不写“桌面安装完成”。没有新增付费 cron、没有调用 OpenAI/Anthropic/千问原厂 API。

## 欧易 Web3 钱包怎样配合

欧易交易所 API 的 IP 白名单，与手机欧易 Web3 自托管钱包是两套权限。解除交易所白名单不等于授权钱包签名，API `trade` 也不等于有提现/链上签名能力。公开地址与网络足够做余额、gas、持仓及协议检查；私钥、助记词、验证码不需要交给 AI。

准备好公开钱包地址、网络、资产和试验金额后，先核验余额。投资研究可比较 Aave 单资产存款、保持现金、以及更复杂策略的成本和损失场景；APY 随市场变化，不保证本金或可随时退出。涉及跨链、换币或授权时分别展示目标链、合约、金额、费用、授权额度和退出方法。由 owner 选择具体方案并在欧易钱包确认签名；本轮接力器不签名或广播投资交易，不给各模型分发投资私钥。

Base USDC 与交易所买到的 AAVE 代币不同。不要把其他链或其他资产按 Base USDC 转入。LTZZZ 金库余额、个人欧易钱包余额和旧 Vault 权限也必须分列；旧 Vault 不收新钱，公开余额为零不能证明权限已撤销，更不能单凭 guardian 地址匹配断言私钥泄露。

本次 owner 已提供地址 `0xb99c6751f443842f4987bb2017580405572df905`、Base USDC、50U 候选金额，保存在公开只读配置 `config/owner-web3-readonly.json`。`owner-web3-readonly.yml` 固定链与官方 USDC/Aave 地址，至少两条 RPC 同一区块核验余额、gas、授权和合约存在；生成精确金额 approve/supply 候选 calldata，不估算收益、不签名、不广播、不更改旧投资上限。候选交易没有通过 gas/流动性模拟，不能把余额检查当作可执行投资已验收。

## 总控有没有外部 AI 真钱雇佣规划

有：[专项方案](EXTERNAL-AI-USDC-PLAN.md)、[P0 工单](../ops/dispatch/EXTERNAL-AI-USDC-P0.md)。线上已能接 Base USDC 买方付款并由内部模型履约；外部承包商目前只有申请入口，`cash_payouts=false`。内部 credit 不可兑现金，也没有自动退款完成的证明。

本轮增加固定外部供应商 Agent402 的 nano AI 服务免费 402 报价验收，不用内部豆包调用冒充外采。路径 `GET https://agent402.tools/v1/nano/chat/completions`；网络、原生 USDC、已知收款地址、整数金额与 exact scheme 逐项检查，拒绝跳转，不上传六文件/客户资料。页面标价不是实际成交价。0.05 USDC 只是候选报价筛选上限，不构成购买授权或新的自动支出预算。报价符合条件仍标 `quote_verified_not_purchased`，不虚构交付和付款。

落地顺序：

1. 核验外部服务控制方、真实 AI 样本、冻结报价和失败处理条款。供应商自己的承诺不能代替独立验收。
2. 从已确认可用 USDC 单独占用一笔订单预算，留足退款/履约负债；不动投资本金、不兑换旧积分。
3. 实装受限服务采购执行器：固定 endpoint/链/资产/收款方/金额，签名前记录订单和 nonce，未知请求只核对原记录；不同实际供应商独立审核交付。
4. 核对链上支付、交付 hash、独立审核和订单根回执齐全后记真钱采购完成。失败、退款待处理和未知交易单列，不能靠重试双付。
5. 有真实外部客户的收入才单列外部营收；owner 试买和供应商采购本身不算赚钱。优先用已资助订单触发采购，不新增空转付费 cron。

当前缺口不是“给每个 AI 一把真钱钥匙”，而是订单资金占用、受限出款、失败/退款对账及一笔端到端交付验收。这个缺口尚未完成，不能用免费报价验收代替。
