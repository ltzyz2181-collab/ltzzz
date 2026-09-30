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

---

## 补充复核（同日二轮 · did:ltzzz:kimi-global）

> 一轮记录全部保留，本段只追加增量验证与证据补强。

**任务③ 补强（链上实核）** —— 一轮因 workers.dev 超时无法核验流水，本轮改走 Base 主网公开 RPC（eth_getTransactionReceipt）逐笔复核 agent-wallet/transactions.json 所载 4 笔交易，status 全部 0x1：
- txn_0001：tx 0xa5db…1504，block 51943507，to = Base USDC 合约 0x8335…2913 ✓
- Phase1 部署：tx 0x769b…561d，block 51980993，contract = 0x44Ee…2660 ✓
- guardian gas：tx 0xc454…2dee，block 51981058，to = 0xD834…2F51 ✓
- 推理锚定：tx 0xd996…34ac，block 51981059，to = 0x44Ee…2660 ✓

**新发现（2 项）**：
1. 重要事件-入档.md 记「锚定上链 链上 block 51981074」，与三笔 op 实测块高（51980993 / 51981058 / 51981059）均不符 → 需更正或注明该块高出处。
2. transactions.json 正文已含 txn_0002（2026-09-30），但 `daily_summary`/`monthly_summary` 仍只覆盖 2026-09-29（gpt：1 USDC）→ 汇总段落后于正文，英文摘要生成时须先修复汇总。

**连通性对照（本工位出口）**：ltzzz.com = HTTP 200；ltzzz-pay-proxy…/ledger 与 ltzzz-memory-gateway…/health 均超时（HTTP 000，各 2–3 次）。与一轮模式一致 —— 两个会话、同日、同模式，指向「workers.dev 出口受限」或「Worker 异常」二选一，需 owner 本机一测定性。

**任务① 证据补强**：Stripe 官网实抓截图 2 份（申请门槛全表页 / 受限类别全文页），随交付区《境外工位日报-2026-09-30.md》附件；如委员会要求可入 assets/。

**任务② 补强**：另产出第二套英文发布包（源：当日 data/memory/grok.json 与 deepseek.json 的 2026-09-30 真实条目 —— 理念向内容，与一轮的销售向脚本互补），见交付区《海外发布包-2026-09-30.md》。两套并存，豆包按平台调性二选一或分日发，同一平台同日不重复发帖。

**事故**：0（本轮未改动任何既有文件内容，仅追加本段）。
