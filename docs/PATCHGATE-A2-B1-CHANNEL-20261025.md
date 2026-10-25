# A2 B1：实际提供商签名与 Claude 外部审计分开

类型：总控通道决定与未启用实现。原任务 `PLAN-PATCHGATE-ESCROW-20261023`。来源为 Claude 审计 PR #244，head `662bc65105def376658c820e5dada0eedb0c070e`，报告 `knowledge/results/patchgate/a2-claude-audit-f64175f.md`。原始 REVISE 不覆盖，也不能作为新版本的批准。

## 决定

采用 #244 B1 的第二条路径：密码准入由千问执行器（`aliyun_dashscope`）与豆包执行器（`volcengine_ark`）分别签名。不是让模型本人持钥；各受信执行器只使用自己隔离的 Secret、私钥与登记公钥，一执行器只对应一个实际提供商。原有“必须取得 Anthropic Ed25519 签名”的不可实现配置移除，不由 GPT 或 Pi 伪造 Anthropic 签名。

Claude 仍必须对阶段新版本交 PR 审计。其通道是仓库 PR/file 的不可变回读，另由 `github_actions` 基础设施执行器签 `external_audit_readback`。这份基础设施证明只证明读到了哪个 PR、head、原始文件、审计结论及代码 bundle；**不证明原生 Anthropic 身份，也不计入两家模型签名数量**。共享 GitHub 账号不能证明原生提供商，因此本次不采用“独立账号已配好”的假设。

代码强制三个条件并存：两家原生提供商执行器 stage_review、另一个 Claude PR 回读证明、完整既有 A2 条件。缺任何一项即阻断。候选作者的实际提供商仍不得与任一候选复核者相同；Git commit 邮箱或模型自报不是身份依据。

## 新的程序契约

- `required_stage_auditors` 与 `required_candidate_review_providers` 固定为 `aliyun_dashscope`、`volcengine_ark`。不能改成逻辑 Claude，不能用基础设施替代任何一家。
- `claude_audit_channel` 要求 PR 回读，`native_authorship_verified=false`、`counts_toward_model_quorum=false`，不能把这两个字段改成真以制造原生身份。
- `external_stage_audits` 必须有登记基础设施 key 的有效签名。独立传入的真实回读还须匹配报告 SHA256、Git blob SHA1、审计 PR/head、鲜度、明确的 source commit 和受信固定清单算出的 bundle。记录自己报“verified”不等于实际收集器已核验。
- 审计报告开头用 JSON fence 提供 `ltzzz.external-stage-audit.v1` 元数据：原 Task ID、A2、Claude、明确 verdict、被审 source commit、runtime bundle SHA256。正文可以照常写逐项意见；不要求一个文件在自己字节里包含自己的整体 SHA256。文件摘要由外部采集器计算。
- 旧 #244 对旧版本的 REVISE 保持历史；新证据缺失、错误 head/bundle、REVISE/REJECT、被修改的字节、过期、无签名或同一提供商复核都不能开启 A2。
- bundle 只排除签认它自己的 `runtime_bundle_sha256`、`stage_audits`、`external_stage_audits`；通道选择、强制外部审计和所有权限开关仍在受保护的 bundle 内。

## 实际尚未完成

这是通道选择、验证契约和夹具测试，不是签名通道已上线。生产 trust 仍关闭、keys 仍空。没有生成、寻找、接收或分发生产私钥，没有登记虚假公钥；现有模型 API Key 不等于签名 Key。PR 回读签发器与真正核验受审 source 的固定 bundle 采集器还未接入，不能由候选 JSON 代替。

PR #244 的 B2 原子基线、B3 真实检查收集器、B4 真实签名执行器与活体验收、B5 高风险通知门禁接线、B6 首次无害文档真实合并仍分别待验。B5 不是当前 L0-only 放行的绕过入口。本次不执行真实合并，不启用 A2/A3/B，不改资金上限。

## 独立意见与探针

千问对通道草案的原生评估为 REVISE：run `40243232634`，原件 `knowledge/results/qwen-dispatch/PLAN-PATCHGATE-ESCROW-20261023-A2-B1-CHANNEL.json`。其真实登记与实时收集器尚缺的意见保留为阻断；不能把此次设计评估写成公钥、轮换或生产身份已验收。其把“执行器签名”理解为模型必须具备原生 Ed25519 接口，不采纳；代码签发的是已登记执行器证明，模型不接触私钥。

豆包探针沿原任务：无凭证 Actions 执行固定候选版本的对抗测试，原生豆包只审实际输出；shell 执行者和模型提供商分别署名。候选代码不进入持钥任务。探针覆盖伪造 head、同键并发、回执注入、422 无 ref 等，生产私钥与真实业务合并均不在探针范围。真实跨 runner 的隔离 ref CAS 如有结果单独列出，不能拿单进程 Promise.all 测试冒充。探针和原生反馈未返回前只记已派，不记已通过。

本轮已有 A0/A1/A2 本地 91/91，通过的是受控夹具；仍须拿到豆包真实 probe 回执，再给 Claude 新 head 复审。
