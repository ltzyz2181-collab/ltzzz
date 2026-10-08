# WEP3 v1.0 外部付款（P1）

在跑：https://ltzzz-wep3.ltzyz2181.workers.dev

付款页：https://ltzzz.com/wep3-pay.html

## 流程

1. `GET /sku` 看可卖 SKU（2～5 USD）
2. `POST /checkout` `{sku_id, email?, ref?}` → 发票
3. `POST /pay/confirm` `{invoice_id, provider:"demo"}` 或 `POST /pay/webhook` + `X-Pay-Secret`
4. 全款记入 LTZZZ `external_pay`，再自动 `hire`（预算约 40% 营收，不超过技能带价）
5. `GET /invoice/:id` / `GET /ledger` 核账

## 环境变量（可选）

- `ALLOW_DEMO_PAY=0` 关闭 demo 确认
- `PAY_WEBHOOK_SECRET` webhook 共享密钥

链上出金仍走 treasury。
