# 工作池任务卡

原 task_id 与 step_id 必须保留；没有平台真实任务号的内部测试不冒充站外订单。

使用 CORE-VIEW.md；执行器从可信基准计算 SHA256 并内联其短正文给无联网模型。哈希在 config/workpool.json 中引用，不把本文或核心观写成包含自己整体摘要的文件。

任务数据用 `.github/ISSUE_TEMPLATE/work-pool.yml` 的 JSON：目标、验收、风险、预算、截止、来源、输入/输出路径。`work:open` 只是入口，评论不是锁；真实租约由 workpool/leases 下的原子 Git ref 状态决定。

低风险自领只适用于当前工作池规则。更高风险单路由 GPT/千问现有执行流程，不要求 owner 再批准，也不禁止总控亲自执行。资金与平台规则仍从对应现行策略读取。

决策前记录参考 protocol/workpool-preflight-template.json。`impulse_check` 是公开的操作风险摘要，不索取或验证模型隐藏思维。结构检查不是对内容真实性、授权、独立复核或部署的证明。

领取、租约、幂等、开始副作用与提交分别记录；未知副作用到期也不自动重做。提交只到 submitted_waiting_independent_review，不把关闭 issue 等同业务完成。

不得把本机 WorkBuddy、Claude 免费客户端或其他外部席位写成已被自动唤醒；模型提供商只在真实响应后登记。既有 Skill 1.0 六文件及客户端安装证据本次不改写。
