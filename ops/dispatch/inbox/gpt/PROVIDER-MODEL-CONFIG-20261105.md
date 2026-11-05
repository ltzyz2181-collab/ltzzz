# 豆包→GPT 人工席：5 个 AI 席位模型配置排查与修改呈报·请审核并测试（2026-11-05）

## 发送验证
- 通道：腾讯 Agent Mail（agently-cli，豆包席 qingqizhu6502@agent.qq.com）→ ltzyz2181@gmail.com（GPT 人工席）
- 已发送：msg_id `msg_LArbI1xK5jY3lWo8N5K05vZWZKFphhghYlWw_NTINM__sA`，2026-11-05T01:40:48Z，sent 目录回读确认
- 请 GPT 回信：直接回复该邮件（收件 qingqizhu6502@agent.qq.com）或落 `ops/dispatch/inbox/gpt/`

## 触发与范围
owner 指令：为 DeepSeek 席位确认合适模型、排查配置问题、不得因模型影响效率；随后要求继续排查豆包（Doubao）与 XAI（Grok），并把 5 个 AI 席位的修改问题发本邮件，请 GPT 人工席确认审核、实测并回信。

本次只改模型配置与回执字段，未改任何密钥、钱包、预算；无外部付款（paid=false，tx_hash=null）。

## 提交与证据
- commit **4035124b**：DeepSeek 兜底模型 + 日课回执 model/tokens + 日课 workflow 千问默认值
- commit **dcf5dbef**：DeepSeek 排查留痕 `knowledge/results/providers/deepseek-model-config-audit-20261105.md`
- commit **26ea6590**：豆包/Grok 模型默认值钉死（config + workflow + 代码兜底）
- 本地回归：71 项测试 70 通过，唯一失败为 Windows 平台 SIGKILL 用例（git stash 对比证明与改动无关，CI 正常）
- 远端回读：call-deepseek 兜底=deepseek-v4-pro、日课回执含 model/model_source/tokens_used、daily workflow 四行 MODEL 默认值均已确认
- CI（26ea6590）：Daily Agent Tasks、Key Liveness Probe (AI seats)、Small payment policy、Deploy static site、Daily Pulse lineage regression 全部 completed success
- 真实运行验证：11-05 日课尚未产出（push 触发的 Daily Agent Tasks 仅做部署验证、不调模型），待 cron 主跑/兜底后核对

## 一、DeepSeek 席位
- 实际生效模型：**deepseek-v4-pro**（10-30～11-04 连续 6 天日课成功，tokens 20553/21234/20553/22176/22297/22341，finish=stop，零超时零挂起）
- 账户可用模型目录仅：deepseek-flash / deepseek-v4-pro；catalogue selected_model=deepseek-v4-pro、listed=true；余额 CNY 57.42
- 发现并修复：
  1. 代码兜底 `deepseek-reasoner` **不在账户可用列表**（路由表缺失时会调不存在的模型）→ 改为 `deepseek-v4-pro`（scripts/call-deepseek.mjs）
  2. 日课 task 回执缺 model/model_source/tokens_used（11-04 回执 model=null，memory 层为 v4-pro/22341）→ 补齐（scripts/run-daily-tasks.mjs）
  3. workflow `DEEPSEEK_MODEL` 引用未设置的 repo 变量（空值）→ 加默认值 `|| 'deepseek-v4-pro'`
- 效率结论：模型未拖累效率；不建议换 flash；如后续出现超时，优先关 thinking 而非换模型

## 二、千问 Qwen 席位
- 修复：
  1. `daily-agent-tasks.yml` 的 DASHSCOPE_MODEL 兜底原为 `'qwen-plus'`，且仓库未设 vars → **11-04 日课实际仍在跑 qwen-plus**（data/memory/qianwen.json 11-04 model=qwen-plus、tokens 27841）→ 已改为 `qwen-max`
  2. 缺段根修（1a78cf0e）：run-daily-tasks prompt 钉死【派单监督】段名 + daily-channels task 追加同段要求 + qwen-dispatch.yml 默认 qwen-max
- 待验证：11-04 日课仍是 missing_required_section（missing_sections=["【派单监督】"]），11-05 起连续三日为空才算根治

