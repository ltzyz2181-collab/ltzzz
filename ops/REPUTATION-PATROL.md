# 声誉巡查制度

现有每日AI雇佣工作流中运行离线巡查，无新增模型额度开销。巡查最后20笔各DID工人任务，核对回执身份、交付SHA256、独立审计者及结算模式。三笔已验收质量失败或证据异常进入复议，新增预算建议先人工/总控复核；本轮仅报告，不擅改历史声誉或冻结资金。

超时、缺Key、余额不足、模型权限不足、输出截断作为通道故障，退款、不扣声誉；失败任务不能冒充成功。成功奖励沿用现有独立审核后的规则。软件撤席不冒充链上撤签，停用席不记活性失败。内部信用与链上工资始终分开。

当前实际模型默认：DeepSeek deepseek-chat；豆包 doubao-seed-evolving（DOUBAO_MODEL可覆盖）；Grok候选grok-4.6/grok-4-1/grok-4/grok-4-fast等；国内Kimi kimi-k2.6即时模式（KIMI_CN_THINKING=enabled才启用推理）。Secret可覆盖模型，具体上游响应以回执为准。国际Kimi不借用国内Key。

2026-10-12修复：国内Kimi此前worker_output_truncated，不声称Key失效；默认thinking.disabled减少推理挤占输出。豆包曾120秒超时，不能据此断言模型废弃。未提高预算或增加无上限重试。
