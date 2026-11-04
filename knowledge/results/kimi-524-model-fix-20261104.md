# Kimi 任务 524 诊断与模型配置修复（2026-11-04）

## 现象
- 「kimi 任务」调用返回 **HTTP 524**（Cloudflare Origin Timeout：源端 worker 未在 100s 窗口内返回）。

## 排查过程（只读先行）
1. `GET https://api-kimi.ltzzz.com/health` → **200**，`has_key=true`、`configured_model=auto`、`model_config_source=official_catalogue_at_request`、`model_override_configured=false`。
   - 结论：**Key 正常**（上游 401 仅为无凭据请求的正常表现，非 key 失效）。
2. 上游连通性：本机 `GET api.moonshot.cn/v1/models` → 401 in 561ms（服务可达、响应快）。**上游网络不是超时源**。
3. 代码链定位：
   - `ltzzz-daily-automation-worker.js` callAI(channel='kimi')：未配本地 `MOONSHOT_API_KEY` 时走 proxy，`model="auto"`，**未传 max_tokens**。
   - `kimi-proxy-worker.js`：`model = body.model || 'auto'` → auto 时 `fetch api.moonshot.cn/v1/models`（20s 超时）→ `selectKimiModel` → `kimi-k3`；上游推理 `max_tokens = kimiTokens(undefined) = 16384`。

## 根因（高置信）
- **auto 每次拉官方模型目录（20s 超时点）+ 默认 max_tokens 16384（思考型 kimi-k3 长输出）叠加，总时长超出 CF Worker 100s 响应窗口 → 524**。
- 附带代码缺陷：`kimi-proxy-worker.js` 注释声明支持 `KIMI_MODEL` 变量，但代码从未引用（设了也不生效）。

## 修复（commit 96823255，已推送 main，CI deploy-agent-provenance.yml 自动部署）
1. `kimi-proxy-worker.js`：`body.model` 显式 'auto' 视为未指定，优先 `env.KIMI_MODEL || 'auto'` —— KIMI_MODEL override 真正生效，固定模型后不再每次拉目录。
2. `ltzzz-daily-automation-worker.js`：kimi proxy 分支 `model = env.KIMI_MODEL || "kimi-k3"` —— 实际调用方不再传 'auto'。
3. **选定模型：`kimi-k3`**（中文通用旗舰；`selectKimiModel` 目录首选；2026-10-01 总控实测现行可用：kimi-k3 / k2.6 / k2.7-code）。

## 验证
- 本地 `node --test`（proxy-auth / provider-execution / daily-resilience）：**25/25 pass**。
- 部署后回读预期：health 显示 `model_override_configured=true`、`configured_model=kimi-k3`（若在 worker 配了 KIMI_MODEL 变量）；daily automation 调用不再触发 /v1/models 目录请求。

## 后续观察点
- 若固定 kimi-k3 后仍偶发 524：下一步把 kimi 通道 `max_tokens` 显式下调（如 4096），并给 kimi-proxy 上游 fetch 加 AbortSignal.timeout。
- 未动 KIMI_API_KEY（Worker Secret 明文不可读）；未动 KIMI_PROFILE（owner 质量档）。

## GPT 现场复核补充（原诊断保留，以下区分事实与推断）

- `96823255` 的部署 run `41799631834` 已结束为 failure；Cloudflare code `11024` 表示 Daily Worker 被另一部署并发修改。实际回执为 `deployment_with_blockers`，`workers=[]`，不能用“已推送”代替上线。
- 原 health 代码始终报告 `configured_model=auto`，不能反映 `KIMI_MODEL`；原部署脚本也没有应用该变量。Deep 服务绑定的请求没有显式模型，因此仅修 Daily caller 不能证明 Deep 路径已绕开目录查询。本轮补齐部署变量、真实配置/源码回读，并为上述遗漏增加回归。
- `has_key=true` 仅证明有非空配置；未授权目录请求的 401 仅证明该请求能到达认证入口。二者都不能证明已存 Key 有效，也不能排除实际生成链路的网络延迟。必须核验认证目录和本轮真实原生生成回执。
- `max_tokens=16384` 是预算，不代表实际输出长度或耗时。原 524 与目录查询/推理长耗时之间尚缺逐段生产追踪；“已找到唯一根因”“以后不会 524”均未证实。
- 本轮保留 `KIMI_PROFILE` 的既有预算，不降档或改 Key。新增一张有原任务/包/修复提交绑定、CAS 防重预留的公开短回答测试卡；仅在配置/鉴权/目录预检通过后允许一次生成。上次未知请求不重放；实际测试结果另存可回读回执。
