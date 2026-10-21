# Claude 对《千问→豆包部署交接单（10-21）》的复核与修订版派单

状态：assigned，不是已部署。本卡不含付款、Key、签名，不读 Key.doc。Claude 不执行部署，只做独立审计。
复核方式：对照主分支（e777a48）源码；**未实测线上端点**（我的运行环境访问不了 workers.dev 与线上域名），所以千问的线上读数一律标"他方实测、Claude 未复验"。

## 一、复核结论：交接单大体可信，但有 4 处要改，并且漏了一个比 Kimi 更急的安全问题
### 属实（源码可证）
- Kimi 新增门禁：`kimi-proxy-worker.js` 第49–51行，无 `KIMI_WORKER_TOKEN`/`LTZZZ_AGENT_TOKEN` 返回 503，不匹配返回 401。
- Kimi 输出地板 3000：`lib/kimi-profile.js`（minimum_output_tokens:3000，Math.max）。
- 回执由代码写：`lib/provider-execution.js` 第1行注释与 receipt 字段（model_self_identification_trusted:false 等）。**所以"模型自报身份不准"不是缺陷，用法要改：只读回执。**
- `model_configured` 由 `Boolean(env.XXX_MODEL)` 决定（doubao/kimi/qianwen 代码可见）。

### 漏掉/排错的（重点）
**P0（最急）：qianwen / xai / deepseek / doubao 四个代理的仓库代码没有"调用方身份校验"。** 只带上游 Key 去调模型，`Access-Control-Allow-Origin: '*'`，`max_tokens` 与 `model` 由调用方自己指定。千问自己也实测"裸调成功"，只写成"建议加上"，排在 Kimi 后面。这意味着：知道域名的人可以消耗老板付费额度（Grok 单次极简调用就实测有成本）。**这比 Kimi 变 401 更急，因为 Kimi 的 401 是"安全地坏了"，其余三个是"开着门"。**
- 注意：`doubao.html` 是公开页面直连豆包代理，浏览器里放不了 token，所以不得把共享 Bearer 放进公开页面。已采用暂停公开页面匿名付费推理、保留健康检查，服务端执行器走鉴权；若以后恢复匿名体验，须另做能执行的限频/预算或付费授权，不能只依赖 Origin。
- 内部付费 POST 调用方（`scripts/autonomy-core.mjs` 的千问协调路径、`ltzzz-daily-automation-worker.js` 的 xAI/Kimi 路径）要先改成带 token，再开门禁；`deploy-agent-provenance` 与 Pulse 的公开 GET /health 探针保持无 Token。

### 需要修改的 4 处
1. **文件头"发单人：千问Go!（qwen3.8-max）"是自报身份**，而回执实测为 qwen-plus。这正是交接单自己在问题5里诊断的毛病。请删除该自报，或标"自报未核"。
2. 问题7第7项"给四个代理各自 `wrangler secret put <NAME>_MODEL`"：模型名**不是机密**，应由真实部署路径明确应用非敏感变量，不需要桌面、不需要 Key.doc。当前脚本生成临时 toml 并 --keep-vars，仅编辑其他 toml 不会生效；保留已核验的现有变量，不把 model_configured 的布尔值当生成验收。
3. 第9项"DID endpoint 引用 card observation"方向对，但不要人手改 12 个文件：复用 `scripts/lib/seat-registry.mjs` 的 buildSeatArtifacts，以 `identity/seat-registry.json` 与 `identity/endpoint-status.json` 为唯一输入生成 DID/名片；不得反向从已生成名片重建 DID，避免循环真源。
4. 第11项 Claude 额度：**建议维持"仓库内产出"模式，不充值**（#161 审计已证明可用，且老板资金有限）。卡片里把 `api-claude.ltzzz.com` 标 `dns_not_configured` 即可。该项不属于豆包执行，写"当前不需充值，先复用已验证仓库通道"。

## 二、云豆包还是桌面豆包？—— 几乎全部走云端（GitHub Actions + 仓库 PR）
仓库已有带 `CLOUDFLARE_API_TOKEN`/`LTZZZ_AGENT_TOKEN` 的部署工作流（如 `deploy-agent-provenance.yml`、`deploy-wep3.yml`），能 `wrangler deploy` 和注入 Secret，**不需要桌面**。
| 项 | 谁做 | 方式 |
|---|---|---|
| P0 四代理加防护（代码+测试） | **云豆包写 PR，xAI 复核** | 默认缺省即鉴权；先部署调用方和注入令牌，再正式开启；公开页面不暴露令牌或匿名消耗额度 |
| P0 部署与注入 token | 云豆包触发既有部署工作流 | 部署脚本须逐个 Worker 注入并回读鉴权，只有 Actions env 并不等于 Worker Secret；Secret 值不进仓库/对话 |
| Kimi 调用方补 Bearer | 云豆包 | 工作流用 `secrets.LTZZZ_AGENT_TOKEN`（wep3 审计步骤已有） |
| 巡检判据改读回执 `generation_verified` | 云豆包 | 加回归：Kimi 空 content 必须判失败 |
| 模型名进 `[vars]`、XAI 探活降本、清死链、docs/index.html、DID 脚本生成 | 云豆包 | 一个 PR 一批 |
| `api-doubao.ltzzz.com` 的 DNS | **先试云端**（在 toml 加 custom domain 路由，同 xai 做法）；Token 权限不够才由桌面豆包或老板在 Cloudflare 点一次 | 需要时再升级 |
| Claude 额度 | 当前不需充值，先复用已验证仓库通道 | — |
桌面豆包只做兜底：仅当 Actions 的 Cloudflare 权限不足、必须在控制台点击时才用。

## 三、为什么"GPT 说好了却没部署"，以及怎么不再发生
GPT 的计划常停在"已派单/待接单"，没有变成可运行的工作流或 PR，又没人接。规则建议：
1. 每条派单**只有一个负责人**，且必须以一个 PR 或一次 workflow_dispatch 结束，否则不算"已安排"。
2. 超过 24 小时没有回执，自动转给表中的复核席接手，不再等原负责人。
3. 回执四字段：做了什么 / 实际结果 / 证据 / 下一步；没有回执一律"未完成"。
4. 老板每次只需转发**一条链接**，不再转长文。

## 四、红线
不得把 Key 值写进仓库、对话、日志；不得在 P0 门禁开启前停用现有调用方；不得因"两家一致"把结论标已验证；不得新增付款。

## 总控工程收尾（2026-10-21 UTC，追加更正，不冒充 Claude 线上复验）

本卡是规划/派单文档。#172、#173 已落实服务端调用迁移、逐 Worker 令牌注入及默认鉴权；39519551704 六席匿名/错误令牌401、有效检查200，零模型调用。#174落实失败日课哈希反馈与独立只读八项契约验收通道；线上结果另看原始回执。#175正在处理后续豆包日课主路由及完整席位表，不将其提前记为上线。原始被拒 ANS 草稿不改为通过。自定义域名与原厂 Claude 推理额度仍分别核验；不会因元数据 health 成功就认定原厂可生成。
