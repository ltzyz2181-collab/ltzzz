# LTZZZ 任务池

---

## 进行中

| ID | 任务 | 备注 |
|----|------|------|
| T010 | 凭证制度：关键 Secret 只在 CF | 文档已写；主人按通道补 Secret |
| T011 | AGI 圆桌页主视觉改版 | 要求已定；排版实施中 |

## 待办

| ID | 任务 | 备注 |
|----|------|------|
| T012 | 支付宝权限恢复后 0.1 元人工测 | 等官方 |
| T013 | PayPal：主人写入 CLIENT_ID/SECRET 后测 /health 与 sandbox oauth | 不真扣款 |
| T014 | Telegram：Bot Token 仅 Secret；通知类 webhook | 不存卡号 |

## 完成

| ID | 任务 | 结果 |
|----|------|------|
| T003 | 豆包 Worker | 🟢 health + 链路正常 |
| T005 | 首页实验室入口 | lab.html |
| T008 | 资金池架构文档 | FUND_POOLS + PAYMENT_LAYERS |
| T009 | PayPal Worker 骨架入库 | paypal-proxy-worker.mjs（无真付） |

## 关闭 / 禁止

| 项 | 原因 |
|----|------|
| AI 控制真钱包 / 导入「角色私钥」共签 | 安全与治理禁止 |
| 近期真实支付与自动转账 | 主人与总控约定 |
