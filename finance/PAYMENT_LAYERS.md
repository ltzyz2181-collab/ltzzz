# LTZZZ 支付四层架构

> 2026-09-19 起按此设计。**不做**「只有一个支付按钮」。
> 真付、自动转账、私钥：未授权前全部禁止。

## 总原则

- 人类控制商户与钱包；AI 创建申请与记录，不持钥。
- 凭证（Bot Token、PayPal Secret、支付宝密钥）只进 **Cloudflare Secret / 云端**，不进 GitHub、不进聊天、不要求主人反复下载配置文件。
- 主人「一个本地文件都没有」也能运营：授权一次 → 云端保存 → LTZZZ 记状态 → 复用。

---

## 第一层：收款

| 通道 | 状态 | 说明 |
|------|------|------|
| 支付宝 | 挂起 | API 曾通，返回 40006 权限不足；风控/重签中 |
| PayPal | 骨架 | Client ID + Secret → OAuth；Webhook 须验签；见 `paypal-proxy-worker.mjs` |
| Telegram 支付 | 规划 | 由 Telegram 认可的支付服务商处理敏感信息；Bot 不存卡号 |
| Wise 等 | 规划 | 个人账户确认后另案 |

## 第二层：AI 服务采购

流程示例：

`需要 Claude API → 总控创建 PAY-ID → 查预算 →（人类/策略）授权 → 执行支付 → 账本 → Telegram 通知`

- 预算科目：`finance/budgets.md`、pay-proxy `/balance`
- 默认：**人工确认**；不自动扣公共资金

## 第三层：AI 小额实验

- 仅在第一、二层稳定后逐步放开
- 硬顶：单笔上限 + 日累计 + 服务商白名单
- 每笔：申请 → 检查 → 限额 → 执行 → 审计

## 第四层：LTZZZ 公共资金

- 载体：Safe 等多签（当前 ETH Safe `0x3cb1…866a`，**3/5**）
- **单个** GPT / 豆包 / 主人热钱包流程，都不能单独转走公共资金（链上须满阈值）
- 审计：Safe 历史 + `finance/` + pay-proxy ledger

---

## 凭证制度（优先于「做出 PayPal 按钮」）

| 凭证 | 存放 |
|------|------|
| `LTZZZ_AGENT_TOKEN` | CF Secret |
| 支付宝密钥 | CF Secret（已有则保持） |
| PayPal `CLIENT_ID` / `CLIENT_SECRET` | 仅 CF Secret |
| Telegram `BOT_TOKEN` / webhook secret | 仅 CF Secret |
| 钱包私钥 | **永不**进 Worker、永不进 AI 对话 |

AI 不得索要密码；缺凭证时只提示「去 Cloudflare 控制台写入 Secret」。

---

## 近期不做

- 真实 PayPal/支付宝扣款测试（待通道与授权）
- 自动转账、代持私钥、向 Safe「代注入」
- 依赖主人电脑下载 `meta-import.txt` 等文件完成配置
