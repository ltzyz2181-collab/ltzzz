# LTZZZ 海外支付网关（Payment Gateway）

> 状态：架构与 PAY-ID 规范已定；真实通道（Wise/Claude/DeepSeek/Telegram）待凭证与部署。
> 第一阶段只允许小额测试。

## 1. 统一 PAY-ID

格式：`PAY-<域>-<日期>-<序号>`，如 `PAY-CLAUDE-20260917-001`。

每笔付款统一记录：

| 字段 | 说明 |
|---|---|
| PAY-ID | 唯一 ID |
| 用途 | 服务/实验内容 |
| 服务商 | Claude / DeepSeek / Wise / 其他 |
| 预算 | 关联预算账户（DEEPSEEK-BUDGET 等） |
| 实际金额 | 含币种 |
| 币种 | USD / HKD / USDT / RMB |
| 时间 | UTC ISO |
| 状态 | pending / paid / failed / cancelled / timeout |
| 交易凭证 | 交易ID / 哈希 / 凭证号（无则不伪造） |

## 2. 预算限制（第一阶段）

- 单笔 ≤ 1 USDT（或等值）
- 每日 ≤ 2 USDT
- 测试总额 ≤ 10～20 USDT
- 超限自动拒绝 + waiting_approval

## 3. 流程

```
AI任务 → 生成支付任务(PAY-ID) → 预算校验 → 网关执行 → 结果 → LTZZZ账本 → Telegram通知
```

## 4. 通道状态

| 通道 | 状态 | 说明 |
|---|---|---|
| Wise | 待人工确认 | 账户信息待 App 核实（任务001） |
| Claude | 待 Key | Secret 配置后接入 |
| DeepSeek | 待 Key | Secret 配置后接入 |
| Telegram | 待 Bot Token | 用户创建 Bot 后接入 |

## 5. 安全

- 银行卡信息/支付密码/API Key 不写入代码与仓库（只进 Secret）。
- 支付失败不无限重试（≤2 次，记录原因）。
