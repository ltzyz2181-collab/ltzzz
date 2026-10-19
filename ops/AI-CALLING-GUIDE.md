# AI 调用与部署 · 唯一入口

配置真源：[config/ai-providers.json](../config/ai-providers.json)。表内仅放凭证名字，不放值；不要求 owner 重复注册或反复粘贴 Key。这里记录的是当前代码消费的位置，凭证存在/余额/权限以真实运行判定。

| 席位 | 凭证在哪里 | 直接执行入口 | 实际边界 |
| --- | --- | --- | --- |
| DeepSeek | GitHub DEEPSEEK_API_KEY | daily-economy.yml / execute-task-queue.yml | 已有真实调用；主力研究与派单 |
| 豆包 | GitHub DOUBAO_API_KEY、DOUBAO_MODEL；可选变量 DOUBAO_BASE_URL | 同上 | API 与聊天额度分别记录；主力交付，不等于钱包签名/视频发布 |
| GPT | 逻辑总控使用既有国内执行器 Key | autonomous-control.yml / control-relay.yml | 原厂 OpenAI 与微软额外付费日课停用；实际执行提供商另记 |
| XAI/Grok | GitHub XAI_API_KEY；Cloudflare xai-proxy有另一把Key | execute-task-queue.yml | 两把Key权限可能不同，不互相冒认；近期讨论调用失败不等于全部通道失效 |
| 千问 | GitHub DASHSCOPE_API_KEY；现有Worker仍用其Cloudflare QWEN_API_KEY | scripts/call-qwen.mjs / daily-agent-tasks.yml；原代理不改 | 原生日课先认领和预留；桌面客户端会员不是API额度；见[验收入口](dispatch/QIANWEN-NATIVE-DAILY-20261018.md) |
| 国内Kimi | GitHub MOONSHOT_API_KEY_CN + LTZZZ_AGENT_TOKEN | scripts/agi-econ/kimi-cn.mjs 及共享队列 | 国内/国际Key分离；Tier0真实生成受共享并发租约控制，目录GET不是生成验收 |
| 国际Kimi | Cloudflare kimi-proxy的KIMI_API_KEY | 无Key Hub任务/weekly任务包 | 旧诊断国际余额0；不是国内入口 |
| Meta托管Llama | Cloudflare AI binding + META_WORKER_TOKEN | wrangler.meta-hosted.toml / control-handover-verification.yml | 已部署；真实推理，不代表官方Meta账户或Instagram发布 |
| Claude审稿岗位 | DOUBAO_API_KEY / DEEPSEEK_API_KEY | 默认国内代执行；非原生Claude | [国内岗位接管](../docs/DOMESTIC-GPT-CLAUDE-ROLES.md)，回执记录实际模型；原生Anthropic另行手动 |
| Microsoft / Manus / Workbuddy / Meta外部席 | 分别代执行或外部工具 | ltzzz-memory/tasks/、Issue/PR | 不凭拥有账号或邮箱就宣称能自动调用 |

## 怎么派现有API任务

1. 先读 AI-START-HERE.md，记初念和要带回的数据。
2. 在 ops/task-queue.json 增加唯一id、agent、inputs、instruction；支持 gpt/deepseek/doubao/grok。推main触发队列，或在Actions选择 Execute LTZZZ AI task queue → Run workflow。
3. Key由workflow自动注入。输出 ops/runs/<id>.json，生成回复是待验收，不是部署。
4. 需要部署的代码，进入已有目标工作流；Pages是 pages.yml，Meta是control-handover-verification.yml。后者还含Kimi诊断/资金测试，不为只读研究随意重跑。
5. 已登录且有仓库权限时可 `gh workflow run execute-task-queue.yml --repo ltzyz2181-collab/ltzzz`。没有权限的外部席提交任务PR/Issue，由总控接入；不索取Secret值。

## 低预算运行规则

千问原生日课沿用现有每日主跑/兜底，最多一次已预留请求，不恢复已停用的原厂GPT/Microsoft。每月1日北京09:17由 provider-readiness.yml 做零生成目录与已有余额查询，覆盖千问、DeepSeek、豆包、国内/国际Kimi、Grok；千问主查、Claude可用时复核，不自动换型号或购买模型。手动128token连接验收另留回执，不能顶替正式日课。

每日新增经济任务只调 DeepSeek 一次、豆包一次，输出分别最多1600 tokens；完整六篇输入仍产生输入token费用，不能称免费。豆包兼容端点404/405可能走一次协议fallback，逻辑调用上限不等于HTTP请求数。没有美元成本核算依据时只记tokens，不编造精确账单。

同一Asia/Shanghai日首次尝试写checkpoint，失败或重启不自动重复花额度，次日再试；手动运行同日也会跳过。旧日课与工程队列继续有各自费用，这两次不是整个项目总预算。API产出不输出原始远端错误，避免把服务回显当交付。

雇佣为真实API委托/交付，内部USDC报酬0；API费另记，不声称已付USDC。投资当前每日派研究/测试单与复核，真实资金执行需走既有执行通道并带回新txHash、余额及费用。主要成果是数据、风险暴露与修正，收益不是每日任务完成条件。
