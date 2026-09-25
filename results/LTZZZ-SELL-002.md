# LTZZZ-SELL-002

## 漏斗

Landing (`index.html`) → Product (`products.html`) → Checkout (`checkout.html`) → Payment adapter (`ltzzz-sell-order`) → Order (KV) → Digital Delivery → Ledger → Memory

## 支付轨诚实状态

| 轨 | 状态 |
|----|------|
| PayPal | **stub** secrets 已配；webhook **未验签** → 不自动发货 |
| U卡/BiyaPay | **dry-run adapter** |
| Crypto USDT | 队列/人工 Tx 确认；主网自动仍需 ETH gas + Safe Module |
| 人民币人工 | **可成交**：确认后 `/pay/confirm` 交付 |

## 自动转账

Agent Treasury / agent-pay：`DRY_RUN` 测试网路径已开；主网自动转账等 Safe 有 ETH。

## URL

- https://ltzzz.com/products.html
- https://ltzzz.com/checkout.html?product=ai-template-pack
- https://ltzzz-sell-order.ltzyz2181.workers.dev/health
