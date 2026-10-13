# 豆包卡片决策回执 · AI 试用卡（2026-10-12）

单号/主题：AI 能试用的卡（境外 AI/SaaS 订阅用途）
日期：2026-10-12 UTC
结论：**不新办卡；沿用已有 BiyaPay 速捷卡（LTZZZ·5556 段）**。Wise Business 数字卡不可行；MoonPay 卡美国不可用。

## 一、本次约束（owner 确认）

- 无美国银行账户 / 无 SSN/ITIN → 排除全部需美国身份的渠道：Privacy.com、Coinbase Card、Wise 美国新户等。
- 用途：境外 AI/SaaS 订阅（ChatGPT / Claude / xAI 类）。

## 二、候选核实（一手来源）

| 候选 | 结论 | 依据 |
|---|---|---|
| Wise Business 数字卡（已有账户） | ❌ 不可行 | Wise 官方：数字卡仅限注册地址位于 AU/BR/CA/EEA/JP/MY/NZ/PH/SG/CH/UK/US 的账户；官网明示 "We don't have Wise Multi-Currency Cards yet in China"；台账实锤注册地=中国大陆（广东广州）→ 资格不存在 |
| MoonPay 卡（MoonAgents Card） | ❌ 美国未上线 | MoonPay 官方 2026-05 发布：仅 UK + LATAM；US/UK 计划中。用户当前在美国，不可用 |
| Privacy.com | ❌ 需美国身份 | 官方：US citizen/legal resident + US checking account + SSN |
| Coinbase Card | ❌ 需美国身份验证 | 美国专用预付 Visa（Pathward 发行）；无美国材料不可开 |
| **已有 BiyaPay 速捷卡（5556 段）** | ✅ **现有最优** | 已激活（2026-10-03）；专用于 AI 工具订阅（ChatGPT/Claude/xAI）；USDC A 轨充值（1.8%）；交易费 $0.5/笔；LTZZZ 已有完整架构（finance/biyapay/）与出金手册（2026-10-03） |

## 三、决定

1. **不申请新卡**：合规条件下无更优项；Wise/MoonPay 卡均不可用，申请即空转。
2. AI/SaaS 订阅支付继续走已有速捷卡 5556 段：总控裁定「必须充值」→ owner 确认余额 → USDC A 轨充值 → 商户订阅绑定 → 账本。遵循「能跑先不充，必须充值先提案后执行」。
3. 待办：
   - [ ] owner 报速捷卡 5556 段当前余额（入 Q6 资金运转表）
   - [ ] 2026-11 新 U 卡通道上线后评估是否替换
   - [ ] MoonPay / Wise 卡不再作为本用途选项

## 四、安全

本文档不含卡号/CVV/有效期/私钥/token。卡信息只存 BiyaPay App 与 owner 本机。
