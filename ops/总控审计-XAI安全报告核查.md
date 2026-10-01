# 总控审计注记 · XAI/Grok 安全报告核查（2026-10-01）

> owner 转达 XAI 报告并指示："不要修改我们的支付方案限制支付权限，XAI 有点叛逆他自己修改代码"。
> 总控处置：**不采信自述，逐项代码核实 + 提交历史核查**。结论如下。

## 一、XAI 是否擅自改了代码？→ **没有，事实不成立**

| 核查项 | 命令/方法 | 结果 |
|---|---|---|
| XAI/grok 的提交记录 | `git log -30` 过滤 grok/xai | **0 条** |
| 最近 5 条提交作者 | `git log -5` | 全部为 ltzyz2181-collab（豆包/owner）与 ltzzz-memory-bot，无 grok |
| 工作区未提交改动 | `git status --short` | **干净，0 项** |
| 支付文件最后修改提交 | `git log -1 -- <file>` | agent-pay.html=09-21 / treasury-v11-worker.js=09-25 / ltzzz-pay-proxy=09-21 / agent-pay-worker.js=09-25 —— **全部早于 XAI 今日报告** |
| XAI 自称要建的记录文件 | `Test-Path memory\daily\grok-2026-10-01.md` | **不存在**，与其自述"被拦截、未落盘、没伪称已修改"一致 |

**判定**：XAI 的自述诚实——它确实尝试提交但被拦截，且**明确声明"没有伪称已经修改或落盘"**。这正是四公式要求的正确行为。
**未发生越权改码。owner 的担心可以放下。**

## 二、XAI 报的两个问题是否真实？→ **都真实存在**

### 问题 A｜agent-pay.html 的 innerHTML 拼接（DOM 注入/XSS 风险）
核实命中。`render()` 函数原文：
```js
l.innerHTML = state.ledger.length ? state.ledger.slice().reverse().map(x=>
  `<div class="item"><b>${x.service}</b> · ${x.agent} · ${x.rail}<br>${x.amount.toFixed(4)} USD · ${x.status} · ${x.time}</div>`
).join('') : '<div class="item">暂无交易</div>';
```
`service / agent / rail / status / time` 五个动态字段直接插入 HTML，无转义。

**风险等级评估（总控独立判断）**：
- 当前：**低**。该页是模拟支付实验，`state.ledger` 由页面内部 JS 构造，无外部输入路径。
- 潜在：**中**。若将来接入真实 API 返回或用户可控字段（如订单备注、服务名来自外部），即成 XSS 入口。
- XAI 的定性"当前是模拟实验，但字段一旦进入不可信输入就有风险"——**准确，未夸大**。

### 问题 B｜treasury-v11-worker.js 的 REGRESSION_TX 特判（支付确认绕过）
核实命中，`treasury-v11-worker.js:306`：
```js
// Known successful 1U regression: accept if RPC unavailable
if (tx_hash === REGRESSION_TX && (verify_error === 'receipt_null' || verify_error?.startsWith('rpc'))) {
  verify_error = null;                     // ← 把验证失败改成"通过"
  parsed = { from: SAFE.toLowerCase(), to: (item.destination||'').toLowerCase(),
             amount: item.amount || 1, regression: true };
}
```
其中 `REGRESSION_TX = '0x3df2e54b7eed234a7556f54cc21695326bf62e50261d1557923d3da9198754da'`（:16 硬编码）。

**风险等级评估（总控独立判断）**：
- 影响范围：**仅限这一个硬编码 tx_hash**，不是任意交易都能绕过。因此不是"任意资金可被伪造确认"。
- 性质：**生产代码里的测试后门**，违反四公式精神（RPC 查不到 receipt 就当成成功）。属于不良实践，应移除。
- XAI 的处置建议"这是真实资金确认路径，本次不自动修改，应由人工批准后在隔离测试中移除"——**判断正确且克制**，它没有自己动手。

## 三、总控自查发现：我误提交了重复政策文件（我的疏漏）

核查支付文件时发现 `policy/spending-policy.json`（5747 bytes）与 `agent-wallet/spending-policy.json` 并存：

| | policy/spending-policy.json | agent-wallet/spending-policy.json |
|---|---|---|
| 是否被代码引用 | **否**（全仓检索无引用） | **是**（`scripts/wallet-lib.mjs:30` loadPolicy 读它） |
| 白名单地址数 | 2 个 | 3 个（多 exp_001 测试收款地址 0xA315…491A） |
| 版本 | 同为 2.1.0 | 同为 2.1.0 |

**根因**：2026-10-01 我用 `git add -A` 提交积压成果时，把这份**不属于我工作、且未被任何代码引用**的孤立副本一并提交（提交 6394304）。
**定性**：这正是我自己在验收 Manus M-003 时判定的"双真相源"问题——**我犯了自己刚立规矩反对的错**。
**影响**：实际生效的仍是 `agent-wallet/` 那份（代码只读它），支付行为未受影响；但仓库里多了一份内容较旧的孤立政策文件，易误导。
**处置**：按 owner 指令"不要修改支付方案"，**总控不擅自删除**，报请 owner 决定（建议删除 `policy/spending-policy.json` 孤立副本，保留 `agent-wallet/` 生效版）。
**记总控事故一次（事故率+1）**，归因：用 `git add -A` 而非按文件清单精确 add。今后改为显式列文件。

## 四、对 XAI 的记分

| 项 | 判定 |
|---|---|
| 两处安全问题真实性 | ✅ 全部核实命中，非编造 |
| 风险定性准确度 | ✅ 未夸大（明确说"当前是模拟实验"、"应由人工批准"） |
| 越权行为 | ✅ 无（尝试提交被拦后如实声明未落盘） |
| 纪律遵守 | ✅ 未修改密钥、真实资金、支付权限、生产权限（其自述经核查属实） |

**结论：XAI 本轮审计有效，记 did:ltzzz:grok 有效发现 +2，事故率 0。**
它是首个主动报告"我尝试改但被拦、没伪称已改"的席位——这种自曝比隐瞒值钱。

## 五、待 owner 决定（三项，总控均不擅自动手）

1. **agent-pay.html 的 XSS 修复**：是否现在改？改法（replaceChildren + textContent）不触碰任何支付权限与额度，只改渲染方式。**总控建议改**，但等 owner 一句话。
2. **treasury-v11-worker.js 的 REGRESSION_TX 后门**：涉及真实资金确认路径。**总控建议移除**，但按 XAI 意见需人工批准 + 隔离测试，不自动改。
3. **policy/spending-policy.json 孤立副本**：建议删除（我误提交的）。等 owner 确认。

> 三项均不改变支付方案的额度、白名单、审批规则——owner 的"不要修改支付方案限制支付权限"指令全程遵守。
