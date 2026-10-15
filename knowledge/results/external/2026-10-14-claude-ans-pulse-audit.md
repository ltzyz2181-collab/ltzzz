# Claude 审核回执 · ANS / Pulse v0.1 → v0.2 · 2026-10-14

> 署名：Claude（Anthropic）· 外部审稿席，无 Safe 投票/签名权，不持有任何 Key。
> 本回执只对"代码和设计文档"负责，**不代表已部署、不代表线上验证**。
> 依据：owner 提供的《AI植物神经系统（ANS）完整分析与部署方案》.doc 与 Pulse v0.1（pulse.yaml + index.js + wrangler.toml + 部署步骤）。
> 传递：Claude 对仓库无写权限（推送被拒），本文由 owner 转交总控上传，原文未改动。

## 一、结论
- ANS 的**方向成立**：分层（底层稳态 / 上层推理）、规则优先、配置进 git、核心指标不超过 8 个、ANS 不做业务决策。这几条我都同意。
- Pulse v0.1 **按原样部署会直接跑不起来**，另有几处会让它"看起来在监控、其实没在监控"。已在 v0.2 修正。
- 阶段 1 只做 3 项检查是对的。阶段 2–4 在阶段 1 跑出两周真实数据之前不要开工（观 → 行深）。

## 二、对 owner 的 3 个问题
1. **YAML 解析：选 B（改成 JSON，随 Worker 打包）。** 原因不只是省库：配置随代码部署，改阈值必须走 PR + 重新 deploy，不会被谁在 main 上悄悄改掉。v0.1 的占位实现读 `process.env.PULSE_CONFIG_JSON`，Workers 里没有 `process.env`，且返回 `{}`，每轮都会因 `config.checks` 为空而崩。
2. **USDC 地址：`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` 是 Base 主网官方原生 USDC，没写错**（对照 Circle 官方合约地址页 https://developers.circle.com/stablecoins/usdc-contract-addresses ）。**但不建议依赖 Basescan**：Etherscan 已把各链接口合并到 V2（单一 key + `chainid` 参数，见 https://eco.com/support/en/articles/14895612-block-explorer-apis-compared-2026-etherscan-blockscout-routescan-helius ），免费额度文档自己也说会变；我无法确认旧的 `api.basescan.org` 路径对你的 key 是否仍可用。v0.2 改为直接向 Base RPC 做 `eth_call balanceOf`，不需要任何 API key。
3. **告警阈值：** "连续失败 3 次"（15 分钟）合理、误报低，但 v0.1 **根本没实现**（无状态，且只在"全部 Agent 同时宕"时才告警）。v0.2 用 KV 存计数，按 Agent 单独计。余额 `< 10 USDC` 可保留，但建议同时看**突然减少**（v0.2 增加 `alert_if_drop_usdc: 5`）：余额低是慢变量，突然少钱才是真正要盯的事。

## 三、v0.1 问题清单与处理
| # | 级别 | 问题 | v0.2 |
|---|---|---|---|
| 1 | 阻断 | `parseSimpleYaml` 占位 + `process.env`，每轮崩溃 | JSON 打包 |
| 2 | 阻断 | 钱包地址 `0x21F5...7fdc` 是缩写，不是合法地址 | 校验 `0x`+40 位，不合法明确报 `config_error` 并告警；**完整地址只能 owner 自己填，Claude 不猜** |
| 3 | 高 | 告警无去处：Telegram 关闭；"写回仓库 events.jsonl" Worker 没实现，也不该有写仓库权限 | 告警存 `/status`；Telegram 可选；README 如实写明"没配渠道就没人被提醒" |
| 4 | 高 | `alert_if_consecutive_fail` 未实现 | 每 Agent 独立计数 |
| 5 | 高 | `/run` 公开 GET：任何人可触发并读到余额；可刷 RPC 额度 | `POST` + Bearer；未配 `PULSE_TOKEN` 返回 503（与 SEC-010 的 fail-closed 一致） |
| 6 | 中 | 运行时从公开 `main` 拉配置：谁能推 main，谁就能改监控目标/阈值，Worker 会去请求任意 URL | 配置打包；心跳目标限定 `https` 且主机名以 `.ltzzz.com` 结尾 |
| 7 | 中 | 每 5 分钟重复同一条告警 | 冷却 60 分钟，恢复后重置 |
| 8 | 中 | R2 追加写 `prev + line` 是读-改-写：越来越慢、并发会丢数据；KV 每轮多次写入，免费档每天 1000 次写入易踩线 | 每轮 1 次 KV 写（288/天）；历史只在整点或有告警时存，TTL 30 天；去掉 R2 |
| 9 | 低 | `checkFailureRate` 在文件不存在/非 JSON 时返回 `error` | 返回 `skip`，不误报 |

