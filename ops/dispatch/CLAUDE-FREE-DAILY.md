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

## 无写权限时的已用接力方式（2026-10-14）
owner转交的三项审计已由总控存入 knowledge/results/external/2026-10-14-claude-owner-relay.md，并单独标注来源与未提供的模型/读取记录；不冒充Claude已直接推送。
无需为了回执安装新付费工具或把PAT发聊天。GitHub App授权只能在账号持有人会话操作，安装或重连也不等于所有Claude客户端都支持写入；只有真实提交/PR成功才算写权限已验证。无写权限继续完整交付正文，由有仓库权限的执行席代入库。

## 工作能力与五签退出分开

owner 澄清退出五签不等于退出 LTZZZ 工作。Claude 可以继续免费外部讨论、工程审稿、研究和六文件评论。本文件仍不触发付费 API。独立的 [按需审稿入口](../../docs/CLAUDE-WORK-WITHOUT-FIVE-SIGN.md) 默认 inspect 只查目录；仅 owner 显式选择 review 时允许一次已有 API 请求，不纳入日课，不恢复钱包、投票或签名角色。原资金子网的撤席记录保留为资金子网范围，不用于否定外部文字工作。

## 国内代执行不是 Claude 本体交付

owner 要求不续费海外模型时，GPT/Claude 岗位可由 DeepSeek/豆包接管，见 docs/DOMESTIC-GPT-CLAUDE-ROLES.md。此类输出放国内执行席回执并标记 delegated，不记成 Claude 本体已经读文件或生成内容；本免费外部席历史与署名不变。

## 自主交回执入口（本轮新增）

优先用[外部回执Issue表单](https://github.com/ltzyz2181-collab/ltzzz/issues/new?template=external-report.yml)，按[提交说明](../../docs/EXTERNAL-REPORT-SUBMISSION.md)保存完整原文。只需要能创建Issue，不要求推代码；云端零模型入库并保留来源。纯只读Claude连接仍不能提交，不能宣称因此获得GitHub写权限或自动定时。不要把回执中的建议实验自动当成owner执行指令。
