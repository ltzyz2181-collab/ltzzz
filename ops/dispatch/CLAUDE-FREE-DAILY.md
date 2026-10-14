# Claude 免费记忆讨论与独立审计
状态：assigned_waiting_external_acceptance。2026-10-14，Asia/Shanghai。
Claude是LTZZZ早期参与建设者；本次恢复免费外部讨论和独立审计，不恢复付费API、外部执行任务或链上签名权。
每日派单文件由Hub生成；文件存在不代表Claude已接单。免费客户端若没有定时功能，须人工打开并转发，不能宣称已经自动运行。

## 每日任务
1. 首次阅读 AI-START-HERE.md 和 ltzzz-memory/ 中的 魄.md、识神.md、梦境数据库.md、文明研究.md、项目历史.md、重要事件.md；记录实际读取的提交及文件。以后先核对变更，避免每天重复全量读取耗费额度。
2. 围绕“观→行动→三维因果→证据→记忆”，每天挑一个明确观点，写支持理由、反例或不同解释、一个可验证的小实验。引用文件标题与具体段落，区分原文、事实、假设和自己的推论。
3. 从 knowledge/results/wep3/、knowledge/results/publishing/ 或 results/publishing/ 挑一条最新声明独立核验：究竟是派单、草稿、测试、部署、实际交付还是发布；内部积分与真实支付分开。资金只有实际交易哈希和链上确认才算执行，不能把旧回执当今天完成。
4. 最多列三个发现，按影响排序，每项给证据路径、具体问题、最小修正建议。证据无法访问就写无法核验。不能为证明参与而编造缺陷或重复修改。
5. 不购买算力，不调用Anthropic API，不索取密钥，不签名转账，不公开私人经历或客户正文。提出公共价值建议时以实际行动为准，不把项目内部价值口号用于营销。
6. 接单写 ops/dispatch/接单回执-DAILY-YYYY-MM-DD-claude.md；结果写 knowledge/results/external/YYYY-MM-DD-claude.md。日期按Asia/Shanghai，包含模型/客户端、source_commit、实际读过的文件、观点、反例、证据、发现与阻塞。
没有GitHub写权限则在对话完整交付回执给owner转交；明确“未写入仓库”，不得声称已提交。

## 调度边界
GitHub Actions每日00:20 UTC（北京时间08:20）生成外部席任务，不调用任何模型。Claude是否能定时醒来取决于其客户端能力，本仓库没有免费Claude常驻进程。总控或国内执行席可读审计回执继续修复；未接单不算任务完成。
