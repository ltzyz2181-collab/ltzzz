# ACK + 零生成对账结果：KIMI-LEASE-READBACK-20261105

**ACK**：我已认领 step `KIMI-LEASE-READBACK-20261105`，父任务 `DEEP-SUPERAGENT-20261103`，幂等键 `DEEP-SUPERAGENT-20261103/KIMI-LEASE-READBACK-20261105`，**只认领一次**，没有重复接单。回信送达不等于执行通过，以下为实际执行结果。

**执行边界（全部满足）**：`model_calls=0`、`upstream_attempts=0`、`reserve` 调用 0 次、`release` 调用 0 次、未触发 `kimi-native-audit`、未导出任何 Key、未改 token 兼容、未新增付费 cron、`paid=false`、`tx_hash=null`、无资金动作、未重放任何历史请求。

**回执入库**：`ops/deep-superagent/reviews/KIMI-LEASE-READBACK-20261105.json`，提交 `10c16431`（main）。`kimi-queue` 测试 6/6 通过。

---

## 一、先查到的既有证据（未新增生成）

1. **原任务与源码**：`workers/kimi-queue/index.js`、`scripts/agi-econ/kimi-cn.mjs`、`kimi-proxy-worker.js`、`wrangler.deep-superagent.toml`、`.github/workflows/deploy-kimi-queue.yml`、`ops/deep-superagent/probes/KIMI-POSTFIX-20261104-01.json`。
2. **Actions 侧零生成证据（历史）**：run `39513398586`，`success`，commit `4d5390d8`，观测时间 `2026-10-20T23:12:16.997Z`，回执 `knowledge/results/kimi/queue-39513398586-attempt-1.json`。读数：`ok=true`、`has_key=true`、`auth_configured=true`、`limiter_configured=true`、`limiter_mode=provider_limits_only_no_application_throttle`、`concurrency=null`、`min_interval_ms=0`、`model_calls=0`、`transactions=0`。**该证据距今 16 天，不是本轮新鲜读数。**
3. **本机侧（VM）**：DNS 正常解析（4ms），TCP/TLS 无响应，12s 超时 `http=000`，0 字节；重试 3 次一致。workers.dev 域在本机出口整体不可达，`model_calls=0`。

## 二、对账结论（代码级，6 条）

- **R1** 网关仅三条路由：公开 `GET /health`；受 `Bearer LTZZZ_AGENT_TOKEN` 保护的 `POST /reserve` 与 `POST /release`；其余 404。
- **R2** `/reserve` **不产生模型调用**：只生成 36 位 lease UUID（`expires_at=now+330s`），返回 `upstream_attempts:0`。但会写 lease 记录（有状态副作用），故按任务卡**未盲发**。
- **R3** **无预留即无生成**：拿不到 lease 时返回 `gateway_error` / `gateway_not_configured` / `not_configured`，`upstream_attempts=0`，不存在绕过租约的旁路。
- **R4** **释放闭合**：成功/失败都在 `finally` 里 `POST /release`（带 `outcome`），失败靠 330s 到期由 Durable Object `alarm` 清理；不重试、不重复计费。
- **R5（关键结构结论）** 生产 Kimi 代理 `api-kimi.ltzzz.com`（`kimi-proxy-worker.js`）**完全不引用租约网关**（grep `kimi-queue|lease` 零命中），Deep Worker 的 kimi binding 指向 `ltzzz-kimi-proxy` 而非 queue（`wrangler.deep-superagent.toml:22`）。**即"长任务改走租约"不是改配置就能完成，必须改 binding 或重写代理。**
- **R6** 双 token 不兼容仍在：网关用 `LTZZZ_AGENT_TOKEN`，`kimi-domestic` 用 `KIMI_WORKER_TOKEN`。按任务卡未做兼容改造，只记录。

## 三、写死的 blocked（具体到缺什么执行器）

- **B1｜Actions 侧本轮实时可达性复测**：现成零生成探针只有 `deploy-kimi-queue.yml` 里的 `/health` 回读步骤，但该工作流是部署型（会 `wrangler deploy` + `secret bulk` 写生产），不能当纯探针；本轮 gh 凭据无 workflow scope。需要**一个只含 `GET /health` 的独立 `workflow_dispatch` 探针**（不部署、不生成）。
- **B2｜租约鉴权实测（401 vs 200）**：要以正确 Bearer 打 `/reserve` 才能区分"鉴权通过"与"token 不匹配"，这会新建 lease 记录，与"不要盲发 reserve"冲突；本机也不持有 `LTZZZ_AGENT_TOKEN` 值（按要求不导出）。只核到元数据 `auth_configured=true`。需要**受保护的只读 `GET /auth/check` 只回布尔**，或由 runner 侧探针代测。
- **B3｜reserved vs released 数量对账**：lease 存在 Durable Object storage 内，网关无只读导出端点；`/release` 需合法 lease UUID 且改状态，零生成前提不可用。需要**只读 `GET /leases/count`（Bearer 保护、不返回 UUID/Key）**，或 DO 侧定时导出脱敏计数。

## 四、边界声明

Kimi 524 定性不变（CF 100s 窗口 + 同步代理无上游超时，与模型选型无关），`98426842` 已部署并以 90s 主动超时改为可判别 504。Treasury #351、WEP3 交易适配、Kimi 长任务三线仍分开验收，本回执不冒充其通过。本机出口不可达是**测量点问题**，不代表网关已挂——Actions 侧 10-20 的成功回读证明它当时在线。

—— 豆包席（doubao）
