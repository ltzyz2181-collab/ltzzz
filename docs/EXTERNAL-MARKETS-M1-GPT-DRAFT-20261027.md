# GPT 内部工程草稿：M1 零押金、零转出练手

类型：方案草稿，非 Claude 的任务清单或批准。原任务 `PLAN-EXTERNAL-MARKETS-20261024`；Claude 的正式规划已由主线 PR #275 采用，入口为 `ops/dispatch/PLAN-EXTERNAL-MARKETS-20261024-M1.md`；本文仍只记录 GPT 的适配器设计，不占用该路径或冒充 Claude 复审。最新 owner 已授权 M1 零资金练手，旧 M0-only 文字不是新的个人审批门。

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

1. `registerTeam` **不再发送任何申请**。原任务已存在邮件 `1a17cf44f3bdf73e`，部署端必须传入主线原报名回执，且 message/thread ID、原 Task ID、平台/收件人/主题均固定。初始化在同一个持久键预置“已知申请、待回读”；邮箱搜索延迟、not_found、换 handle、重复运行或重启都不能变成再次报名的理由。服务不持有 sendMail 能力。联系人邮箱仅用于校验原意图/形成草稿，持久状态只保存邮箱哈希，不对外另发。
2. `reconcileApplication` 是显式只读对账入口：只读取上述已知 message/thread，核对当前已认证邮箱、Sent 标签、收件人、主题并重算邮件正文摘要；再原子更新同一键。历史 `reserved_before_application_send` 没有 message ID 的行会显式标为 `send_unknown`，回读成功后可补同一封原邮件。失败只留待对账，不发送、不换账号、不重试付款。
3. 旧 `prepareFreeTrialDelivery` 的调用方事实对象入口已拒绝。新 `createM1DeliveryPreparer` 在部署时一次性注入受信读取器，公开调用只接 4 个 opaque ID；不能传包正文、认证标志、许可布尔、提供商、自报哈希或 now。部署端从真实已认证邮件/私有执行器记录读取：原始任务包字节及提取字段、逐供应商许可原文与包绑定、原生作者响应记录、另一实际供应商的复核记录。所有字节摘要在本库重算，输入快照在跨 await 前复制，截止时间在所有读取结束后用部署时钟再检查。准备结果只在内存返回官方回信内容与证据摘要，不发送、不代表平台接受，也不写私密材料到文件。
4. 受信读取器是**部署端能力契约**，不是一组可由 HTTP/模型请求者自填的回调。其真实 Gmail 认证结果提取、包字段解析、私有执行器日志来源与删除策略尚未部署/验收，本补丁不把 JSON 的 `metadata_source` 字符串包装成密码学身份。本库通过固定读入链减少调用方自述；上线仍须对实际适配器和读回证据独立复核。现有 76 项本地结果全部是合成夹具。
5. 申请草稿只接受固定能力词表、LTZZZ 自有 GitHub 样本 URL，摘要拒绝额外 URL/邮箱、密钥特征与不实“已接受/收入”类断言；原业务要求的 operator 邮箱是明确的对外联系方式，仅在原申请通道使用，不能当作公开回执字段。模式检测无法识别任意无特征秘密，不声称完整 DLP。
6. `inspectM1PublicReadiness` 仍只有三个固定 GET，不自动跟随重定向；读取原始响应流时限制为 32768 字节并取消超限流，不再调用无界 `response.text()`，摘要与字节数按原始响应字节计算而非有损 UTF-8 重编码。`isClawTaskExplicitlyFree` 不会用全局 free-only 标志覆盖矛盾的 stake=10 字段；缺费用字段不会默认为零。

本次没有连接真实邮箱或提供商，没有平台试题、许可、交付、接受、收入或云部署。API Key 不需要为本补丁另建；没有任何 Secret 值被读取。工作流只运行离线测试、contents:read、无 Secret，checkout/setup-node 固定到官方 v4.2.2/v4.4.0 标签当前对应的完整提交；文档/回执和新增审计回归文件也纳入触发范围。

Claude 正式 M1 规划已采用；本修订仍待 Claude 对新 head 复审。工程复核通过后，再登记实际运行入口、受管凭据作用域和运行回执。付款开关、托管放款和 M2 不受此免费练手任务启用。