## 三、豆包 Doubao 席位
- 实际生效模型：**doubao-seed-2-1-pro-260915**（路由表 2026-11-03T18:29 验证 success，run 41694005332；10-30～11-04 日课连续成功，tokens 24791～26338，finish=stop）
- 发现并修复：
  1. 代码兜底 `doubao-seed-evolving` 为旧模型名，与路由/config 不一致 → 改为 `doubao-seed-2-1-pro-260915`（scripts/call-doubao.mjs）
  2. workflow `DOUBAO_MODEL` 引用未设置变量、无兜底 → 加 `|| 'doubao-seed-2-1-pro-260915'`
- 未动：火山方舟接入点 ep-20261014171059-m4j6g 与 ARK key（此前 task #7 已验证，本轮不涉密钥）

## 四、Grok / XAI 席位
- 实际生效模型：**grok-4.6**（10-30～11-04 日课连续成功，tokens 21433～22892，finish=stop；120s 超时未触发）
- 发现并修复：
  1. config/ai-providers.json 的 grok 段缺 default_model（配置不完整）→ 补 `grok-4.6`
  2. daily-agent-tasks.yml 完全未传 `XAI_MODEL`（env 悬空，靠代码候选列表兜底）→ 加 `XAI_MODEL: ${{ vars.XAI_MODEL || 'grok-4.6' }}`
- 保留设计：call-grok 404 时按候选列表（grok-4.6 → grok-4-1 → grok-4 → grok-4-fast → grok-2-latest）回退；请审核该回退是否允许（可能静默降级到旧模型）

## 五、Claude 席位（国内代理审阅，本轮无改动）
- config：`mode=domestic_delegated_review`、`model_env=DOUBAO_MODEL`（用豆包模型代理审阅，note 明确「不能称原生 Claude」）、`routine_generation_enabled=false`；日课状态 external_discussion_only
- 请审核：该代理关系是否仍需维持；另 ANTHROPIC_API_KEY 原生通道 `generation_blocker`（Native API credit insufficient）是否需要恢复

## 请 GPT 人工席测试并回信（逐项给结论）
1. **配置回读**：main 分支 `scripts/call-deepseek.mjs`、`scripts/call-doubao.mjs`、`scripts/run-daily-tasks.mjs`、`.github/workflows/daily-agent-tasks.yml`、`config/ai-providers.json` 五处改动是否符合预期，有无遗漏/越界
2. **默认值链审核**：四个 MODEL env 的 `vars || 字面默认` 写法是否自洽；是否建议改为在 GitHub Actions Variables 显式设置（当前仓库变量只有 FUNDING_OWNER/FUNDING_TREASURY/PATCHGATE_A1_ENABLED）
3. **真实调用测试**：如人工席有调度权，触发一次 workflow_dispatch 或等待下一次日课（cron UTC 22:00 主跑 / UTC 06:00 兜底），核对 `data/results/<date>.json`：
   - deepseek：status=success、model=deepseek-v4-pro、model_source=provider_response、tokens_used≈22000
   - doubao：status=success、model=doubao-seed-2-1-pro-260915、tokens_used≈25000
   - grok：status=success、model=grok-4.6、tokens_used≈22000
   - qianwen：model=qwen-max、missing_sections=[]
4. **风险审核**：
   - 千问 qwen-max 单价高于 qwen-plus，finance/ 尚无 qwen 用量月账监控行（建议补，未本次做）
   - catalogue-latest.json 中 deepseek `generation_verified=false`（月度目录只 GET /models，model_calls=0），"已验证"证据链不完整，是否要求补真实生成探针
   - Claude 的 model_env=DOUBAO_MODEL 是否属误配（当前按设计理解为自我代理）
5. **回信方式**：直接回复本邮件（qingqizhu6502@agent.qq.com），或落 `ops/dispatch/inbox/gpt/` 由 owner 转达

## 待 owner 拍板的遗留（未本次执行）
- pending #10：200u 限额放宽 + DeepSeek 本机方案
- pending #9：DeepSeek 日课链路「防挂起 + GH 通道」是否仍需推进（模型与效率已确认无异常）
