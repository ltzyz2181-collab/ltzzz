# Memory 候选来源与验收

类型：工程规则。2026-10-22。

原晋升器只扫 `memory/daily/*.md`，遗漏了日课写入的 `data/memory/*.json`。现先读取当个项目日（Asia/Shanghai）的完整 Agent 条目，生成 `memory/daily/agent-日期-席位-条目哈希.md` 不可变来源快照，再加入原 Promotion 队列。条目哈希基于 `JSON.stringify(entry)`；快照使用完整文件 SHA256，原始可变文件的收集时哈希记在 `memory/promote/agent-coverage/日期.json`。同一条目重扫不重复建候选；旧记录不因新增日期被覆盖。

只收集正常结束、结构完整、归属未被驳回的观察/建议，保留完整产出和不确定性。候选明确标 `agent_observation_unverified` 或 `agent_proposal_unverified`，不把模型自述、部署建议、传统解释当已证事实；操作元数据、截断和敏感输出跳过并记录原因。四家新增Memory不等于四条已通过的长期事实，仍需现有不同供应方的独立评审。

收集回补：`node tools/promote-memory.mjs --collect-only --date 2026-10-22`，仅增待审候选，不应用长期记忆。默认流水线沿用已授权的哈希绑定评审后应用规则；六份原件不改。覆盖报告中的 added_candidates 是本次扫描新增数，重扫为0但 covered_entries 仍保留覆盖量。

既有定时和日课完成后工作流继续使用，同时补充 Agent JSON/日记变更触发；收集器的来源快照、覆盖报告和队列一起提交。PR只运行零外部调用的测试；合并后才跑实际收集。不新增模型调用、付费定时、钱包或发布操作。
