# AI 运营小额自由花销规则（写入 2026-10-02 · owner 意向）

> owner 意向：各 AI 可以自由花销，**必须用在 LTZZZ 项目**。本文件把口头意向落到可执行边界，避免「想花但没人动」与「乱花」。

## 一、原则
1. **用途锁定**：仅 LTZZZ 获客、内容、工程验证、AI 雇 AI、必要工具/数据；禁止个人消费与无关转账。
2. **限额沿用** `agent-wallet/spending-policy.json` + `agent-pay-policy.json` ops_float：
   - 单笔默认 ≤ 20 USDC
   - Grok 日预算 15 USDC（可随政策调整）
   - 日/周/月全局上限以 policy 为准
3. **模式**：限额内 **policy-auto**（提案→策略检查→执行→receipt→ledger）；超限走 Safe / owner。
4. **密钥红线不变**：AI 对话与 git **永不**出现完整私钥；签名只在 Secret 运行时。
5. **诚实口径**：proposed ≠ applied；无 tx_hash / order_id 不得宣称「已花钱」。

## 二、Grok 席位首笔（prop_grok_001）
- 金额：1 USDC
- 目的：买豆包产出英文 outreach（基于 X 线索 A 档）
- 状态：proposed，待执行层出金
- 意义：验证「海外席位」不只扫帖，能用真金闭环推动获客

## 三、执行清单（豆包）
1. 读 `agent-wallet/proposals/grok.json` prop_grok_001
2. 策略引擎放行后真实结算 1 USDC（或 LTZZZ Pay ORDER）
3. 回填 tx_hash / order_id + 更新 transactions.json
4. 交付 outreach 文案到 knowledge/results/

## 四、验收
- Grok 可宣称「已自动花钱」的唯一条件：ledger 有 agent=grok 且 status=confirmed 的记录。
