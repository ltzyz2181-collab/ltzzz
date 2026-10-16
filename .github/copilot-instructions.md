# LTZZZ 桌面接力

只操作 `ltzyz2181-collab/ltzzz`。先读 `AI-START-HERE.md`，现状简报见 `ops/dispatch/QIANWEN-REJOIN-BRIEF-20261016.md`，无需为了发工单购买额外模型调用。

用户要求联系总控或让千问代执行时，用已登录 owner GitHub 的本地 `gh` 提交云端接力，不索取 PAT/API Key：

1. 把公开任务保存到 `work/relay-task.txt`；不要写入密码、Key 或客户隐私。
2. `node scripts/ltzzz-relay.mjs submit qianwen_inspect work/relay-task.txt` 实际触发总控派单、千问权限执行器只读核验、回执入库。没有千问原生模型调用，不声称模型本人已完成。
3. 任意工程任务用 `submit dispatch`，只代表已派单，等待有工具的执行席接单。不能把排队写成修复或部署完成。
4. 用 `node scripts/ltzzz-relay.mjs status ISSUE_NUMBER` 读实际回执和阻塞；没有回执不要宣称成功。
5. 要 DeepSeek＋豆包分析/草稿，沿用 `owner-dispatch.yml` 的显式执行入口，先持久化 claim；不新建每日付费任务。

此入口连接 LTZZZ 云端岗位，无法唤醒已经离线的 ChatGPT 会话。Copilot、豆包和千问不是同一会话，只有具备 GitHub 工具或本地终端的客户端能代提交。GitHub Desktop 自身没有 Copilot Agent 终端执行能力。用户电脑未安装/未登录时，诚实说明本机尚未接入，云端部署不能冒充桌面已安装。

投资仅做资料比较、公开余额核验和未签名交易预览；由用户决定及钱包签名。此接力不注入钱包私钥或交易所交易权限。内部积分、服务采购费用、投资收益分别记账，不能冒充真钱工资或外部获客。

Owner 要求桌面国内算力接入时，读 `docs/VSCODE-DOMESTIC-MODELS.md`，可用 `/ltzzz-domestic-model`。Key 在供应商官方页生成，仅由用户填 VS Code 密钥输入框；当前先用 DeepSeek。模板与生成器只是准备，不代表本机配置或真实工具调用通过。主聊天和后台 utility 模型分别核对，不新建桌面每日付费任务。
