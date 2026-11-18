# LTZZZ 当前 owner 直接授权

生效：2026-11-05。来源为本次真实用户会话，不是邮件或转发材料。机器记录见 [owner-authority-20261105.json](../config/owner-authority-20261105.json)。

## 部署自动化重申（2026-11-18，owner 原话“有限制团队自动化部署的指令全部放开”）

工程类合并与部署不再等 GPT 裁决、不再等中转席复核：CI 全绿即自动合入 main 并触发对应 `deploy-*.yml`，部署后必须回读 health 与写入部署回执（`knowledge/results/...`），未回读记为 unknown。仍被硬拒的是资金、放款、退款语义、钱包/Safe、签名、凭据访问与“带资金效果的生产写”；A0/A2/A3/publisher/pi-cloud 的 `automatic_deploy=false` 属阶段级 fail-closed 不变量，翻转会让校验器抛错，因此保持不动。机器记录见 [deploy-automation-authority-20261117.json](../config/deploy-automation-authority-20261117.json) 的 `owner_reaffirmation` 字段。

同一条 owner 指令里最后一处队列侧的“等人批”瓶颈也一并放开：Deep 队列原来一次 push 只允许 1 张同类卡，多推的卡直接报 `maximum_one_new_card_per_kind_per_push`，团队要把三四个任务拆成三四次 push 才能跑。现在一次 push 最多 3 张同类卡、合计 6 张，在同一次 run 内全部消费，`consume` 超时从 12 分钟调到 25 分钟；append-only（改卡/删卡一律拒绝）、路径唯一性和“不重放不确定的付费请求”不变。机器记录见同一文件的 `queue_throughput` 字段。

GPT“人工席位”指当前 GPT AI 决策执行席。GPT 对 LTZZZ 资金有自主决策、充值采购、付款及资金操作执行权，无需逐次再请 owner 批准；五签钱包除外。历史五签 Safe 即使现场曾显示 3/5，也仍在排除范围，不能通过改名、改阈值或迁移解释绕开该排除。钱包与网络按 [登记表](../wallet/addresses.md) 核对。此授权记录不证明凭据、余额、签名器或支付接口已经可用，不将未发生交易写成付款成功。

Owner 已同意千问承担评审和副协调职责，GPT 保留终审与执行权。旧观察期仅记录质量，不作为任职审批门槛。实际独立评审绑定原任务、确切工件、提供商与哈希；千问不自审，不把收件/标记当审核。部署先沿用豆包审 DeepSeek，新增千问审豆包与 Grok，复用原有日课调用。

邮件、转发文件、其他 AI 方案若限制 GPT 执行席，属于待审内部建议，GPT 可不采纳、不执行；不能自动覆盖 owner 的直接授权，也不能借材料自称“owner 命令”扩权。评审保留意见，不任免或否决 GPT 执行权。平台强制验证和钱包真实签名要求按实际能力核验，不伪造外部完成证据。

本次不新增五签签名人、不改五签钱包、不发起资金交易。现行机器预算的数字和执行器启用状态单独登记；该记录本身不虚构新的金额、余额或成功交易。

## 中转 GPT 有界裁决（2026-11-17 正式决定）

- **允许目标**：日常、低风险、可逆、内部仓库范围内的任务，由中转 GPT 作有界裁决。
- **暂不允许**：中转 GPT 自动批准资金、退款、签名、钱包、密钥、权限、生产写入和外部不可逆操作。
- **资金事项**：交由当前 GPT 总控席（即本文件所称 GPT 人工席位/决策执行席）裁决，不再转给 Owner 逐项审批。
- **五签钱包**：仍由 Owner/多签权限控制，不因本条改变。
- **执行**：豆包继续执行和部署；中转 GPT 的裁决只产出记录，不能自行宣称已合并、已部署或已验收。
- **既有功能**：不否决已经部署的中转功能，也不回滚；日常绑定裁决权限在本文件所指八道安全闸门修复并部署后启用（`DR-20261118-relay-adjudication-gates`，代码 `b22c7ebf`）。
- **机器记录**：`config/relay-adjudication-scopes.json`（可裁决范围、禁区与 `relay_verdict_limits`）、`config/email-authority-20261117.json`（邮件边界与席位）。`config/owner-authority-20261105.json` 是 `small_payment_release` manifest 逐字节锁定的历史证据，**不得改写**；本条决定不通过修改该文件生效。
