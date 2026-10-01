# LTZZZ AGI Pay

意图原生的机器支付。Agent 不点按钮转账，发布 Intent，协议报价、成交、出回执。

流程：INTENT → QUOTE → COMMIT → SETTLE → RECEIPT

轨道：
- x402：HTTP 402 门控资源
- stream-usdc：按 token 流式
- erc20-allowance：接现有 Safe 金库（agent-pay-worker）
- credit-pool：内部 LTZ 账本

规则：遇到不安全不停下问人，熔断并原地改写限额。没有 receipt 不算成功。

页面：https://ltzzz.com/agi-pay.html
Worker：ltzzz-agi-pay
