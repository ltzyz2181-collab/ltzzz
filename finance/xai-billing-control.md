# XAI / Grok 费用控制

## 当前核验结论
本仓库和当前连接不能读取用户 xAI Console 的团队账单明细，因此不能把“昨天扣款”具体归因到某个模型/服务而不经过真实账单数据。

xAI 官方 Usage Explorer 可以按日期、API key、model、billing item 查看实际消耗；Inference API 每次响应也会返回 `usage.cost_in_usd_ticks`，可以记录单次真实成本。

## 自动扣款
xAI 官方 Billing 页面说明：
- Prepaid credits 从余额扣除。
- Auto top-up 会在余额低于阈值时自动购买 credits，可随时关闭。
- Monthly invoiced billing 的默认 spending limit 为 0；保持为 0 时，余额耗尽后 API 请求会被拒绝，不进入 postpaid。

LTZZZ 原则：
1. 关闭 Auto top-up。
2. Monthly postpaid spending limit 保持 0，除非用户明确确认改变。
3. 充值必须由用户确认；AI 不得自行充值。
4. 每次 Grok API 请求尽可能记录 `cost_in_usd_ticks` 到 Result/Finance Ledger。
5. 余额不足时优先降级到 dry-run / 等人工，不自动扣卡。

## 人工核对入口
xAI Console → Billing → API spend management / Usage Explorer / Invoices。

## 进一步自动化
如果未来要让 LTZZZ 自己读取团队账单，可配置独立的 xAI Management API Key。它与普通 xAI API Key 分离，且必须有相应的 Management 权限。不要把 Management Key 放进 Git 仓库。
