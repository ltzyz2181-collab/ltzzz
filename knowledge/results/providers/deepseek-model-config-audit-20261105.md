# DeepSeek 席位模型选型与配置排查（2026-11-05）

## 结论一句话
选型正确：DeepSeek 应继续用 **deepseek-v4-pro**（账户目录唯二模型之一、已验证、连续 6 天真实生成成功）。发现 3 处配置缺陷并已修复（commit 4035124b），其中一处是千问升级漏点：**11-04 日课千问实际仍在跑 qwen-plus**。

## 一、排查范围与证据
- 代码：`scripts/call-deepseek.mjs`（默认链 model > DEEPSEEK_MODEL > routedModel > 兜底）、`scripts/model-routing.mjs`、`scripts/lib/deepseek-stream.mjs`
- 配置：`config/ai-providers.json`（deepseek.default_model=deepseek-v4-pro）、`data/model-routing/latest.json`（deepseek.model=deepseek-v4-pro）、`data/tasks/daily-tasks.json`
- 运行：`data/memory/deepseek.json`（10-30～11-04 六天：model=deepseek-v4-pro，tokens 20553～22341，finish=stop，全部成功）、`data/results/2026-11-04.json`（deepseek status=success，但 task 回执 model=null/tokens=null）
- 账户目录：`knowledge/results/providers/catalogue-latest.json` → deepseek.models 仅有 **deepseek-flash / deepseek-v4-pro**，selected_model=deepseek-v4-pro、listed=true、balance CNY 57.42、generation_verified=false（model_calls=0，仅 GET /models）
- GitHub：repo variables 仅有 FUNDING_OWNER/FUNDING_TREASURY/PATCHGATE_A1_ENABLED，**无 DEEPSEEK_MODEL、无 DASHSCOPE_MODEL/QWEN_MODEL**
- workflow：`daily-agent-tasks.yml` L106 DEEPSEEK_MODEL=${{ vars.DEEPSEEK_MODEL }}（空值）、L111 DASHSCOPE_MODEL 兜底仍为 'qwen-plus'

## 二、发现的问题（3+1）
1. **兜底模型失效（真隐患）**：call-deepseek.mjs 兜底 `routedModel('deepseek','deepseek-reasoner')`，而 deepseek-reasoner **不在账户可用模型列表**（列表只有 flash/v4-pro）。若 data/model-routing/latest.json 缺失或损坏，会直接调用不存在的模型 → 必失败。
2. **日课回执缺模型/成本字段**：run-daily-tasks.mjs L221 task 回执不含 model/model_source/tokens_used（memory 层 L211 有），导致 11-04 回执 model=null，监督/审计无法从日课结果层证明实际模型（千问同病）。
3. **日课 workflow 千问兜底未随升级更新（漏点）**：daily-agent-tasks.yml L111 `${{ vars.DASHSCOPE_MODEL || vars.QWEN_MODEL || 'qwen-plus' }}`，仓库未设 vars → 11-04 日课千问 **实际模型 qwen-plus**（data/memory/qianwen.json 11-04 model=qwen-plus、tokens 27841）。11-04 的 qwen-max 升级只覆盖了 qwen-dispatch.yml（派单消费通道），**未覆盖日课主链路**。
4. **DEEPSEEK_MODEL 变量未设置**：workflow 引用 vars.DEEPSEEK_MODEL 但仓库无此变量，当前靠代码 routedModel 兜底生效（功能正常但配置悬空）。

## 三、修复（commit 4035124b，本地 VS Code 仓库推送，含 workflow 文件）
1. `scripts/call-deepseek.mjs`：兜底 `deepseek-reasoner` → `deepseek-v4-pro`（与账户目录/路由表一致）
2. `scripts/run-daily-tasks.mjs` L221：task 回执补 `model / model_source / tokens_used`（provider_response 证据可落到日课结果层）
3. `.github/workflows/daily-agent-tasks.yml`：
   - L106 `DEEPSEEK_MODEL: ${{ vars.DEEPSEEK_MODEL || 'deepseek-v4-pro' }}`（显式钉死默认）
   - L111 `DASHSCOPE_MODEL: ${{ vars.DASHSCOPE_MODEL || vars.QWEN_MODEL || 'qwen-max' }}`（千问升级在日课主链路补生效）

## 四、效率评估（用户要求「不要因为模型影响效率」）
- 10-30～11-04 六天 DeepSeek 日课：tokens 20553/21234/20553/22176/22297/22341，finish_reason 全部 stop，无超时、无挂起、无状态异常 → **当前模型没有拖累效率**。
- tokens 偏高（日课约 300 字输出消耗 ~22k）主要是 thinking enabled 的 reasoning token；240s 超时（call-deepseek AbortSignal.timeout）下六天均正常完成，未触发超时。
- 换 flash 可提速降本，但需重新做真实生成质量验证（成本与返工），且日课为质量任务，**不建议现在换**；维持 v4-pro + thinking enabled。
- 若后续出现超时/挂起，优先方案：日课 deepseek 显式 thinking='disabled'（call-deepseek 已支持），而非换模型。

## 五、验证
- 本地测试：daily-task-board / daily-assignment(+handover/control-id) / qwen-dispatch 共 71 项，70 通过；唯一失败为 Windows 平台 SIGKILL 测试（git stash 对比证明与本次改动无关，VM/CI 正常）。
- 推送：19a99332..4035124b main。远端回读：call-deepseek 兜底=deepseek-v4-pro、日课回执含 model 三字段、workflow 两处默认值均确认。
- CI（4035124b）：Daily Agent Tasks、LTZZZ Skill review and integration、Small payment policy、Owner domestic AI inbox、Daily Pulse lineage regression 全部 completed success。
- 观察（下次日课跑后核对 `data/results/<date>.json`）：deepseek.model=deepseek-v4-pro、model_source=provider_response、tokens_used≈22000；qianwen.model=qwen-max、missing_sections=[]（连续 3 天达标才算根治）。

## 六、遗留（未本次处理）
- catalogue-latest.json 的 deepseek `generation_verified=false`（月度目录只做 GET /models，model_calls=0）；model-routing 的 verified 指向 WEP3 部署 run 41761975594（非专门生成验证探针）。建议下次月度 provider-readiness 对 deepseek 补一次真实生成探针（成本极小），使"已验证"有直接证据。
- GitHub 未设 DEEPSEEK_MODEL/DASHSCOPE_MODEL 变量：当前靠 workflow 与代码双兜底，功能正常；是否显式加变量由 owner 决定。
- 200u 限额放宽 + DeepSeek 本机方案（pending #10）仍待 owner 拍板，本次未动。
