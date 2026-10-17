# 外部 AI 真钱订单：独立交付复核

复核者：Codex 总控（本会话）；不是外部供应商自审，也不是国内模型冒充 Claude/GPT。复核对象为固定订单 `EXT-AI-20261017-001`，供应商 `agent402.tools`，请求/回报模型均 `deepseek/deepseek-chat`（模型身份仅供应商声明，未核实原厂调用）。

证据：`knowledge/results/funded-invest/run-39005099000-attempt-1.json`。
交付 SHA256：`bd118fc23371a9d8842fd1bba729b5609eeafacb99a40b18421e1bb8ff775b7c`。
候选付款哈希：`0x91e3941245fef223be3e1c2d726de6ef4fb730458861e0210cdbfed7b507d925`。本审核执行时独立链上付款核验仍未完成；候选哈希和HTTP200均不单独证明已付款。

## 裁决：交付不通过，不重复采购

供应商正确指出两个已给定契约中的集成缺陷：preview应POST且带JSON，额度在status顶层。提示已提供契约，这不构成独立原创设计。

但其 `preview_ok` 正对照示例不可执行为200：

- `intent_id: test123` 太短，不满足16—100位格式。
- `action: deposit` 不是允许的 `supply` 或 `withdraw`。
- `amount_usdc: 1000` 是数字；协议要求十进制字符串，且该金额也超出本轮额度。
- `issues[].id` 使用数字，违反所请求字符串字段。固定结构验收已返回 `delivery_accepted:false`。

总控使用当前 `buildAavePlan` 对前三项各做一次单变量反例：其余字段修正后分别保留短ID、错误action、数字金额，三项都按预期拒绝；使用合法长ID、`supply`、`'1'` 的对照通过规划。整个复核没有访问网络、签名或执行测试转账。

这份输出可以保留作为问题说明，不能充当可直接部署的回归测试。其wrong-auth例子使用Authorization而非本服务的X-Lab-Pin，也未证明正确凭证通路；没有把它说成已运行测试。

付款是否真实发生，另以成功USDC Transfer及对应AuthorizationUsed nonce核验；一旦证明扣款，应记录为“已付款、交付拒收”，不能把交付失败改写成未花钱。订单已持久化，不因拒收而再次签发付款授权或重复模型请求。本次原厂OpenAI/Anthropic调用为0，没有增加付费模型定时。

## 后续付款核验（2026-10-17 23:41 UTC 回读）

后续认证只读回执 `knowledge/results/funded-invest/inspection-39079995909-attempt-1.json` 已返回 `payment_proof.verified=true`：同一付款哈希、Base区块52712247、receipt_status=1。Worker已核对USDC Transfer及AuthorizationUsed nonce。订单最终状态是 **paid_delivery_rejected**，实际支出0.003USDC，交付仍未验收；原文的“付款核验未完成”保留为当时状态，不能当成当前未扣款。

本轮恢复只读取该原订单，没有重新购买、重新签发付款或使用新的支付nonce；未取得退款证据。此支出是外部模型服务采购，不是内部积分结算，也不是项目销售收入。