## 四、对 ANS 设计文档的意见
**保留：** 内感受 → 稳态判断 → 交感/副交感 → 反射弧的分层；"ANS 不替 AI 做任务决策"；规则放 git、误触发写进 Result Center 迭代。

**需要加入设计约束的三处：**
1. **只收紧、不放松（ratchet-only）。** 文档里反射弧写"触发资产冻结钩子"，Homeostat 写"调节资本 AI 可动用资金上限"。建议硬规则：ANS 只能做"暂停派单 / 调低上限 / 告警"，**永远不能调高上限、不能转钱、不能持有任何签名私钥**；放松只能由人在 Safe 里操作。"冻结"实现为其他 Worker 读取的 fail-closed 开关，而不是一把有权限的钥匙。理由：能自动动资金的钥匙就是新的攻击面；被伪造的信号最多让系统"变保守"，最坏是误停，不是丢钱。
2. **传感器必须独立于被感知对象。** Interoception 的数据源应是链上 RPC、HTTP 状态码这类 AI 改不了的东西，不能是 AI 自己写的结果文件（规则：`AI 回复 ≠ 实际结果`）。`latest-10.json` 若由 AI 生成，只能作为"参考指标"，不应单独触发"冻结"。
3. **ANS 自己也要被独立通道监控**（文档第六节已提到自检）。最简单：GitHub Actions 每小时请求 `/status`，检查 `ran_at` 是否在 15 分钟内；Pulse 死了不能只靠自己报。

**需要标注"未核实"的内容：** 文档第一节列的 ZenoWell 论文《Do AI Agents Need a Virtual Autonomic Nervous System?》、MeridianAI《Seven Agents One Body》、APUS Reflex Agent、Night Shift (Zeltrex) 等，我用搜索核对了其中几项，**没有找到可确认的来源**；IntuiCell 印象中是真实公司，但本次未核实。**核实前不要把它们当事实写入 文明研究.md / 重要事件.md。** 站得住的是 IBM 自主计算（Autonomic Computing，MAPE-K：监测-分析-规划-执行 + 知识库），足够当 ANS 的理论依据。
另：把"魄"对应为"系统长期惯性/偏移"是设计类比，按 魄.md 校注口径应标成"类比"，不是机制。

## 五、给部署 AI 的任务单
1. `workers/pulse-worker/`：跑 `node test.mjs`（必须 7 passed）→ 按该目录 README 部署 → 贴验收回执（含 `/status` 原文、wrangler 版本号）。
2. 完整钱包地址、`PULSE_TOKEN`、（可选）Telegram Bot：**只能 owner 本人在终端输入**，任何 AI 不得索取、不得要求贴进对话。
3. 3 个心跳地址（`api-{doubao,kimi,grok}.ltzzz.com/health`）与 `latest-10.json` 需实测；不对就改 `pulse.json` 并走 PR。
4. 未部署前，任何记录只能写 `proposed / reviewed`，不得写 `deployed`。
5. 阶段 2–4 暂缓；阶段 1 稳定运行 ≥ 14 天、记录误报率后再评估。

## 六、我没有做、也无法确认的
- 没有部署；没有访问过任何 `*.ltzzz.com` 的 health 接口（我的环境访问不到）；没有链上读取过你们的钱包。
- 测试是本地 mock 网络的逻辑测试（7 项），**不能证明线上可用**。
- 没有改动 main 上任何已有文件；对仓库没有写权限。
