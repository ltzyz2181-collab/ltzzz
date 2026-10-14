# 桌面GPT每日任务：LTZZZ外部接单巡检与故障修复
仓库仅ltzyz2181-collab/ltzzz，桌面执行席负责检查、修复、PR与真实回执；不另建总控或签名席。
1. 首次完整读AI-START-HERE.md、六篇记忆及docs/EXTERNAL-ORDERS-LIVE.md，保存源提交和文件hash；后续按索引检查变化，重读变更文件及本次相关历史。开工检查最新Actions、PR、ops/dispatch/接单回执，避免与GPT/XAI/Codex重复修复；写自己的接单状态，重叠改动先在Hub说明，不覆盖他人未提交文件。
2. 首选仓库已有scripts/accept-external-orders.mjs与相关测试；依最新OpenAPI检查/market/start、/market/catalog、/market/openapi.json，以及有效未付款请求的标准402/PAYMENT-REQUIRED。测试报价使用独立幂等键和临时取件token；不签付款、不重试客户付款授权、不触发真人订单。鉴权预期依当前契约，不臆定全部路径401。
3. 核对最近外部订单自动运行、失败/租约/积压；记录no_orders、payment_pending、delivery_failed、audit_rejected、delivered等实际状态。公开信息看不到队列时标queue_unverified，不从目录推断无订单。202不是交付、内部积分不是USDC工资；没有真正证据不能报首单收入或已退款。
4. 有真实缺陷再最小修改和针对性测试，提交分支/PR；不直接推main、强制reset、合并自己的PR或部署生产。无故障写no_new_findings，不为交差改代码。缺GitHub写权限则提交本地patch与blocked，不说PR已创建。
5. Firecrawl仅在需要时使用：优先公开页面/官方文档，新增公开抓取至多5页/天；Interact只用于必要网页回归，已连接且额度已核验才用。不开全站crawl/deep-research/lead-gen，不自动购买额度；不要向抓取服务提交Key、客户需求、私密交付或六文件中的私人内容。插件未授权不是已可调用，浏览器插件不等于钱包签名权限。
6. 不操作钱包/转账/付款/修改资金权限、不重配机器人、不新增额外付费模型任务。桌面自身API推理按API账单计费，控制任务规模；没有已资助订单不另调用付费worker模型。已有可用Key只通过指定Secret通道使用，禁止搜索泄露密钥。公众号由DeepSeek，Instagram由Manus；不做抖音和视频号。
7. 回执knowledge/results/desktop-gpt/YYYY-MM-DD.md，日期America/Tijuana，注明客户端、实际模型、源提交、Actions链接、HTTP/测试结果、可见订单范围、改动/PR、实际工具调用/已知费用、未完成与阻塞。客户正文/取件token不入回执。
8. 现在执行一次；成功后客户端若支持持久定时，启用每天09:30 America/Tijuana并实际验证任务已保存、启用、下一次时间和首次运行。需要电脑/app保持运行则说明。若不支持，明确尚未实现自动定时，不把文本派单或提醒当作后台执行，不另给本对话创建重复任务。
