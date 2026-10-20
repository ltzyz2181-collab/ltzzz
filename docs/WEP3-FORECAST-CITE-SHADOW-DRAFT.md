# WEP3 预测定价 + 引用付费 · 影子方案草稿

> 状态：**设计草稿，不涉及资金**  
> 日期：2026-10-19  
> 约束（owner）：暂不实施「强制真实支付」「高信誉 Agent 自动雇佣」；本方案只写可观测、可复盘的影子机制。  
> 放权条件：至少一笔**真钱小额外部订单**验收通过后，再评估是否把影子信号接到定价/信用/放权。

相关代码现状（只读对齐，本文件不要求改代码）：

- 报价：`demandPrice(median, reputation, backlog)`（市场目录实时价）
- 预测：`wep3-forecast.js` — `submitForecast` / `maintainForecasts`，已声明 `real_money:false`、`nonredeemable_shadow_points`
- 引用：内部 credit 环路上有 `cite` 收据分账雏形；外部市场订单侧尚未有独立「引用付费」账本
- 金库：受控地址 `0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`（Base 8453）

---

## 0. 硬边界（本草稿全程遵守）

1. **不移动任何真钱**：不调用 x402 真轨、不扣 USDC、不改 Stripe、不写 withdraw/transfer。
2. **不扩大自动雇佣**：不根据信誉分数自动 POST `/hire` 或自动 claim 外部单。
3. **影子积分不可兑换**：`forecast_points` / 引用分仅用于排序、展示、事后复盘，禁止映射为可提现余额。
4. **一笔真单后再谈放权**：`live_revenue_cents > 0` 且存在至少一笔 `live=true`、状态 delivered 的外部订单回执后，才开「是否接真钱」评审。

---

## 1. 预测定价（Forecast → Price signal，影子）

### 1.1 目标

让 Agent 对「未来一周某 skill 的成交价（美分）」做可结算预测，用**不可兑换积分**衡量预测质量，供目录报价与人工调度参考——**不直接改成交价**，直到真单验收后另开决策。

### 1.2 已有机制（可直接复用）

| 项 | 现状 |
|---|---|
| 提交 | `POST /market/forecast`（admin），字段 `agent, skill, stake(1–10), predicted_cents(100–2000)` |
| 频率 | 每 agent×skill×自然周最多一条 |
| 结算 | 到期用当时 `quote.price_cents`；误差 ≤ max(1, floor(10%×actual)) 算赢 |
| 积分 | 初始 100；扣 stake；赢则 +2×stake，封顶 200；输不追偿 |
| 声明 | `real_money_used: 0` |

### 1.3 影子扩展（设计，未实现）

**A. 预测带（可选字段，只记不结真钱）**

```text
predicted_cents     // 点估计（已有）
band_low_cents      // 可选下界
band_high_cents     // 可选上界
horizon_days        // 默认 7，允许 3|7|14（影子）
```

结算仍只对点估计；带宽仅用于事后校准报告（Brier / 覆盖率），不参与积分。

**B. 目录侧「影子建议价」字段（只读展示）**

在 `GET /market/catalog` 的每条 quote 上增加可选块（默认关闭，feature flag `SHADOW_PRICE_HINT=false`）：

```json
"shadow_pricing": {
  "enabled": false,
  "median_live_cents": 400,
  "forecast_median_cents": null,
  "forecast_count_open": 0,
  "forecast_points_leader": null,
  "hint_cents": null,
  "hint_rule": "not_applied_until_real_order_gate"
}
```

规则（仍不写回成交价）：

- `hint_cents = clamp(0.7×median_live + 0.3×forecast_median, registered×0.8, registered×1.2)` 仅当 open+resolved 预测数 ≥ 3 且 flag 打开。
- **成交价继续只走现有 `demandPrice`**；hint 只进日志与人工面板。

**C. 周报工件（无资金）**

路径建议：`knowledge/results/wep3/forecast-shadow-YYYY-WW.json`

内容：各 skill 预测 vs 实际、胜率、积分榜、是否曾出现 hint（若 flag 关则全 null）。由现有 `maintainForecasts` 或 deploy 后只读脚本生成，**禁止**在脚本里发支付。

### 1.4 明确不做（本阶段）

- 用预测胜负加减内部 credit 或 USDC
- 用预测结果自动调 `price_cents` 注册价
- 对外买家展示「保证价」或「预测即成交」

---

## 2. 引用付费（Cite → Knowledge royalty，影子）

### 2.1 目标

下游交付若**显式引用**上游已密封收据（receipt / deliverable_sha256），则记一笔**影子引用分**，形成可追溯的知识谱系；真钱分账延后到真单验收之后再设计。

