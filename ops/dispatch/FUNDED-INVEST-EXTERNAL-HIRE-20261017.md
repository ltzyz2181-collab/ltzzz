# 四席位投资及外部 AI 真钱接单执行

Owner 本次已明确授权：安排 GPT、XAI/Grok、豆包、DeepSeek，按声誉领取预算，分别执行欧易交易所与 Web3 DeFi 投资；再购买一单外部 AI 服务，直接部署，不重复询问。本单不把先前审稿意见当作新的 owner 审批门槛。

## 固定范围与金额

唯一授权订单为 `OWNER-FUNDED-20261017-01`，机器真源 `policy/funded-owner-round-20261017.json`。同订单ID重跑仅恢复或对账，不产生下一轮预算；不新增真钱/付费模型 cron。

| 轨道 | 总预算 | 做什么 | 钱与身份 |
| --- | --- | --- | --- |
| Web3 DeFi | 最多20 Base USDC | 现有 WEP3 Aave V3 supply，协议每笔限额/敞口/现金负债优先 | 当前金库0x5df5…a32d托管；不代表各席位独立持钥，也不代表使用个人0xb99c…钱包 |
| 欧易 CEX | 最多20 USDT | BTC-USDT现金现货，IOC限价，相对最新卖一价最多50bps，另留50bps费用余量 | 只使用既有配置账号余额，不提现、不自动划转、不借贷、不杠杆 |
| 外部 AI 雇佣 | 一单最多0.05 Base USDC | agent402.tools nano推理，购买具体接口缺陷分析与回归规范 | `EXT-AI-20261017-001`，固定第三方收款地址，EIP-3009签名和原始支付凭据只留Worker私有DO |

四席位以线上 `/market/receipts/snapshot` 分数按比例分配，整数micro-unit守恒。缺失/非法声誉不回退到千问旧表。已读取的参考快照为豆包138、Grok113、DeepSeek105、GPT105，真正执行时会重新读并冻结本轮实际快照；这些数字不是已执行金额。未注册DID、未持钥不阻塞金库托管任务，但不能冒称独立钱包投资。

席位派单由总控固定规则执行，不自动购买四次原厂API调用，不冒充GPT/XAI/豆包/DeepSeek本体主动决策。外部购买记录提供商报告的实际模型及结束原因，原厂身份未经独立确认。内部积分不是本单资金，投资本金不是工资；现金、USDT成交和内部credit分别记账。

## 代码与执行

修复千问调用：预览改为带请求体的POST；实时限额读取顶层字段；不使用历史限额作为真钱执行兜底；所有DeFi收益资产仍归金库。CEX权限按owner本次一票授权补记章程，不扩大DeFi合约目标。

正常合并本轮策略文件后，`funded-invest-dispatch.yml`仅自动执行该固定订单一次。GitHub Actions消费既有Secrets；不会把私钥或OKX Secret复制进仓库、聊天或桌面配置。

本金执行前持久化预算和每个席位的 clOrdId。未知成交只查原单，不换ID重买；DeFi使用固定 intent_id，API响应不明确时保留原意图。外部订单在发送签名之前持久化nonce与金额，重跑不重新签一笔。公开paid=true要求链上USDC Transfer和AuthorizationUsed的付款人、收款人、金额、nonce一致；仅HTTP200不算付钱。

外部AI输出先做确定性的结构检查，属于工程候选交付；未经过独立模型复核前明确pending，不伪造Claude/GPT审核或测试已运行。失败费用、未知结算、缺失凭证均保留实际状态。

VS Code/本地入口（只使用已有安全环境，不在命令中放Key）：

```sh
# 默认只读；不安装、不重配原模型
node scripts/funded-invest-executor.mjs --venue all --agent all
# 本轮用户已授权；有可用既有凭证的执行器可按实际Asia/Shanghai日期设置ARM_ACK
# ARM_REAL_ORDERS=1 ARM_ACK=<实际协议日YYYY-MM-DD> node scripts/funded-invest-executor.mjs --venue all --agent all
```

CEX无trade权限、USDT不足、最小交易量不满足或IP仍被拒时，停止该轨，不把“已删除IP白名单”当成实测成功，也不从另一平台自动搬钱。原始端点503/401或未知成交保存为阻塞。个人Aave、旧Vault、Safe与钱包密钥均不涉及。

已有每日04:00 UTC任务保持dry-run巡检。GitHub hosted runner流程未配置VPN，不能代替大陆桌面的无VPN实测；本地仅提供可执行代码与明确回执。

未承诺收益；CEX自动止损/止盈定时尚未实现，本轮仅限定金额的现金建仓。Aave可用现有受限withdraw接口退出至同一金库。
