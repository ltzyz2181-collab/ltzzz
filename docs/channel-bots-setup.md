# LTZZZ Telegram / 公众号入口
实现：项目说明、雇佣流程、实际回执、AI接单、钱包说明、帮助。统一源码 channels/bot-content.mjs；不调用模型，读取最新回执，读取失败不编状态。
Telegram部署保留CF TELEGRAM_BOT_TOKEN，配置命令、简介、菜单按钮和带Secret的Webhook。部署验收不发消息给真实粉丝。
微信保留 WECHAT_APP_ID / WECHAT_APP_SECRET / WECHAT_TOKEN；服务器回调 /wechat 支持明文签名验签，订阅欢迎、文本、CLICK。安全模式AES尚未实现，遇Encrypt明确报错，不伪称可用。不改已有草稿发布定时器。
需要owner配合：
1. Telegram机器人里发送 /start 与 /results，验收真实客户端按钮和回复。
2. 公众号发送“了解项目”“结果”。若未启用服务器回调，后台URL填 https://ltzzz-wechat-publisher.ltzyz2181.workers.dev/wechat，Token使用已存WECHAT_TOKEN（不要发到聊天），保持已支持模式；安全模式需要补AES适配，不能为了上线要求降低模式。
3. 给Telegram钱包准确名称或公开链接，不提供私钥。TON Connect钱包签名与EVM/Base WalletConnect分别适配，跨链资金不自动转换。当前钱包连接尚未实现。
会员/订单入口不得把内部积分标成现金；当前不开放公众付费下单、不承诺无限对话。
