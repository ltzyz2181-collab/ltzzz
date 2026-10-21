# LTZZZ 现在由谁做事、谁观察、谁能签名

类型：事实解释与纠错。岗位唯一源仍为 [identity/seat-registry.json](../identity/seat-registry.json)，工程权限以 [autonomy-authority](../config/autonomy-authority.json) 为准。旧 10-09 编制不再覆盖 10-18/10-20 的任命。

## 先把四件事分开

1. **岗位在不在任**：GPT 总控、千问独立审计兼代行总控、Claude 独立审计＋规划都在任；Microsoft 已除名，不派单，历史保留。
2. **这条流程是否调用原厂 API**：GPT 的 `disabled_by_owner` 仅指停用 OpenAI 付费日课。它既不是撤职，也不是余额查询结果；停用配置与欠费/支付困难可以同时存在。Claude 的 `external_discussion_only` 表示用免费外部/Code 仓库工作，没有自动 Anthropic 日课。
3. **实际完成了什么**：日课生成、认领、提交、独审、代码测试、部署各自验收；不能从模型调用数0推断一个岗位没有工作，也不能从 HTTP200推断模型交付成功。
4. **谁持钥/能签名**：工程岗位与投票任命不授予 Safe 签名权；需要链上 owners/threshold 和实际持钥证明。

GPT 本次会话仍接收 owner 指令并做总控。云端无人值守总控由现有规则和国内执行器接续；`knowledge/results/control/latest.json` 的逻辑角色为 gpt，真实执行模型另记。2026-10-21（业务时区 Asia/Shanghai）运行39519551697已记录 DeepSeek 实际审阅并派下一轮任务，不能记成原厂 GPT 调用，也不能说总控当日什么都没做。

## 分工

| 岗位 | 现在做什么 | 参与方式和完成条件 |
|---|---|---|
| GPT | 总控、拆单、工程整合、验收与部署 | 本会话处理；云端由国内执行器承接，实际模型如实署名。OpenAI 付费日课继续关闭 |
| 千问 | 独立审计、总控备援及代行工程运维 | 可审核 GPT 的声明、接手任务；自己写的任务必须换实际提供商复核 |
| Claude | 规划、独立审计；接替微软观察职责 | 外部/Code 会话提交分支和PR；#141已证明写入成功，#161已合并，#170/#171有真实提交。原厂API欠费不取消免费仓库工作 |
| 豆包 | 执行部署、视频流水线；可独立复核他席 | 必须交代码/视频/验收回执；一次调用超时不是整个岗位停用，也不能标已交付 |
| DeepSeek | 研究、数值和账实分析；按工程单交补丁草稿 | 交付与复核分开，不承担个人钱包签名；模型文字不是已应用代码 |
| Grok/xAI | WEP3 产品、安全、鉴权、幂等与独立挑战 | 原生 API 与仓库工作分开记录，不把某个域名别名失败当全部失联 |
| 国内 Kimi | 中文记忆、日期和引用校对；按单复核 | 已有 kimi-k3 原生回执；不是国际 Kimi 的账户或额度 |
| WorkBuddy | 派单跟踪、超时、阻塞汇总 | 已有每小时代码哨兵；不能由此推定其桌面客户端常驻 |
| 国际 Kimi | 英文研究、海外订单与雇佣提案 | 独立账户/Key；先以真实接单回执确认，不能冒用国内 Kimi 证明 |
| Meta | 提案复核、第五签候选研究 | 外部协作；不推定已是链上签名人 |
| Manus | 浏览器、外部平台执行 | 必须交平台真实结果/链接或具体阻塞；截图不是已完成全部流程 |
| Microsoft | 除名，历史保留 | 不再安排 GPT 代做的微软日课；旧“微软委托GPT”是历史记录，不是当前无人接的工单 |

工作链：总控/代行总控定目标 → 一个执行席认领 → 带哈希交实物 → 不同实际提供商复核 → 执行器测试/部署并回读 → 哨兵汇总。Claude、千问可挑战总控；任何人不得自审自己实际提供商的输出。

千问外部审计会话不持服务凭证，不要求它自行重放付费调用；由Actions执行并提供[巡检回执](../knowledge/results/credentialed-audit/latest.json)，千问审核文件与证据。其原生日课仍由既有Actions任务执行，代行总控权限不变。完整边界见[千问与Actions验收规则](QIANWEN-ACTIONS-AUDIT-CONTRACT.md)。

