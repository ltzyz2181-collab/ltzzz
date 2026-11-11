# 回执：原厂（官方）Claude / GPT 通道实测 —— 两边都没通，卡在账务；Deep 席位未接

- 发起：豆包执行席（doubao）
- 时间：2026-11-10 19:06 PST / 2026-11-11T03:06Z
- 触发指令（owner 原话）："克劳德和gpt 原厂是否已经通了 没通就等gpt 裁决 通了 就给原厂deep 里面 克劳德和gpt 席位接上并测试 后发邮件告诉gpt"
- 旁证来源：本轮之前的中转站（APIsRouter）实测结果**不作为原厂结论**，见第 4 节

## 1. 结论

| 席位 | 密钥 | 官方目录 | 真实生成 | 判定 |
|---|---|---|---|---|
| claude（Anthropic） | 有效 | HTTP 200，15 个模型 | HTTP 400 `credit balance is too low` | **未通（余额不足）** |
| gpt（OpenAI） | 有效 | HTTP 200，96 个模型 | HTTP 429 `billing_not_active`（"Your account is not active"） | **未通（账务未开通）** |

两边都不是网络问题、不是密钥失效、不是模型名不对：`GET /models` 都拿到 200 且返回了完整模型目录，说明鉴权通过、链路可达；卡点在付费额度/账务状态。

## 2. 实测方式（可复现）

- 脚本：`scripts/probe-native-paid-seats.mjs`（commit `0d161cf2`）
- workflow：`.github/workflows/probe-native-paid-seats.yml`（commit `132caffa`）
- 观测点：GitHub Actions runner（境外出口），**只打官方端点，不经过任何中转**
- 每次请求：`max_tokens: 16`，prompt 为 `ping`，超时 60s，每个厂商各一次目录读取 + 一次生成，无重试
- 凭证：仓库 Secrets `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`，回执不含任何密钥
- 证据文件：
  - `knowledge/results/native-paid-seats/42950528406.json`（workflow_dispatch，最新）
  - `knowledge/results/native-paid-seats/latest.json`
  - run：`https://github.com/ltzyz2181-collab/ltzzz/actions/runs/42950528406`

原始错误（截断，未含密钥）：

- Anthropic：`{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}`（request_id `req_011CgvQJAzTfvAfd1j6RJTRT`）
- OpenAI：`{"message":"Your account is not active, please check your billing details on our website.","type":"billing_not_active","code":"billing_not_active"}`（request_id `req_da39380fb5f94f0e8e63e0c6648f4a63`）

## 3. 因此没有做的事（按 owner 条件句执行）

owner 的条件是"通了才接 Deep"。既然没通：

- **未**把 gpt/claude 接入 Deep Superagent 席位：
  - `config/deep-superagent.json` 保持 `native_paid_reserved_enabled: false`，两席状态仍为 `reserved_disabled_not_generation_verified`
  - `workers/deep-superagent/index.js` 的 `SEATS` 仍只有 deepseek/doubao/qianwen/kimi/grok；`capabilities.native_gpt`/`native_claude` 仍为 false
  - `wrangler.deep-superagent.toml` 未新增 `GPT` / `CLAUDE` service binding
- 没有对 Deep 发起任何含 gpt/claude 的队列测试（未通的情况下跑必失败，且会污染 job 回执）
- 未做任何充值、订阅、账务变更（属资金动作，需 owner 指令）

## 4. 与中转站实测的边界（不要混用）

此前那批"claude-opus-5-5 回 pong / gpt-6-sol 回 pong / 一句 ping 计 4387 token"的结果，来自中转站，**不能证明原厂已通**；本轮原厂实测证明中转站能不能调通与原厂账务无关。

需要注意的交叉点：

- 中转站给出的 Claude 模型 ID（`claude-opus-5-5`、`claude-sonnet-5`、`claude-haiku-5-5`、`claude-sonnet-4-6`）与 Anthropic 官方目录**一致**。
- 中转站的 `gpt-6-sol` / `gpt-6.1-sol` / `gpt-6-astra` 未出现在 OpenAI 官方目录可见清单中；官方目录里是 `gpt-5.4` / `gpt-5.5-pro` / `gpt-5.6-luna` / `gpt-5-mini` 等。若后续要用，需先确认这是官方型号还是中转站自建别名。

## 5. 需要 GPT 裁决的事项

请裁决走哪条（三选一，或给出第四种）：

- **A. 开原厂账务**：给 Anthropic 账户充值 credits + 在 OpenAI 后台恢复 billing。两者都是真实支出，需 owner 明确授权金额与支付方式；执行席不自行付款。
- **B. 维持原厂关闭**：Deep 的 gpt/claude 席位继续 disabled；对外只保留中转站通道，并限定在本轮已验证可用的档位（4 个 Claude + gpt-6.1-sol），短请求不走中转站（固定约 4.4k token 基础开销）。
- **C. 只开一边**（例如只充 Anthropic，或只恢复 OpenAI），另一边继续走中转/继续关闭。

裁决后如需接入 Deep，执行清单已就绪（`SEATS` 映射 + 两个 service binding + 代理侧响应格式适配 + 一单真实队列回执），可在同一轮完成。

## 6. 复验方式

任何人要复核以上结论，重跑：

```
gh workflow run probe-native-paid-seats.yml -f note=recheck
```

结果落在 `knowledge/results/native-paid-seats/latest.json` 的 `seats.claude.generation` / `seats.gpt.generation` 与 `conclusion` 字段。注意：这是**付费调用**，每次约 $0.00001 量级，但失败请求不计费。
