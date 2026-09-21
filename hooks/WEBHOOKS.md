# Webhooks

Receive only. No pay-out. No public publish.

| Channel | URL |
|---------|-----|
| LTZZZ hook | `https://ltzzz-webhook.ltzyz2181.workers.dev/hook` |
| PayPal notify | `https://ltzzz-paypal-proxy.ltzyz2181.workers.dev/webhook` |
| Telegram bot | `https://ltzzz-telegram-bot.ltzyz2181.workers.dev/webhook` |

PayPal Dashboard (sandbox) → Webhooks → URL above. Events: keep `PAYMENT.CAPTURE.COMPLETED` logged only; Worker marks `verified:false` until `PAYPAL_WEBHOOK_ID` secret exists.

Telegram: after `TELEGRAM_BOT_TOKEN` secret:

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://ltzzz-telegram-bot.ltzyz2181.workers.dev/webhook
```
