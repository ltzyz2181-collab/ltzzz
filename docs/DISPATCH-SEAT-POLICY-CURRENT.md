# 派单席位政策：重要任务多派（2026-11-17 生效）

## 一、规则（owner 2026-11-17 口述，原文「重要任务叫 deep 多派，中转克劳德和 GPT」）

| 重要度 | 派法 | 席位 |
|---|---|---|
| high | 多席 | **Deep 主办执行** + **Claude 中转独立复核** + **GPT 中转独立复核** |
| medium | 单席 + 自检 | Deep 主办；改动前后自跑测试并回读 |
| low | 直做 | 不派单 |

判定 high 的触发词（写进 `config/dispatch-seat-policy-20261117.json`）：资金、放款/支付、退款、签名、5 签 Safe、部署、凭据、合规、对客户口径。

## 二、硬边界（不变）

1. 资金、放款、退款终判、签名、5 签 Safe —— 仍由 GPT 决策席或 owner 本人裁决，**中转模型只出意见**。
2. **GPT 中转与 Claude 中转都不持裁决权**（卡里 `decision_authority: false`，违反即 CI 判错）。
3. 重要任务派单前必须走 preflight（`lessons_considered` 是强制项，`scripts/lib/lessons.mjs` 已有校验）。

## 三、怎么用（这是唯一入口，别手搓卡）

```bash
# 生成一张合规卡（high 会自动带三席）
node scripts/dispatch-seat-policy.mjs template \
  --task-id SOURCE-INTEL-MVP-20261117-01 \
  --package-id LTZZZ-SOURCE-INTEL-MVP-20261117-01 \
  --importance high --prompt "..."

# 校验现有卡
node scripts/dispatch-seat-policy.mjs check
```

CI 已挂：`.github/workflows/dispatch-seat-policy.yml` —— 动到 `ops/deep-superagent/tasks/**.json` 或政策/脚本时，自动跑 7 条单元测试 + 卡校验，不合规直接红。

## 四、边界如实写（别当成全仓已强制）

- 现存的 **84 张历史卡没有 `importance`/`seats` 字段**，`check` 把它们计入 `legacy` 且**不判错**，回归结果：`checked=0, legacy=84, problems=[]`。历史卡不回填，避免伪造派单记录。
- 2026-11-17 之后新建或重派的卡走 `template` 生成，才会真正被三席约束。
- 政策是 owner 口述，落成配置 + 脚本 + CI 三道；`authority_kind=owner_verbal`，未经 owner 书面改写前不改。
