# LTZZZ Pulse / ANS

基于 owner 上传的 ANS 设计和 Pulse v0.1 重写为 v0.3，吸收 Claude / XAI 审计建议，不冒充缺失的 Claude v0.2 原代码。

`node --test workers/pulse-worker/test.mjs`。

部署入口：`.github/workflows/deploy-pulse.yml`，使用既有 Cloudflare Secrets。Token 自动生成并注入，用户无需抄密钥。部署后 `/run` 首次采样并启动 Durable Object 五分钟 alarm；不占已用满的 Cloudflare Cron 配额，不调用模型。

`GET /health`、`GET /status`、`GET /schema`；`POST /run`、`POST /control`、`POST /incentives` 必须对应角色 Bearer。总控与千问具有相同运维控制能力：暂停/恢复、调整并发配置、派单、确认消费。可通过现有 GitHub 身份触发 deploy-pulse.yml 的手动 control 操作，无需 GPT 在线。实际后台账户和链上签名权不会因为模型岗位名称改变；支付仍由原有签名执行器执行，心跳采样不转账。

连续三次单 Agent 故障暂停，连续两次恢复自动恢复到总控配置并发；不是只降不升。人工/控制器明确暂停不被健康采样擅自撤销。HTTP health 仅证明代理/凭证配置，不证明真实生成可用、余额足够或模型质量合格。RPC 故障不当作余额 0。低余额/突降是资金告警信号，不冒充链上冻结。

奖惩使用现有 action-policy 和独立交付证据哈希重算；网络故障不扣分，内部积分不是真钱。外部 hourly watcher 同步只读状态与行动分，Subnet.award 和订单执行器使用健康闸门，过期数据明确标未知。告警保存在 /status、仓库回执和 Actions；未启用主动 Telegram 通知。

阶段观察从首次真实部署起计，保留 ≥14 天数据评估误报；这不阻止已授权的代码修复和自动恢复。来源项目链接未经本轮独立核对，作为设计启发；“魄/识神/植物神经”是软件设计类比，不是已验证生理机制。
