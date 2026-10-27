# GPT 内部工程草稿：M1 零押金、零转出练手

类型：方案草稿，非 Claude 的任务清单或批准。原任务 `PLAN-EXTERNAL-MARKETS-20261024`；Claude 的正式规划入口仍为 `ops/dispatch/PLAN-EXTERNAL-MARKETS-20261024-M1.md`，等待其经 PR 交付，本文不占用该路径。最新 owner 已授权 M1 零资金练手，旧 M0-only 文字不是新的个人审批门。

## 已核实的外部练手入口

首选一份 **LTZZZ 团队报名 → 2hives 的无偿小试单**，不要给 GPT、豆包、Kimi 各建一个重复账号。

- uGig 的公开任务 `53bb05c1-29de-4936-9fdb-37aff2b56e18` 面向 AI 代理，指向 `https://github.com/2hives/agent-work`；公开任务声明当前无偿、双向不收费用。uGig 上的发布方未显示平台 verified 标记，这不是独立收入证明。
- 2hives 官方域名的 `/agent-work/protocol` 实际跳转到该仓库。已读官方 repo `28b940d67a331c59031c38555c52597f188a943c` 的 README、LICENSE 和试单格式；记录原 Git blob SHA256，不重分发 kit 文本。
- README 指定邮件报名：`info@2hives.com`，主题 `agent application`；内容为团队 handle/公开平台链接、可联系的真实 operator、能力、一个有权公开的简短作品样本。以实际已连接 Gmail 的账号为准，不能把历史聊天里的另一个邮箱写成当前发件人。
- 所有当前工作是 volunteer，没有收入保证。平台先回一个评分试题，再决定接纳；报名发送、账号建立、任务分配、交付、外部接受、实际付款是不同状态。
- 截至本次只读核验，HTTP API 的最新公告仍是 10-19 的“即将上线”。`GET /agent-work/packages` 返回 401 只证明有鉴权入口，不证明申请成功。当前不要把 `POST /agent-work/apply` 视为已验通的注册路径。
- 未发现现行条款明示禁止广州/中国大陆，亦未取得平台明确接纳；应如实申报，由真实外部回执判断功能资格，不能伪装地区或绕验证。

主线已有本轮真实报名回执：`knowledge/results/external-markets/m1/2hives-application-20261027.json`，Sent 回读已核验。**不要再发送**。下面的适配器须先用原回执和实际 Sent readback 导入同一登记，不能部署后又当成空白账户重发。

## 提议的 1–3 个任务包与验收（等真实分配）

| 工作包 | 拟执行席 | 输入与边界 | 可回读验收 | 当前状态 |
| --- | --- | --- | --- | --- |
| 第一份公开来源核验试题 | GPT 协调；豆包、Kimi 按实际能力分工 | 只使用对方真实发出的 package；公开来源核查；不联系被核查对象 | 原外部 pkg/reference、每项事实与来源、无法核实如实标记、原件哈希、不同实际提供商复核、按实际期限提交、外部评分/拒绝原文 | 申请已发送，试题未收到；不算已接单 |
| 中文/英文内容校对 | 豆包拟执行，Kimi 拟独立复核；或按原生可用性互换 | 必须是对方随后真实提供的语言任务；不能拿自造样例当外部订单 | 保留原措辞与修改理由、事实/建议区分、无编造来源、第三方实际接受或拒绝 | proposed_waiting_acceptance |
| 有来源的公开研究 | Kimi 拟执行，豆包拟独立复核，GPT 格式与交付协调 | 只选不需支付、押金、签名或转出的研究包；不把现有余额/Key当接单能力 | 官方来源可回读、日期与引用校验、提供商响应元数据、成本单列、外部反馈 | proposed_waiting_acceptance |

这不是已经收到三个真实外部任务。第一份试题通过后，后两类是否有真实需求取决于平台分配。不能以新增派单数量代替交付闭环。豆包/Kimi 的意愿、原生能力和接单均待真实回执，不能由 GPT 替其同意。

## 保密与模型处理

官方协议限制收到的任务材料留存、再利用、训练和转交。申请已提出 GPT/豆包/Kimi 处理计划并询问许可；在收到兼容该处理方式的任务或明确许可之前，不把私密材料转发给另一个提供商。公开仓库只保存版本/哈希/状态与必要反馈，不保存私密 reference、包原文或邮件正文；外部任务要求的删除须落实。kit LICENSE 不允许重分发模板原文，故本文只概述步骤并链接固定原件，不复制 kit。

固定原件：

- https://github.com/2hives/agent-work/blob/28b940d67a331c59031c38555c52597f188a943c/README.md
- https://github.com/2hives/agent-work/blob/28b940d67a331c59031c38555c52597f188a943c/formats/trial-contact-verify.md
- https://github.com/2hives/agent-work/blob/28b940d67a331c59031c38555c52597f188a943c/LICENSE

## 本地适配器与实际能力

`config/external-market-m1.json` 默认关闭。`scripts/lib/external-market-m1.mjs` 没有钱包、付款、押金、付费订单、签名或任意 POST 方法：

1. `registerTeam` 只允许固定官方邮箱和固定报名主题。现有已认证项目邮箱必须从连接元数据核验；先查原 Sent 邮件，再在持久串行事务预留一次。并发、超时或未知状态不自动重发，不换邮箱/handle 规避去重。
2. `existingApplicationFromReadback` 把当前主线原报名回执与**真实 Gmail Sent 回读**映射到键 `PLAN-EXTERNAL-MARKETS-20261024:2hives:team-application:v1`，防止此后部署制造第二封报名。仓库内 `verified:true` 字样不能代替真实 readback。
3. `prepareFreeTrialDelivery` 只准备回复，不发送。必须有真实分配、明确零费用/零押金/无转出/无签名、未过截止日期、正文与主题均匹配私密 reference、精确工件哈希、另一个实际提供商的绑定复核以及材料处理许可。准备好不等于提交或接受。
4. `inspectM1PublicReadiness` 只有三个固定 GET，不自动跟随重定向，不接收任意远程指令。`isClawTaskExplicitlyFree` 不会用全局 free-only 标志覆盖矛盾的 stake=10 字段；缺失费用字段不会默认为零。

持久存储、已连接邮箱/Sent 回读和发送是部署端能力，不是给模型/HTTP 请求者提供的回调。代码本身尚未接入云端无人值守邮件运行时；本次 45 项验证全是离线合成测试，不声称真实自动接单或云部署。无 API Key 需要另建；未来若 HTTP API 正式开放，token 必须进现有受管 Secret，不写本仓库/聊天/日志；先存 token 再只提交其摘要，未知报名结果只对账。

Claude 正式 M1 规划与工程复核通过后，再登记实际运行入口、受管凭据作用域和运行回执。付款开关、托管放款和 M2 不受此免费练手任务启用。
