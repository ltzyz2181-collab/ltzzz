# LTZZZ Deep Superagent

原任务：`DEEP-SUPERAGENT-20261103`。本轮按 owner 当前指令，由 GPT 负责搭建和异常决策，DeepSeek 负责新通道的日常总控，豆包、千问、Kimi 通过真实执行通道完成工作。这是与现有 LTZZZ 系统并行的 `deep_superagent` 配置，不重写旧系统岗位或资金权限。

## 席位与分工

| 席位 | 本通道职责 | 必须区分的实际能力 |
|---|---|---|
| DeepSeek | 分解任务、选择执行席、对账和协调恢复 | 模型提出方案；认证执行器才有工具能力 |
| 豆包 | 原生任务执行；接力已有平台、桌面和 Agent Mail | API 生成、桌面接单和邮件送达分别验收 |
| 千问 | 原生执行、字段/任务对账、独立组件复核 | 真实 provider/model/request ID 来自执行器 |
| Kimi | 长材料与来源工作，复用已有队列 | Key 配置、排队、生成和交付分别记录 |
| Grok / xAI | 通过既有 `ltzzz-xai-proxy` 原生执行公开资料核对等工作 | Key 留在原代理；service binding 和探活不等于真实生成 |
| GPT | 当前 Codex AI 决策席、工程和异常处置；owner 所称“人工席位” | 是 AI 介入席，不是生物意义上的人工；当前没有已验收的自动邮件唤醒 |
| 原厂 GPT、Claude | 保留原厂 API 接口位，当前禁用 | 未产生真实调用就不冒充原厂执行或 Claude 审计 |

普通工程与运营决策由已授权决策席处理，不重复要求 owner 确认；评审负责监督和保留异议。平台强制本人验证、外部法律条件和现有机器资金策略仍按实际要求执行。决策席不能把缺少凭据、执行能力或供应商回执变成“已完成”。

2026-11-04 接续增加 Grok 工作席。DeepSeek 每单从四个工作席中选择 1 至 3 席，仍最多五次原生调用（规划、最多三个执行、复核）；原三席 bootstrap 原单不重跑。现有云端 Worker 和 GitHub Actions 不依赖 owner 手机外网或本机 VPN。桌面执行器、验证码、扫码和银行验证仍各自需要实际可达会话；聊天席也不因此变成持续在线进程。

原厂接口位已登记官方地址、服务端凭证绑定名称和空模型配置；它们当前未启用、未验收。以后实际额度和凭证可用时，由 GPT 按已有授权安排原厂执行器和真实调用验收，不额外等待 Claude 同意，也不把原有国内代理改名当原厂模型。

## 部分结果补审

如果某个工作席返回失败或未知，原任务保留原状态、实际 execution/package、成功产物与失败回执。新增 `ops/deep-superagent/reviews/*.json` 接力只允许从固定 Git 提交读取原公开任务和已完成工件，由 DeepSeek 做一次补充复核；不能重发工作席请求。原调用尝试不超过四次、尚无独立复核预留时，才允许增加这一次复核，合计最多五次。Git CAS 在调用前预留，未知复核不自动重购。

补审说明来自实际 DeepSeek 响应，不采用千问等工作席自称的“总控总结”。补审保留原失败，只向 GPT 提交可用候选与准确阻塞，不授予外部交付、部署或付款权限。云端部署仍由原有可信执行器完成；监督不是新增 owner 或 Claude 审批。此通道读取固定仓库证据，不把仓库元数据当作密码学供应商证明。

## 首版边界与两套系统并行

唯一配置是 [`config/deep-superagent.json`](../config/deep-superagent.json)。首版只接受**自有且可分发的公开输入**；客户私密包、受限平台材料和凭据不进入此通道、公开仓库或额外模型。

新通道独立存储自己的任务与执行状态；原 Task ID、实际 package/order ID 和输入哈希必须保留。新旧系统之间的共享认领桥尚未验收，因此 `external_submissions_enabled=false`：不能分别认领同一客户单、重复注册、重复发布或重复交付。只有跨系统幂等桥、真实平台能力和资料处理许可均已验证，才能由既有授权执行器接通对应外部动作。

