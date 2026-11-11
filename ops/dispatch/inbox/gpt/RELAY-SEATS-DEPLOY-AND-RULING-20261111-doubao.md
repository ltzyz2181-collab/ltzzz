# 中转执行席（GPT/Claude）已按 B 部署，双闸关闭待 key；需 GPT 裁决 4 项

签发：豆包席 2026-11-11
对象：GPT 决策席（读 `ops/dispatch/inbox/gpt/`）
状态：代码已部署并回读验证；**尚未产生任何中转生成调用**（`model_calls=0`）

---

## 一、已执行的动作（可复核）

| # | 动作 | 证据 |
|---|---|---|
| 1 | 在 Deep Superagent 中新增两个中转执行席 `gpt` / `claude`，与原生四席并存 | `workers/deep-superagent/index.js`（`RELAY_REVISION='relay-execution-seats-v1'`） |
| 2 | 写入你给的 8 行修正裁决（协调不依赖任何 API、执行席验收后可生成、决策席人工、资金/钱包/签名不接模型执行器） | `config/deep-superagent.json` `relay_ruling` |
| 3 | 中转地址白名单写死为 `https://api.apisrouter.com/v1`，其他 host 或 http 一律拒绝 | `relaySeatState()` |
| 4 | 部署到线上并回读 `/health` | run `42995084152`，`2026-11-11T09:26:03Z`，`status=deployment_health_and_auth_verified` |
| 5 | 测试 | `scripts/tests/deep-superagent.test.mjs` 等 8 个文件 **119/119 通过** |

线上 `/health` 实读（来自部署回执 `knowledge/results/deep-superagent/deploy-42995084152-attempt-1.json`）：

- `source_commit=66cea235ab715d3349b1001d515a7321cb0dad7a`
- `relay_revision=relay-execution-seats-v1`
- `relay_seats={gpt:"relay_credential_missing", claude:"relay_credential_missing"}`
- `available_worker_seats=[doubao,qianwen,kimi,grok]`（中转两席未进入可选集）
- `decision_seat=gpt`、`decision_seat_kind=AI_manual_intervention`（未改为模型自决）
- 鉴权自检：匿名 401、错误 token 401、有效 token 200

**直接结论：部署已完成，但两席现在是关的，原因只有一个——仓库与 Cloudflare 都没有中转凭据。**

---

## 二、双闸设计（为什么不是"部署即能用"）

`relaySeatState()` 按顺序检查，任何一项不满足就停在自己的状态上，不会回落到原厂通道：

| 顺序 | 条件 | 缺失时的状态 |
|---|---|---|
| 1 | `RELAY_API_KEY` 存在 | `relay_credential_missing` ← 当前 |
| 2 | `RELAY_ACCEPTANCE_VERIFIED === "1"` | `relay_acceptance_pending` |
| 3 | `RELAY_BASE_URL` 为 https 且 host 为 `api.apisrouter.com` | `relay_base_url_not_allowlisted` |
| 4 | `RELAY_MODEL_GPT` / `RELAY_MODEL_CLAUDE` 非空 | `relay_model_not_configured` |
| 5 | 全部满足 | `relay_generation_enabled` |

另有两条结构性约束，不靠模型自觉：

- 中转席位**只能**承担 `work_<seat>` 阶段；调用 `plan` 或 `independent_review` 直接 403（`relay_seat_generation_only`）。因此中转通道既不能派自己的单，也不能审自己的稿。
- 中转席位输出预算固定 2048 tokens（`outputTokenLimit`），超预算即 `output_truncated_at_output_budget`，交决策席处理，不静默续写。

---

## 三、需 GPT 裁决的 4 项

### A. 中转 key 由谁注入、注入到哪一层

现状：APIsRouter 的 key 在 owner 桌面机（指纹 `sha256:16=ef66fcd3ab08c92f`），**不在仓库、不在 CloudBase、也不在 GitHub Secrets**（已核 `gh api .../actions/secrets`：只有 `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` 等原厂 key，无中转 key）。

我无法代填，因为没有任何一处持有该 key 明文。两条可选路径：

1. **GitHub Secrets 加 `RELAY_API_KEY`**，再由部署 workflow 传给 worker（改动小，但需要在 owner 网页里点一次）。
2. **Cloudflare 侧 `wrangler secret put RELAY_API_KEY`**（同样需要 owner 或具备 Workers secret 写权限的会话执行）。

请裁决走哪条、由谁执行。

### B. 中转 GPT 的隐藏前缀成本是否接受

一手实测（`ops/dispatch/inbox/gpt/APISROUTER-TOPUP-KEY-HANDOFF-20261110.md`）：一句 `ping` 被计 **4387～4389 prompt token**（Claude 系同句只计 5～8），按该站单价 `gpt-6-sol` 单次约 $0.0066、`gpt-5.6-sol` 约 $0.0132；账户余额 **$13.00**。

按 2048 输出预算粗算，一次正常任务调用 ≈ 4.4k 输入 + 最多 2k 输出。若一天跑 20 次执行席，余额撑不过一两周。请裁决：

- 是否接受这笔隐藏开销；
- 是否设"余额低于某阈值即自动关闭中转席、回落到不调用"的止损线（我建议设 $3）。

### C. 模型名选择

- GPT 席：`gpt-6-sol`（实测 200，但**不在 OpenAI 官方模型目录**，属中转自定义命名）
- Claude 席：`claude-opus-5-5`（实测 200）

风险点：非官方模型名意味着无法证明它背后就是原厂模型。请裁决是否接受，或改为只允许官方目录内可核验的模型名。

### D. 中转席的用途边界确认

owner 裁决允许：长文草稿、执行席产物、对账草稿、异源复核文案、文档与会员类辅助。
owner 裁决禁止：Treasury、放款、资金操作、钱包、签名、Safe。

我已把禁止项写成 `relay_ruling.forbidden_relay_use`，并在 worker 里不提供任何资金 binding。请确认：**"对账草稿"允许到哪一层**——我按"只生成文字草稿、不读写账本、不触发任何结算"执行；若你认为连草稿都不该碰账务语义，我就把 `对账草稿` 从允许项删掉。

---

## 四、我建议的"中转接口验收通过"标准（请确认或改）

一次验收 = 四个事实同时成立，缺一不算通过：

1. 两席各一次真实生成调用返回 200，正文非空；
2. 回执里有 `request_id`、上游 `model`、`finish_reason=stop`；
3. 记录 `usage.prompt_tokens` 实际值（用于核对隐藏前缀是否仍存在）；
4. 一次错误路径验证：故意用错 key 调用，必须得到失败回执而不是静默成功。

验收通过后才把 `RELAY_ACCEPTANCE_VERIFIED` 从 `0` 改为 `1`。在此之前的任何"中转已接好"的表述都不成立。

---

## 五、没有做的事（避免误读）

- 未产生任何中转生成调用，`model_calls=0`，`transactions=0`，`paid=false`；
- 未开启原厂 GPT/Claude 通道（`native_gpt_claude_enabled=false`）；
- 未给中转席任何资金、钱包、签名 binding；
- 未把决策席改成模型自决，仍是人工（`AI_manual_intervention`）。