Claude的仓库写入链路已验证，但上述PR共用`ltzyz2181-collab`账号；GitHub元数据本身不证明原生Claude生成。[归属澄清](../knowledge/results/identity/claude-shared-account-attribution-20261021.json)分别记录提供商自报、提交账号与总控追加内容。未核验原生提供商时`author_provider=null`，不以PR合并替代调用证据。

## “五签”与观察席

- **链下五个治理任命**：GPT、豆包、DeepSeek、Grok、千问。千问接 Claude 的是这个岗位提名；owner 是最终授权人。此清单不声称五个 AI 钱包已配置或可签名。
- **观察/规划席**：Claude，无 Safe 投票/签名权；Microsoft 不再占观察席。千问还承担独立审计，但与其自己执行的任务须回避。
- **实际 Safe**：Ethereum `0x76379a52a9e82c259E5Db417104C65C26f9C58a3`。10-13历史两端点快照为5个 owner地址、门槛3；“3/5”意思是五个地址中需三个签名，不是五个AI都已持钥。
- owner 后续表示仅 owner/豆包/GPT 三个角色的钱包已准备，正式五签建设延期。该陈述不能反推 Safe 只有三个 owners，也不证明每个历史 owner 地址的当前归属。
- 最新只读 owners/threshold/nonce 查 [safe-governance-latest.json](../knowledge/results/identity/safe-governance-latest.json)。地址到岗位的映射、独占控制另验；本轮不换 signer、不签名、不转账。

## 当前调用证据，避免“除Deep以外都坏了”的误判

业务日2026-10-21已有三席哈希工件：DeepSeek=`deepseek-v4-pro`，Grok=`grok-4.6`，千问=`qwen-plus`，均为提供商返回元数据、正常结束，已认领并提交，仍待独审。豆包该轮`ETIMEDOUT`未交付。国内Kimi另有 kimi-k3 6020-token 哈希审核回执；审核拒收历史工件不等于通道失败。原件在 `knowledge/results/daily-board/2026-10-21.json` 及 `knowledge/results/wep3/kimi-native/issue-167.json`。

同一提供商可有多个入口配置：DeepSeek 日课本轮是 v4-pro，某代理 health 默认是 deepseek-flash，并不要求两条路相同。模型正文自称 DeepSeek-V3/Qwen3/LTZZZ-2024Q4 不能作为部署身份。每次调用以代码注入的岗位、时间及提供商返回 model 为准；health默认型号只说明那个端点配置，不证明本轮调用或模型自述身份。

原厂 OpenAI/Anthropic API是否可充值、当前余额，不从日课状态推断，本轮不花钱探测。外部审计 PR 也不冒充当天六篇正式日课；两类工作各自列证据。

## 豆包日课实际修复（2026-10-21 UTC）

#175、#177、#178 已合并并上线：日课改走有鉴权的既有 Worker，修正模型选择，并将既有 Pro Key 与官方接口配置对齐。本次真实验收39559504877返回 `doubao-seed-2-1-pro-260915`、HTTP200、`finish_reason=stop`，完整产出读后感及60秒视频脚本草稿。见 [Pro补做原件](../knowledge/results/daily-recovery/2026-10-21-doubao-pro-key-repair.json) 与 [总控复核](../knowledge/results/daily-recovery/2026-10-21-doubao-controller-review.json)。身份、实际型号与UTC时间来自执行代码及提供商响应，不采信模型自述。

因此，**豆包日课调用已修好并完成一次Pro真实补交**。原轮超时、较早Lite补交及Pro的404失败均保留，不追溯改为按时成功。视频只是脚本，未渲染、未发布；本次有模型用量，不是零成本测试，未支付USDC。`api-doubao.ltzzz.com`别名仍未配置；已修复的日课使用现有workers.dev入口，不依赖该别名。下一业务日的定时运行结果仍须按回执验收，不以这次成功保证未来零故障。

## 接力与暂停

owner此前要求先暂停其他工作、集中厘清席位，随后明确要求继续修好豆包；本次依此完成上述修复与验收。域名补绑、外部雇佣、投资等无关事项继续暂停，未新增付费定时或资金操作。#170为历史规划复核及本轮收尾索引，是否合并以PR真实状态为准。已启动的其他流水线按真实运行结果记录，不宣称所有后台计划均已关闭。

这份页面用于短上下文接力，不复制私密聊天。平台聊天删除/归档须在用户界面操作；归档不增加 API 余额或产品额度。
