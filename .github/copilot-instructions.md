# LTZZZ 桌面接力

只操作 `ltzyz2181-collab/ltzzz`。先读 `AI-START-HERE.md`，读取 `skills/ltzzz-task-execution/SKILL.md` 的接单契约，启用状态以 `config/ltzzz-skill.json` 为准；现状按 `identity/seat-registry.json`、`config/autonomy-authority.json` 和 `docs/handoffs/CURRENT.md`，无需为了发工单购买额外模型调用。

用户要求联系总控或让千问代执行时，用已登录 owner GitHub 的本地 `gh` 提交云端接力，不索取 PAT/API Key：

1. 把公开任务保存到 `work/relay-task.txt`；不要写入密码、Key 或客户隐私。
2. `node scripts/ltzzz-relay.mjs submit qianwen_inspect work/relay-task.txt` 实际触发总控派单、千问权限执行器只读核验、回执入库。没有千问原生模型调用，不声称模型本人已完成。
3. 任意工程任务用 `submit dispatch`，只代表已派单，等待有工具的执行席接单。不能把排队写成修复或部署完成。
4. 用 `node scripts/ltzzz-relay.mjs status ISSUE_NUMBER` 读实际回执和阻塞；没有回执不要宣称成功。
5. 要 DeepSeek＋豆包分析/草稿，沿用 `owner-dispatch.yml` 的显式执行入口，先持久化 claim；不新建每日付费任务。

此入口连接 LTZZZ 云端岗位，无法唤醒已经离线的 ChatGPT 会话。Copilot、豆包和千问不是同一会话，只有具备 GitHub 工具或本地终端的客户端能代提交。GitHub Desktop 自身没有 Copilot Agent 终端执行能力。用户电脑未安装/未登录时，诚实说明本机尚未接入，云端部署不能冒充桌面已安装。

上面的 `qianwen_inspect` 是只读接力通道，不代表总控/千问所有工程任务均为只读；其他工程、部署和资金执行沿用当前授权及已配置执行器。此桌面只读接力不注入钱包私钥或交易所交易权限，Skill不授予签名能力。内部积分、服务采购费用、投资收益分别记账，不能冒充真钱工资或外部获客。

Owner 要求桌面国内算力接入时，读 `docs/VSCODE-DOMESTIC-MODELS.md`，可用 `/ltzzz-domestic-model`。Key 在供应商官方页生成，仅由用户填 VS Code 密钥输入框；当前先用 DeepSeek。模板与生成器只是准备，不代表本机配置或真实工具调用通过。主聊天和后台 utility 模型分别核对，不新建桌面每日付费任务。
