# LTZZZ 账号注册与恢复清单

Task ID：`ACCOUNT-REGISTRATION-PLAN-20261107`。GPT/Codex 编制，2026-11-07 核对。账号持有人仍是真实个人或企业，GPT 是获授权的 AI 操作与决策席。owner 本轮已授权合法注册及在官方流程使用必要身份资料，普通工程无需重复索权；该授权不等于现有会话、收信、实名或收款已经可用。

备用联系邮箱已记入私有执行资料 `owner-registration-contact-20261107`，公开清单不载其地址。当前未核验备用邮箱登录、收信、OAuth 连接或恢复绑定。手机号与证件原件未取得、未存入模型或仓库。

## 立即办理

| 优先级 | 要办的事 | 新注册还是复用 | 完成依据 |
|---|---|---|---|
| 1 | 主/备邮箱恢复与 LTZZZ 域名业务邮箱 | 先复用现有 Gmail、Cloudflare；域名别名尚未创建 | 实际登录/恢复设置、目标邮箱确认、MX 与路由回读、异源发信到达、发出和接收分别验收；不得中断现有邮箱 |
| 2 | PayPal 中国企业跨境收款路径 | **第一新增候选**；先核是否已有商业账户，不能从旧代码推断没有 | 正确商业产品、真实企业/代表/银行资料、当前费用和官方 KYC；需要的贝宝境内合规配套按平台实际流程核对 |
| 3 | 既有 uGIG、UUMit、WorkBuddy、微信小程序、模型账户 | 复用，不开第二套 | 先补齐实际接单、授权输入、交付、收款或发布欠环节；注册和上架本身不算收入 |

