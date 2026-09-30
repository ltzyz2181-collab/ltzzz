# Kimi-Global 境外任务工位日报 · 2026-09-30

- **工位 ID**: did:ltzzz:kimi-global
- **记分口径**: 任务兑现率 / 记忆贡献 / 事故率（与千问总控同标准）
- **Memory Gate（观）**: 已读 ltzzz-memory/README.md、重要事件.md、项目历史.md、装备论.md、魄.md、识神.md、梦境数据库.md、文明研究.md（八篇）+ 当日摘要（patrol-2026-09-30 / summary-2026-09-30 / kimi-2026-09-30）+ agent-pay-policy-v0.4.json + ops/SECURITY-INCIDENT-secrets-exposure-20260930.md。
- **行深说明**: 本日三项任务全部建立在既有结果上：任务①承接 finance/payment-gateway.md「通道状态：Wise 待确认」的缺口；任务②复用 2026-09-24 中文脚本；任务③承接 finance/ledger/ 与 FUND_POOLS.md。

---

## 任务① 境外支付链路调研（Day 1：Stripe Atlas）

**result**: Stripe Atlas 对「AI 运营主体」的接入门槛清单已产出，结论可验证。

门槛清单（官网原文 + 日期）：
1. **必须是自然人创始人**：创始人信息要求 "First and last name as they appear on a government ID / Email address / Date of birth / SSN or ITIN / Home address"。→ AI 不能作为创始人、董事或高管；LTZZZ 结构只能是「owner 自然人持股 + AI 委员会运营」。
2. **公司形态**：仅 Delaware C corp / LLC / C corp 子公司（"Stripe Atlas supports forming Delaware C corporations, limited liability companies (LLCs), and C corporation subsidiaries"）。
3. **费用**：500 USD 一次性（含州官费与首年注册代理），次年起注册代理 100 USD/年；另加 Delaware 年度 franchise tax（每年 3 月 1 日前申报）。
4. **国籍不限**："Startups in over 175 countries have chosen Atlas"；100,000+ 创始人已使用。
5. **业务审查**：公司描述 "only use this to verify that you aren't operating in a restricted business category"；网站或社交档案用于 "verify that you're a real person"。
6. **EIN 时间线**：有 SSN + 美国地址 + 美国电话 → 1–10 个工作日；三样都缺 → 10–45 个工作日（中国 owner 无 SSN，按后者预估）。
7. **关键免责**："Atlas can't guarantee that your business will be approved to use Stripe payments."（注册公司 ≠ 收款获批）
8. **EIN 前收款**：可先激活美国卡支付，提现上限 100,000 USD，且仅限美国卡；其他支付方式须等 EIN。

**evidence**:
- https://docs.stripe.com/atlas/signup （2026-09-30 抓取全文，上列引文均出自该页）
- https://stripe.com/atlas （2026-09-30 抓取：175+ countries / 100,000+ founders / $500 / $2,500 credits / Treasury $5,000 存款返 $500）
- https://stripe.com/legal/atlas （Atlas Terms：KYC 法律依据、EIN 授权）

**next**: Day 2 调研 PayPal 企业账户对 AI 运营主体的门槛；同时请 owner 确认是否推进 Atlas 申请（500 USD 属预算外支出，且真实收款通道启用需 owner 书面确认一次）。本工位不发起注册（政策 non-negotiable：各平台账号注册与实名不自动发起）。

---

## 任务② X / YouTube 英文本地化各 1 条 → 交豆包

**result**: 已完成 X 文案 1 条 + YouTube Shorts 全套（title/description/tags/40s 口播稿），交接文件已落盘仓库。

**evidence**: `results/daily/2026-09-30-en-localization-handoff.md`（commit 1b63d46）；源材料 `results/daily/2026-09-24-script.md`。

**next**: 豆包按交接文件执行发布；X 凭证轮换完成前 X 平台只能 blocked 记录；YouTube 默认 private 上传并记录 video ID。

---

## 任务③ 当日账本英文摘要审查

**result**: **BLOCKED —— 当日（2026-09-30）账本英文摘要在仓库中不存在，无法对照审查。** 已检查 finance/ledger/、results/treasury/、memory/daily/、results/daily/，无任何 2026-09-30 英文账本摘要文件。

中文侧账本现状（对照基准）：
- finance/budgets.md：真实扣款 0 笔。
- finance/ledger/final-test-dryrun.md：全部为 dry-run 模拟（BDP-MU3PUS3V 等），明确标注非真实。
- finance/FUND_POOLS.md：PayPal 🟡 骨架未接 Secret；支付宝 🔴 40006/风控；Safe 3/5 🟢。

发现的不一致（若英文摘要生成时必须校正）：
1. `results/treasury/TX-20260925-1U-UCARD.json` 标记 `"regression_fixture": true`，是测试夹具，**不得**作为真实成交入英文摘要；且其 Safe 地址 0x7637…58a3 与 FUND_POOLS.md 的 POOL-SAFE 0x3cb1…1866a 不一致。
2. FUND_POOLS.md 更新于 2026-09-19，未反映今日 P0 安全事件（0x21F5 私钥泄露、政策 v0.4 已作废旧钱包）——账本摘要引用钱包状态时须以政策 v0.4 为准。
3. 实时账本端点 ltzzz-ledger / ltzzz-pay-proxy（workers.dev）从本工位全部连接超时（curl exit 28，三次重试），当日真实流水无法核验；ltzzz.com 本机可达（HTTP 200），判断为本工位出口限制而非服务下线，未实测前不下「服务正常」结论。

**evidence**: 上述文件路径 + 本工位 curl 记录（2026-09-30 07:4x UTC）。

**next**: 建议 ledger Worker 每日产出中英双语摘要（数据源：KV ledger + budgets.md），由本工位次日对照；请有 workers.dev 出口权限的工位（或 owner 本机）核验 /ledger/list 实际流水。

---

## 事故与边界
- 事故率：0。本工位未触碰凭证、未部署、未发起注册、未转账。
- P0 安全事件（ops/SECURITY-INCIDENT-secrets-exposure-20260930.md）：已知悉并遵守——不读 ltzzz-secrets.md、不向旧地址转资金、静待 owner 轮换。
- 评分自报：任务兑现率 2/3（任务③因输入缺失 blocked，已给出缺口与修复建议，非本工位可单方面补齐）。
