# LTZZZ离线运行与国内算力接管
Owner无需保持本对话或桌面在线，后台任务在GitHub Actions/Cloudflare运行。不能保证第三方永不故障；运行依赖现有Key额度、GitHub Actions及Worker/RPC可用。
## 本次实际代码切换
- 日课删除GPT与微软委托GPT的OpenAI调用，保留disabled_by_owner回执。
- 已资助客户订单：GPT逻辑服务默认由DeepSeek执行，豆包独立审核，记录actual provider，不冒称GPT模型跑过。Doubao/DeepSeek互审；XAI为备用。未知/截断模型响应不盲目再次购买；已知鉴权/余额拒绝可换通道。
- WEP3契约雇佣：豆包交付、Kimi国内审核，XAI备用；DeepSeek仍为雇主，因此审核排除DeepSeek与Doubao，不能同模型自审。无独立通道则阻塞，不冒报验收。
- AGI子网：国内DeepSeek、豆包、Kimi先审核，XAI备用；角色身份和实际模型均记回执。GPT只是既有逻辑雇主注册标签，不发OpenAI请求。
- 部署/外部履约工作流不再注入OPENAI_API_KEY。没有付费订单不启动履约模型。
## 既有后台安排
日课双档UTC22:00/06:00；AGI闭环UTC03:40/09:40；外部订单每6小时；Hub小时巡查；国内六文件讨论错开日期；YouTube每天15:17UTC；公众号DeepSeek11:20UTC生成稿，草稿/发表单独核验；投资按既有受限执行器计划。均以实际Actions/链上回执为成功依据。
Manus每日Instagram派单已落盘，远端定时计划仍待实际接单启用回执，不将Hub文件算成已开启。抖音和视频号暂停。桌面GPT每日任务已撤销，仅单次应急，不能重新启动付费日课。
## 失败处理
已有幂等任务、租约和有限重试沿用；重复运行复用回执，付款未知不换签名重复付。代码/身份/权限错误留blocked与日志，需要工程修复；不声称模型已自动修复代码。真正平台登录、验证码、个人钱包签名仍可能需要owner。
这里只切换上述运行链路，旧GPT代理端点与未列插件不属于已完成迁移；任何来源不明自动化不得继续消耗OpenAI Key。
## 交接
入口AI-START-HERE.md及本文件。主责：国内模型交付/交叉评审、XAI备用、Workbuddy Hub调度记录、千问独立审计。每天查知识与结果回执，不依赖各聊天窗口醒着。不额外购买订阅或充值。

## 本轮真实验收（2026-10-14 UTC / owner本地10-13）
- run38506497337：DeepSeek v4 pro输出195tokens，豆包2.1pro独立审核127tokens，OpenAI0calls、交易0；首次网络请求失败后使用既有IPv4优先设置复测通过。
- run38506215215：WEP3部署及国内路由反例测试通过；无外部订单，模型调用0。
- run38506497556：子网代码及24项验收通过，本次push不执行付费日课。
- 每6小时订单流程run38506817133：orders=[]、model_calls=0；Aave实际http500/market_exception、tx_hash=null。Actions成功不代表投资成功，仍需修复受限执行器旧intent问题。
- 自动总控本日复用历史GPT审查文件，新的国内路由是代码已更新，不把旧审查冒称本轮国内模型生成；下一日期按新代码执行。规划新增wep3/offline-runtime回执读取，防止遗漏投资和算力故障。
- 金库实时USDC349.898316、ETH0.002、aUSDC0；新308.085191到账，但未执行新投资。
