# 固定子钱包存款与 Swarm 修复交接

本工单只适用于 ltzyz2181-collab/ltzzz。时区说明：文件名沿用项目北京时间轮次；执行回执保留 UTC 时间。

## 本轮实现

原轮 OWNER-FUNDED-20261017-01 的三笔 Aave 存款 15.503212 USDC 保持原回执，不重投。剩余 DeepSeek 4.496788 USDC 使用原 intent INV-fe28aa6c968aaa540cba74b1b4f158e4f436d9e3，由金库调用 Aave V3 Base supply，onBehalfOf 固定为 owner 指定的 0xbc24b9a2d0c61705602257565d8c0064effe253e。初始存款由金库付 gas 并签名，子钱包无需持有初始 USDC 或 ETH；后续提款仍需子钱包自身控制权。

子持仓单独记本金，不能增加金库权益或可提款额。原三笔精确记录、原轮 20 USDC 合计、零 Aave 债务、现金保留、资金敞口、nonce 与 gas 上限均需检查。成功需要两个固定 RPC 对同一交易官方 Supply 与 aUSDC mint 日志一致确认。未知结果只允许原 intent、原签名字节恢复，不能重签替代单。没有任何私钥导出到 Actions 或本机。

XAI 的 8bf5cdc 恢复了入口，保留了现有 market/Aave 模块；对应 WEP3 部署运行 39083579566 成功。但新 openSwarm 先 draw 总预算、再让每个 openIntent draw 子预算，会双扣；旧 KV 多步写也无原子性和幂等。修复将 /swarm/hire 改为明确的无扣账预览，整数 micro 切片精确守恒，0/重复/未知技能拒绝；execute/arm 请求明确 409。它尚未接单、调用模型、结算或付款。/agents/roles 只是岗位登记，不证明 Claude/Meya 原厂已启用。

## VS Code / Copilot 可直接粘贴的接手指令

只在 ltzyz2181-collab/ltzzz 工作。先查看 git status 与远端差异，保留所有未提交改动；创建独立工作目录，不覆盖整份 wep3-worker.js，不提交 RECOVER_FROM_LOCAL 等占位符，不强推 main。读取本工单及最新部署回执，复用现有代码，不粘贴或读取 .env、私钥或密钥配置。运行 node --check wep3-worker.js 与本次 PR 的聚焦测试。Swarm 当前只规划，不扣内部积分；后续真实执行须使用同一个串行 DO 的原子 book，稳定幂等 key+请求 hash，一次预留总预算并同时创建全部子任务，再接 claim→异提供商审核→交付验收，100次重试和并发/存储失败不得双扣。内部积分不可视为 USDC。不要新增资金预算或模型定时任务，不重跑旧订单。完成测试后创建 PR，报告真实测试、部署和链上回执；不能把草稿或绿色工作流直接当成实际交付。

## 上线口径

代码或本地 mock 通过不代表链上存款成功。部署后须核对 aave-guard-v9、原 DO 财务历史保留、原三个 intent 未变，再读取唯一子 intent 和双 RPC 的子钱包 aUSDC/债务。若 RPC 不可达，记录具体错误与 paid=false/tx_hash=null，不能声称资金到达。原交易所四笔已成交订单和已付但验收拒绝的外部 AI 单不重复执行。
