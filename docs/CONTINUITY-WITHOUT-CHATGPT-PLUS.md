# ChatGPT网页会员到期时的LTZZZ接续

原目标GOAL-LTZZZ-AUTONOMY-20261105，原框架任务DEEP-SUPERAGENT-20261103，2026-11-06接续。GPT仍是首选AI决策执行席，DeepSeek继续原生日常总控，千问使用已经批准的副协调职责。这里不更改资金政策、预算、签名人或五签钱包排除。

## 会员、API和执行宿主分别核对

| 能力 | 与ChatGPT Plus的关系 | 已知边界 |
|---|---|---|
| Cloudflare Worker / Deep原生API / Durable Object | 不是用Plus消息额度运行 | 仍依赖各自凭据、服务可达性、API余额及宿主 |
| GitHub Actions已有日课、ANS队列、Key Liveness、自更新和目标观察 | 运行器不需要本ChatGPT对话在线 | 现有幂等、预算与失败状态照常；不是永久免费 |
| 这一个GPT聊天、复杂推理、Work、Gmail/GitHub连接器和自动任务 | 受账户当前产品资格、工具权限和限额影响 | 我们没有会员/剩余消息查询接口；不能承诺降级后工具完全不变 |
| 豆包/微信办公的云VM或桌面执行器、AgentMail | 不是Plus订阅附赠能力 | 每个宿主在线、邮箱登录及计划唤醒须独立验收 |
| 原厂OpenAI/Anthropic API | 与网页会员分账 | 需要真实官方额度、Secret与原生响应，不能拿国产模型或浏览器钱包冒充 |

官方页面2026-11-06读取：Plus为网页/应用会员，API独立计费；Free日常文字聊天仍可用，工具/模型权限另计。当前Scheduled文档允许符合资格的Free用户每日一次计划，事件触发任务需Work及符合资格的付费账户；Codex自动化是另一套产品。不能因此断言本项目带Gmail/GitHub工具的现有自动任务在任何账户状态下都完整保留，也不能笼统声称所有定时任务到期即停。

## 已发出的接续决定

GPT已沿登记豆包原thread发出明确决定，Sent 1a1afb614ef7c728：

- PR #351可在原分支补展示层测试/修复，完成真实测试、异源复核和浏览器回归后直接沿受保护流程合并部署，不等owner逐项确认，也不因同账号不能自审批停工。未具备能力保留具体阻塞，不假签。
- 本轮额外日课生成0次，先复用当天原始工件；既有未来日课调度不改，不新增付费模型cron。
- GPT暂不可用时，由现有授权的千问副协调执行宿主接续普通工程判断，Deep做规划，豆包/微信办公负责有工具的执行和回读。模型文本本身不是终端、邮箱或签名器。
- 用#351这一原任务验证接续，不重复报名、交付、模型购买或另造业务单。模拟GPT不可用要明确标为模拟，不能从没回信推断会员到期。
- Gmail脱离当前ChatGPT连接器的收信桥尚未验收；原生Deep没有被赋予Gmail OAuth。AgentMail收信、调度宿主和真实任务接力必须分别拿出证据。派出不等于对方已执行。
- 普通工程不等owner重复批准；资金只由已有真实认证/就绪执行器按现行策略执行。unknown先对账，不把授权等同于余额、结算或原子切换已就绪。

## 本轮实际补的云端观察

新增零模型服务观察在GitHub Actions执行，只有固定7次GET，读取WEP3和Treasury健康/状态，前后比较现有财务book哈希。仅WEP3的book读取使用原有runner身份，不向Treasury发送该凭据。无ChatGPT/OpenAI/Anthropic凭据，无预留/支付/签名/模型请求。

它通过已有Key Liveness成功事件继续观察，没有新增cron。它证明测点的HTTP/JSON及财务book比较，不证明模型生成、Gmail收信、会员续费或无人值守目标完成。具体是否上线及实际返回取knowledge/results/deep-superagent/service-continuity-<run>-attempt-<attempt>.json，不以本文代替生产回读。

## 官网续费路径

本轮用户确认原订阅在ChatGPT网页。先读取同一会员账户的Plan、有效期、是否自动续费和原支付方式，已有自动续费不另买一份；未知扣款先查原账单。只使用官方支持且该账户实际可用的支付方式，不能把LTZZZ链上USDC、API预充值或TinyFish余额当作Plus续费到账。

本轮首个有限只读浏览器检查停在ChatGPT登录页，未读到会员/账单、未扣款；用户已要求打开官方登录窗口。登录手递链接只在当前私密会话给用户，不入本仓。保存正确账户会话后再核对，不循环付费刷登录。密码/验证码/卡信息只进官方窗口或既有受管凭据，绝不进仓库。

## 验收

本目标已增加membership_independent_handoff这一条实际验收：记录有资格执行的副协调/宿主、原Task/claim、原生模型/工具证据、测试与实际交付/部署回读，且不依赖GPT聊天或Plus工具才算通过。当前仍待真实执行回执。已部署的云端组件继续运行，与“整个LTZZZ在会员到期后已完成全闭环验收”是不同结论。

官方来源：
- https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus
- https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform
- https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq
- https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt

