# LTZZZ 资金工具链部署指南

---

## 📦 已完成的代码

### 1. 收支账本 Worker（ltzzz-ledger-worker.js）
- 入账记录（income）
- 出账记录（expense）
- 余额查询（balance）
- 收支记录查询（records）
- 20U 测试流程（test/20u）

---

## 🔧 你需要手动做的 3 步

### 第一步：创建 KV 命名空间

1. 打开 Cloudflare Dashboard → Workers & Pages → KV
2. 点「Create a namespace」
3. 名字填：`LTZZZ_LEDGER_KV`
4. 创建后复制它的 ID

---

### 第二步：配置 PayPal Webhook

1. 打开 https://developer.paypal.com/dashboard/applications/sandbox
2. 找到你的 App → 点进去
3. 左边菜单点「Webhooks」
4. 点「Add Webhook」
5. Webhook URL 填：
   ```
   https://ltzzz-webhook.ltzyz2181.workers.dev/paypal
   ```
6. Event types 全选（至少选：
   - PAYMENT.CAPTURE.COMPLETED
   - PAYMENT.CAPTURE.DENIED
   - PAYMENT.CAPTURE.REFUNDED
   - PAYMENT.PAYMENT.CREATED
   - CHECKOUT.ORDER.APPROVED
   )
7. 保存

---

### 第三步：配置 Telegram Webhook

等你给我 Telegram Bot Token 后，我执行：
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://ltzzz-telegram-bot.ltzyz2181.workers.dev/webhook"
```

---

## 💳 PayPal 解绑银行卡步骤

### 你手动在 PayPal 网站操作：

1. 登录 https://www.paypal.com
2. 点右上角 Settings（齿轮）
3. 左边菜单点「Wallet」
4. 找到你要解绑的银行卡
5. 点进去 → 点「Remove card」
6. 确认移除

**只保留 U 卡（Biyapay）**

---

## 🚀 部署步骤（你创建完 KV 后告诉我）

我会执行：
```bash
# 1. 把 KV ID 填进 wrangler.ledger.toml
# 2. 配置 Secret
npx wrangler secret put LTZZZ_AGENT_TOKEN -c wrangler.ledger.toml
npx wrangler secret put USDT_WALLET_ADDRESS -c wrangler.ledger.toml

# 3. 部署
npx wrangler deploy -c wrangler.ledger.toml
```

---

## 🧪 20U 测试流程（纸飞机 → 钱包 → U 卡）

### 现在是 dry-run，不真实打款：

| 步骤 | 方向 | 金额 | 手续费 | TXID | 状态 |
|---|---|---|---|---|---|
| 1 | 纸飞机 → LTZZZ 钱包 | 20 USDT | 0 | TEST_TG_IN_xxx | dry_run |
| 2 | LTZZZ 钱包 → U 卡 | 19.9 USDT | 0.1 | TEST_WALLET_OUT_xxx | dry_run |

### 真实打款前需要：
- ✅ USDT 钱包私钥（多方共管）
- ✅ U 卡 API 接口
- ✅ 人工确认 20U 测试

---

## 📋 每一步都有交易 ID/状态

不会出现「豆包说转了但实际上没转」的情况：
- 每一步都有独立 TXID
- 每一步都有状态：pending / confirmed / failed
- 所有记录都存在 KV 里，可查询可审计

---

## 🔒 安全规则

1. 单笔 < 100 USDT 自动出金
2. 单笔 >= 100 USDT 需要人工审批
3. 每日上限 500 USDT
4. 每月上限 5000 USDT
5. 私钥 AI 不持有
6. 所有出金必须有 TXID