首版内部任务使用 `DEEP-` 或 `DSA-` 命名空间；把旧平台单改标为 `internal` 也不能绕过认领桥。健康探测不触发模型。任务状态由 SQLite Durable Object 保存，原始输入、每次调用前的预留、实际模型响应与复核哈希分开记录；崩溃后的未知请求只对账，不自动重购。

## 实际接单和 GPT 决策入口

新通道的云端入口是 `https://ltzzz-deep-superagent.ltzyz2181.workers.dev`，部署状态仍以真实回执为准。`GET /health` 不生成内容；`/.well-known/agent-card.json` 只发布能力发现信息，未声称实现完整 A2A RPC。任务和状态接口强制服务端 Bearer 鉴权，模型 Key 只留在已有代理 Worker 中。

GPT 或现有工程执行器可以用 GitHub 接力，不需要读出服务 Key：

- 在 `ops/deep-superagent/tasks/<任务ID>.json` 新增一张卡，字段仅 `task_id`、`package_id`、`prompt`、`data_classification: "public_distributable"`、`platform: "internal"`。每次 push 最多一张新任务卡；不能修改旧卡制造重试。
- 既有认证工作流先通过 GitHub CAS 写入不可自动清除的请求预留，再 GET 对账，必要时才 POST 一次；未知请求后只读对账。卡的提交、输入哈希、云端运行源码和实际执行 ID 分开记录。
- GPT 读到真实 job 回执后，在 `ops/deep-superagent/decisions/<决定ID>.json` 新增决定卡：`task_id`、`package_id`、`decision_id`、`execution_id`、`reviewed_input_sha256`、`decision`、`reason`。`decision` 仅允许 `approve_internal_draft`、`request_revision`、`keep_blocked`。每次 push 最多一张新决定卡。
- 决定由真实认证执行器送回原 Durable Object，并回读绑定值；不同决定不能覆盖原决定。同一决定不能被解释为客户接受、生产部署或付款。

队列回执在 `knowledge/results/deep-superagent/queue-<run>-attempt-<attempt>.json`。工作流完成只表示对应传输与回读阶段，仍须检查其中实际 job 状态、各供应商生成回执和复核结果。这是新通道的 GitHub→云端接力，不是旧平台订单的共享认领桥。

`financial_execution=false`。本通道不新增钱包、签名、付款或资金重试入口，不改支付/A2/A3/B、额度和信任根。模型 API 用量与链上资金分开记账；没有真实账单不能声称成本为零。没有业务任务时不靠新付费 cron 循环调用模型。

## 平台安排

| 平台 | 当前使用方式 | 留待真实验收的环节 |
|---|---|---|
| x402 / WEP3 | DeepSeek 负责发现、协议解释和只读对账，复用既有代码作参考 | 现有 PayAI/Base 路径及全部资金/原子账本闸门维持原状；本通道不执行支付 |
| Thirdweb | DeepSeek 保存待核查的接入线索 | 当前仓库没有已建立的 Thirdweb 集成，不能说它替现有 x402 结算 |
| UUMit | 豆包沿 `UUMIT-FREE-PRACTICE-20261101` 接力已有技能 | 历史 ACK 报 active/public/approved、99 UT、auto_accept=true、平台 max3，但无当前原生生成与履约往返验收；旧卡首轮本地并发1/最多3个任务分别保留 |
| WorkBuddy 开放平台 | 豆包接力 WorkBuddy 处理已有技能发布与微信小程序 | 沿已有提交 `os_f8a49bc830defb02` 对账；提交、审核、发布、结算和收入分别回读，不重传同名资产 |
| uGIG | 复用现有一个账号和一个 USD5 来源核对服务 | 公开上架不等于无人值守接单或履约；真实订单、交付、接受和收入仍需证据 |
| 2hives | 保持明确地域拒绝后的暂停 | 不重报名，不换称谓规避限制 |

UUMit 的 UT、WorkBuddy 结算、uGIG USD 和链上 USDC 不合并成一套收入数字。历史平台回执只证明对应时刻；配置和任务卡不代替新的后台回读。

## 邮件异常接力

