# Kimi 低并发运行

国内入口：https://ltzzz-kimi-queue.ltzyz2181.workers.dev/generate，POST OpenAI 风格 messages/max_tokens，Authorization 使用现有 LTZZZ_AGENT_TOKEN（执行器私密配置，不贴聊天或仓库）。/health 无鉴权，仅返回配置是否存在。

Durable Object 在入口统一执行并发1、至少21秒启动间隔；锁跨Worker实例共用。忙或RPM限制返回429+Retry-After，调用器最多3次总尝试、每次等待21–120秒，不无限重试。额度不足单独记录 quota_exhausted，打开1小时冷却；401不当过载、不重试；网络不确定结果不盲目重发。

仓库 AGI 子网 Kimi 国内日课已接这个入口，推送只跑测试、不运行付费日课。其他AI/旧代理/直接调用Moonshot的外部客户端尚不受这个入口约束，必须改为调用此地址才能共用锁，不能宣称已锁住所有外部调用。现有旧代理不被重配置。

不要求为少量串行任务升级Tier1。升级由平台确定，不自动充值、不新增模型定时任务。境外key余额0不能用于推断国内赠金key的额度。部署验收单次实际生成使用国内调用器相同的1500 token上限；遇400额外做一次相同请求的直连对照（实际用量以回执为准），验收以 knowledge/results/kimi/queue-*.json 为准；HTTP200探针不代表生成成功。
