# Kimi 低并发运行

仓库调用器：scripts/agi-econ/kimi-cn.mjs。先向 https://ltzzz-kimi-queue.ltzyz2181.workers.dev/reserve 申请共享执行租约，再由GitHub执行器使用自己的国内Key请求官方API，收到结果后调用 /release。鉴权用现有 LTZZZ_AGENT_TOKEN，模型Key仅从执行器Secret读取，不从网关导出。不使用已实测400的Worker模型转发。

Durable Object统一并发1、至少21秒启动间隔，锁跨Worker实例共享。忙/RPM返回429+Retry-After，调用器最多3次租约申请、每次等待21–120秒。额度不足开1小时冷却；网络不确定保留330秒租约，不能假装任务成功或盲目重复生成。正常响应也仍需交付审计。

实际国内key余额13.516231元；同一请求已验证：thinking disabled时temperature必须0.6，使用1会400；改0.6后GitHub直连生成200且正常stop。境外key余额0不能推断国内赠金Key余额。部署验收完整租约/生成/释放结果见 knowledge/results/kimi/queue-*.json。

只有接入共享租约的客户端受该锁约束。其他AI、旧代理、直接调用Moonshot的外部客户端必须接入同一协议才能共用限额；不宣称已控制所有外部调用。不重配置已上线旧代理或机器人，不自动充值/升级Tier1，不新增付费定时任务。