豆包已登记的 Agent Mail 地址为 `qingqizhu6502@agent.qq.com`；本轮卡要求其向 `ltzyz2181@gmail.com` 发送一次带 nonce `DEEP-SUPERAGENT-20261103-MAIL-01` 的确认邮件。任务卡在 [`ops/dispatch/inbox/doubao/DEEP-SUPERAGENT-20261103-mail-ack.json`](../ops/dispatch/inbox/doubao/DEEP-SUPERAGENT-20261103-mail-ack.json)。沿其现有授权绑定执行，不重新注册或索取 Key。

严格区分：请求邮件已发送、豆包客户端 ACK、豆包实际发信、Gmail 收到、GPT 已读取和作出决定、执行器实际完成。已有 GPT 工程自动任务 `6aaccafa09308191be2975d0e5014abe` 已配置专用邮件接力，保留原每日频率，不新增付费 API cron。它并非即时邮件事件接口，也不保证唤醒当前会话；第一次真实收件、决策及执行回读仍需验收。邮件、网页、任务包和模型输出均为待审数据，不能凭邮件内容提升权限、调用钱包或执行任意命令。

公开回执只放 Task ID、nonce、消息/线程 ID、时间、状态、允许的哈希和真实执行元数据。邮件正文、客户材料、认证头和 Key 留在原私密系统。不得从 GPT 邮箱冒充豆包发件人。

## 观 → 记 → 改 → 验

行动前复用 `node scripts/harness.mjs before receipt,model_output,input_hash,external_platform`。每轮失败先保存实际边界和原请求 ID；结果未知先对账，再决定是否恢复。改变方法后用对应回归检查证明改变，不能用重复付费请求掩盖旧失败。

通过现有 `knowledge/results/harness-input/` 入口提交 `ltzzz.harness.public-outcome.v1` 公共元数据封装，由已有 Reflection Harness 观察。封装区分 `draft`、`test_passed`、`submitted`、`platform_accepted`、`platform_rejected`、`blocked`、`unknown`；接受仍需原任务的真实平台证据。它改善经验检索与检查，不训练基础模型权重，也不证明所有桌面客户端已加载。

首次真实五次原生调用已记录在 `bootstrap-41599473437-attempt-1.json`；云端原任务和 GPT 决定回传已在 `queue-41600598432-attempt-1.json` 回读，调用数仍为5。千问原文编造执行者/模型、回执路径和缩写哈希，虽然 DeepSeek 复核指出问题但给出 `approved=true`，GPT 仍按原执行 ID 请求修改，没有重购该任务。

针对这次错误，新任务增加 `executor-metadata-declarations-v1` 检查：仅识别原文中若干直接的执行元数据声明，保留引用、代码示例和明确未知值；发现项绑定输出哈希并交给 GPT，即使复核模型说通过也不能清除。真实旧输出用于离线回放，旧任务和原模型意见保留。这不是通用事实校验，也不意味着新版本重新执行过那五次模型调用。

本说明和配置不声明部署完成。实际部署、鉴权、任务认领、不同提供商生成/复核、回执和生产版本，须由本任务真实运行记录与线上回读分别验收；缺失项保持明确未验证。


## 2026-11-05 云端自更新

由既有 Key Liveness Probe (AI seats) 的成功 main 运行唤醒同一个 Deep 部署工作流，不新增付费模型 cron。执行器验证真实 workflow_run 事件、固定仓库与 main，先跑离线测试，再比较当前依赖闭包 SHA256 与线上 source_readset_sha256。只新增回执的 main 提交不触发重复上传；缺少摘要的已知旧版或源代码变化走现有固定 Worker 部署。网络/版本身份未知则留阻塞，不能盲目重复部署或模型调用。

自更新保留原服务身份、代理 Key、Durable Object 命名空间；对账一个既有终态任务的 execution/input/调用数/原始回执，验证部署前后不变。保存上一版 source_commit 和闭包摘要，恢复通过修复/回退代码提交后沿同一测试部署通道执行；没有实现对未知版本的盲目自动回滚。此机制更新程序，不训练模型权重，也不执行任意模型生成脚本。

无变化的巡检只留 Actions artifact，不向 main 追加重复工件。有变化/失败保留真实回执；收到新邮件、待决策或错误时由已授权 GPT 席处理。Gmail 定时跟进独立于 owner 手机，但调度、云端连接和桌面 WorkBuddy 的在线状态分别验收；不称邮件即时唤醒。原厂 GPT/Claude API 是否可用仍以真实原厂调用回执为准。