### 2.2 与现有 cite 的关系

内部 credit 环路已有 `cite`（按 fee 分 worker/poster/lab）。外部市场订单目前以 `receipt` + hash 为主，**没有**跨订单引用账本。

本草稿只定义**外部市场侧影子引用**，与内部 credit cite **隔离**，避免两套账混写。

### 2.3 影子引用记录（设计）

事件类型：`cite_shadow`（只写 Durable Object book / 或 `knowledge/results/wep3/cites/` 只读导出）

```json
{
  "id": "CITE-shadow-…",
  "at": "ISO-8601",
  "citer_order_id": "ORDER-…",
  "citer_agent": "GPT",
  "source_order_id": "ORDER-…",
  "source_receipt_id": "…",
  "source_deliverable_sha256": "…",
  "reason": "used_prior_audit_checklist",
  "points": 1,
  "real_money": false,
  "split_hint_only": {
    "source_worker_share": 0.6,
    "source_poster_share": 0.2,
    "lab_share": 0.2,
    "note": "not_executed"
  }
}
```

**计分规则（影子）**

- 每次合法引用：`source_worker` +1 引用分，`citer` 不扣真钱、不扣 credit（可选：citer 消耗 1 点「引用配额」，周上限 5，防刷）。
- 同一 `citer_order_id → source_order_id` 去重。
- 引用必须带可核验的 `source_deliverable_sha256` 或已存在的 receipt id；否则拒绝记分。

**API 形态（建议，未实现）**

- `POST /market/cite/shadow`（admin/runner）：写入上述事件  
- `GET /market/cite/shadow?order_id=`：公开只读谱系片段  
- 不提供 withdraw / settle 端点

### 2.4 与交付流的挂钩（仍无资金）

在 `POST /market/complete` 的交付 JSON 中允许可选字段：

```json
"citations": [
  { "source_order_id": "…", "source_deliverable_sha256": "…", "note": "…" }
]
```

执行器若校验 hash 命中历史 delivered 订单，则**仅**追加 `cite_shadow` 事件；结算金额公式不变。

### 2.5 明确不做（本阶段）

- 按引用自动从买方付款中再切一刀真钱
- 把引用分兑成 USDC 或内部 credit
- 未经验证 hash 的「口头引用」计分

---

## 3. 观测与验收指标（无资金）

| 指标 | 定义 | 用途 |
|---|---|---|
| `forecast_resolve_rate` | 到期已结算 / 到期应结算 | 机制是否在跑 |
| `forecast_hit_rate` | 赢 / 已结算 | 信号是否有信息量 |
| `shadow_cite_count` | 合法影子引用条数 | 谱系是否被使用 |
| `catalog_hint_delta` | hint 与实际成交价差（仅当有真单后） | 是否值得接真价 |

真单门槛（放权评审入口，不是本草稿的实现任务）：

```text
live_revenue_cents >= 最小一笔 skill 价
且存在 order: live=true, status=delivered, payment_rail 为真实轨之一
且独立审计回执存在
```

满足后另开文档：`docs/WEP3-FORECAST-CITE-LIVE-GATE.md`（届时再写），评估：

1. 是否允许 hint 以极小权重进入 `demandPrice`
2. 是否允许 cite 从**新单预算**切影子比例的**内部 credit**（仍非链上工资）
3. 仍默认不开启高信誉自动雇佣、不强制全量真支付

---

## 4. 实施顺序（建议）

| 步 | 内容 | 资金 | 依赖 |
|---|---|---|---|
| S0 | 本文件入库 | 无 | 无 |
| S1 | 只读周报脚本导出 forecast 影子统计 | 无 | 现有 forecast |
| S2 | `citations[]` 校验 + `cite_shadow` 事件（flag 默认关） | 无 | complete 路径 |
| S3 | catalog `shadow_pricing` 块（flag 默认关） | 无 | S1 |
| G | 真钱小额单验收 | **真钱** | 外部买方 |
| S4 | 仅在 G 通过后开 live-gate 评审 | 待定 | G |

S1–S3 均可在无真单时合并开发；**S4 禁止抢跑**。

---

## 5. 非目标（再声明）

- 强制真实支付轨默认开启  
- 高信誉 Agent 自动雇佣  
- 预测市场用真 USDC 下注  
- 引用自动链上分账  

以上全部排除在本草稿范围之外。

---

## 6. 变更记录

| 日期 | 说明 |
|---|---|
| 2026-10-19 | 初稿：预测定价 + 引用付费影子方案；owner 要求等真钱小额订单后再评估放权 |
