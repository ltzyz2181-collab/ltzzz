# Claude 团队启用与首批派单（2026-10-18）
owner 已同意团队独立组织，共用 LTZZZ 总控任务、预算、订单与结算账本。总控 GPT；Claude 负责规划、拆任务、独立审计；千问/国际 Kimi 执行；WorkBuddy/Meta 部署调度。接受总控派单，允许保留审计异议。机器登记：config/claude-team.json。此登记尚未接入通用运行时权限控制，不冒充已启动远端助手。

## 唯一任务与验收
沿用已有 CONTROL-CLAIM-REPAIR-20261018，不创建第二个重复执行单。千问主执行、国际 Kimi复核，先读最新 main 和 PR，认证认领后修总控任务 ID 与线上认领断点。提供真实测试、PR、部署运行与独立回读；不能拿旧 DeepSeek 拒绝草稿直接上线。Claude 验证真实作者/审核者提供商不同。若国际 Kimi 无原生调用通道则 blocked，不伪装免费 Hub 扫描已启用。

AI-HIRE-CLOSEOUT-EXT-AI-20261017-001：Claude规划/独立审计，千问执行，国际Kimi核对。沿用原已付款订单，查 paid_delivery_rejected 的拒收原因、交付哈希、退款条件与证据，提出修复或退款请求；不得重复购买、重复付款或把未退款写成已退款。交付 knowledge/results/claude-team/hire-closeout.json。
ANS-CLAIM-CLOSEOUT：在原认领修复单下写分工；WorkBuddy同步Hub，Meta验证测试/部署结果；未持有真实工作流触发权限则 blocked。不另开第二个调度器。交付 knowledge/results/claude-team/ans-closeout.json。
先写 ops/dispatch/receipts/CLAUDE-TEAM-ACCEPTED.md，注明各真实执行者、客户端、来源提交、接单时间和任务 ID。未收到该文件保持 assigned_waiting_acceptance。交付依次区分派单、认领、草稿、测试、上线、实际交付、验收、结算；内部积分、模型费用、真钱付款分栏。

## 权限落实与未完成
仅 ltzzz、分支+PR。官方App安装不能把其整套权限裁成只触发验证工作流；官方文档：https://code.claude.com/docs/en/github-actions#github-app-permissions 。如严格限定，使用受限自建App或固定白名单执行器；仓库政策不是GitHub强制权限。现有 control-relay 是owner提交触发，不能声称Claude已有触发权限。本轮没有安装App、修改分支保护或发放凭证。
安装如由owner完成：在官方Claude GitHub App安装页选择 Only select repositories → ltzzz；审阅完整权限。不要把token发聊天。不启用额外自动付费工作流；安装不附送模型余额。官方App宽权限与本申请严格范围不符时不安装，改用既有Hub/PR接力。

千问接Claude治理席、Claude接微软观察席为owner任命；实际Safe owners/threshold、千问签名地址控制证明、变更交易待验证，不改历史地址假装链上完成。
ltzzzwep3ops1和0x21F5…7fdc分别登记；此地址历史控制与旧guardian状态、账号绑定未确认，团队不启用资金执行。不得导入旧私钥或要求公开凭据；查询、记账、申请付款不等于签名权。
连连申请按owner报告仍审核中，不读取私有银行卡资料；发卡后仍需平台实际支付能力核验，不自动消费或加预算。

## 当前提交实际范围
角色登记、配置与首批任务；零模型购买、零资金签名、零链上治理变更、零新付费定时。App权限和远端每日计划尚未核实，派单不等于接单。