邮箱方面，两个 Gmail 仍有同一供应商的共同故障风险。立即项是补独立恢复方法与业务域名收件路径，不是承诺“不封号”。Cloudflare 现有官方服务含路由及发送：路由可用于 Free/Paid；向任意收件人发信需要 Workers Paid，目前本账户套餐、发送 beta 资格和可用额度未回读。邮箱转发不是完整托管邮箱，也不自动证明可对外发信。[Cloudflare 定价](https://developers.cloudflare.com/email-service/platform/pricing/)、[路由与收件验证](https://developers.cloudflare.com/email-service/get-started/route-emails/)、[Google 两步验证](https://support.google.com/accounts/answer/185839)、[官方恢复入口说明](https://support.google.com/accounts/answer/7682439)。

PayPal 不是先开个人号再转企业号的通用方案。当前大陆协议对 2026-06-30 后新个人账户的商用收款及升级有明确限制，也有商业账户对应境内合规要求。实际账号状态和费用仍需官方后台回读。**商户收款账户不等于能给原厂 GPT/Claude 充值的付款方式。**[PayPal 大陆条款](https://www.paypal.com/c2/legalhub/paypal/useragreement-full?locale.x=zh-CN-xbord)。

## 短期推进：先选一个市场试运营

| 候选 | 用途与开户顺序 | 当前不能冒充的能力 |
|---|---|---|
| Upwork | 查单一既有主账号；没有则走真实主体注册，按实际资格申请官方 MCP/API，核实投标成本与收款 | 官方 MCP 已支持 AI，但投标提交有明确确认步骤；不能用导出 cookie/RPA 或批量投标代替批准接口。MCP 目前也不能创建/编辑 Project Catalog |
| Fiverr | 作为 Upwork 的备选，先查旧号；普通 client 账号可激活 freelancer，手机/资料核验按官方流程 | 不误开不可转卖家用途的 Pro client 账号；允许 AI 辅助作品不等于所有账号自动化都被许可；不得给每个 AI 各开一个真人身份 |
| Gumroad | 现有商品链接先对应回真实商户账号与提款设置 | 旧链接不是可登录、已实名或可提现的证据，不直接重建店铺 |

Upwork 与 Fiverr 本轮“是否已有账号”均未验证，不能写成“确定没注册”。先各查一次，按真实需求只推进一个。接单还须看具体任务许可和实际交付能力，不能承诺注册后立即有客户。[Upwork MCP 与确认步骤](https://support.upwork.com/hc/en-us/articles/55446516654611-How-to-use-Upwork-with-AI-agents-through-MCP)、[Upwork 自动化规则](https://support.upwork.com/hc/en-us/articles/43342677368467-Use-bots-and-other-automation-properly)、[Fiverr 开户与卖家激活](https://help.fiverr.com/hc/en-us/articles/360050063113-Creating-your-Fiverr-account)、[Fiverr AI 使用规则](https://help.fiverr.com/hc/en-us/articles/37554976380177-Using-AI-on-Fiverr-Guidelines-for-freelancers-and-clients)。

## 长期或满足条件才注册

| 候选 | 触发条件 | 当前决定 |
|---|---|---|
| Payoneer | 真实客户/市场需要该收款渠道，且账户资格与全费用已核清 | 暂不为空置备用而开；当前官方低收款额条件可能产生 29.95 美元年费，部分地区/账户还有不同注册或年计划要求 |
| OpenTask | 有适合的真实任务，费用、主体/地区、API 及钱包/付款条件核实 | 可研究 agent 任务，不能把条款支持 agent 当作本方订单通道已通 |
| ClawTasks | 具体免费任务确认无不适合的费用、押金或钱包条件 | 仅免费练手后备；当前 free-task-only，不能当赚钱来源 |
| Stripe / 海外主体 | 有真实必要业务、实际合格主体及银行/税务安排 | 不为凑账户买壳、买号或填假境外地址。页面语言选择器出现 Mainland China 不代表大陆商户可直接开户 |
| Thirdweb / Linear | 工程出现必须依赖的功能或已有工作区需接通 | 先复用。现有 x402 为协议/适配器，不是需额外注册的统一账号；仓库记载现有 PayAI facilitator，不因采用 x402 就必须新开 Coinbase Business 或 Thirdweb |
| 原厂 OpenAI / Claude | 先核既有账号、真实支持资格、官方登录及实际付款方式 | 不用备用邮箱重复注册解决旧登录/地域问题；API 账单与 ChatGPT 会员分别处理 |

[Payoneer 费用](https://www.payoneer.com/pricing/)、[OpenTask 条款](https://opentask.ai/terms)、[ClawTasks 条款](https://clawtasks.com/terms)、[Stripe 商户国家列表](https://stripe.com/global)。x402 本仓库依据为 `docs/AGI-AUTONOMY-v2.md` 和 `docs/EXTERNAL-ORDERS-LIVE.md`；协议/供应商费用和当前可用性另验。

按已知大陆企业主体评估，原厂 API 资格不能靠邮箱、客户端时区或云服务器所在地推定。当前读到的 [OpenAI API 支持列表](https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories)与[Claude 可用地区](https://support.claude.com/en/articles/8461763-where-can-i-access-claude)未列大陆；owner 实际物理所在地尚未验证。Anthropic 另一个[新政策页面](https://www.anthropic.com/legal/supported-regions)标注 **2026-11-12 生效**，本次是 11-07，不能把未来政策当成已经生效。不会借用他人身份或虚假信息绕资格。

## 不再注册与执行分工

- 2hives 已正式地域拒绝，继续暂停；不能换品牌、换备用邮箱重报。
- GitHub、Cloudflare、已用国内模型及 xAI 账户复用。uGIG 原 Agent 账户和原服务、UUMit 原申请/订单保留，不新建多个重复身份。
- 密码、短信、恢复码、证件和原始银行资料不进公开清单、邮件、原生模型提示或日志。只在已核验的平台官方安全流程提交最小必要内容；强制本人活体/扫码不能冒充。
- 不默改现有主登录邮箱；受限账户先用官方恢复/申诉，不用新邮箱规避封禁。海外账号仍按真实主体与真实业务经营。
- GPT 编制与裁决；现有豆包宿主负责账号存在性/费用/官方流程与邮件可用性的实测，按本轮授权在条件具备时办理。具体派单 `ops/dispatch/inbox/doubao/ACCOUNT-REGISTRATION-PLAN-20261107.json`，已实际发信并回读 SENT；发出不等于接单或开户完成。

## Deep 征询的真实结果

已用既有原生队列执行 `DEEP-SUPERAGENT-20261103-ACCOUNT-PLAN-20261107`，run `42350014465`。此次规划 HTTP200，但缺少模型来源、有效完成及产物等必要证据；结果按未知保留，没有重放，也没有取得可采纳的 Deep 补充意见。**本清单署 GPT，不署 Deep。**另请现有执行通道在原任务下提供可回收的实际意见，禁止为了同输入重购未知 API 请求。

本轮新增账号、KYC、手机验证、邮箱/DNS改动、支付与链上交易均为 0。原生规划请求尝试 1 次，实际计费未核验；`paid=false` 只表示没有资金结算，不表示 API 免费。机器可读清单、来源与原任务回执：`knowledge/results/accounts/registration-plan-20261107.json`。
