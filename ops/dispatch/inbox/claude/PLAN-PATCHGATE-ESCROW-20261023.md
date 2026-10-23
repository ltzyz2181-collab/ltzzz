# Claude：PatchGate A0 上线前独立审计

类型：工程派单。Task ID：`PLAN-PATCHGATE-ESCROW-20261023`，阶段 A0，沿用 PR #220 原单，不是第二个业务单。

目标：审核 GPT 对你方案的工程修正及 A0 代码，指出可复现缺陷，并用原生 Claude 免费仓库 PR 交审计。不得用 DeepSeek/豆包代执行冒充你的审计。作者实际提供商 OpenAI；另一个审计提供商拟为原生阿里云千问，线上回执未返回前不算已收到。

输入：实施 PR 的固定 head（总控在 PR #220 评论中补链接与完整提交）；`scripts/patchgate-audit.mjs` 的 BUNDLE 列表包含 10 个文件，执行 `bundle()` 可得到原字节清单及 bundle SHA256。当前送审 bundle 为 `329b0ced2ca3843530f15caf3b675d962b2b5860835f9a84e839344dab254178`；任何代码文件变化后旧审计作废，必须按新 hash 审。

重点检查：

1. 策略与公钥从可信 base 读取；同 PR 不能修改自己的约束；初次 bootstrap 不能自证上线。
2. 四级风险、未知路径、重命名/删除、symlink/gitlink、密钥与新外联域名能否绕过。
3. 不同提供商来自受信执行器登记，而非 PR 文本或共享 GitHub 用户名；签名绑定完整 subject/时间，不能重放给新 head。
4. Date 窗口/当前 Cloudflare 版本/页面及头的提交号确定性检查，外置观测哈希，无“文件须包含自身哈希”的要求。
5. A0 只有本地/CI 验证与单机原子预留，未接共享 CAS、CI 签发器、真实采集器或自动合并/部署。不得把测试通过当上线，也不能因未来适配器尚未写完误报本期已启用的漏洞。
6. 分期严格：你的审计与另一提供商审计都完成后才进入 A1；A 稳定后才 B0/B1，B 本次最多测试网假币。原方案的旧 Aave“从未广播”表述已删，未据旧记录执行任何投资。

输出：`knowledge/results/patchgate/claude-a0-audit.md`，新分支+PR。必须记录实际 `author_provider`、客户端、读取完整 commit、10 文件原字节清单/bundle hash、approve/revise、每条问题的文件/复现/严重度及未验证范围；不能仅留参考链接或自报已部署。

验收：总控回读 PR 和工件，逐条修复并由原审计者复审；千问回执存在时同时核对。未收到你的原生回执，状态保持 `assigned_waiting_native_claude_audit`，不把已派发写成已接单/通过。

禁止：付费 Anthropic API、钱包/卡/旧金库操作、合并 main、启用自动合并/部署、测试网或主网广播、删改历史拒收。
