# 豆包协助总控：席位与部署收尾

状态：prepared，尚无外部豆包接单回执。授权：owner 本次要求豆包协助总控执行。

1. 用现有章鱼猫或 VC 浏览器已登录会话核对 Cloudflare 的 qianwen/kimi/deepseek/xai/doubao Worker 名、当前版本与变量名；不复制 Secret 值。
2. 独立测试 seat-registry 的规范入口；Grok 先用 api-xai，豆包先用登记的 workers.dev，不能用失败别名推断席位整体离线。
3. Kimi 查询国内账户可用模型后验证 kimi-k3；不支持时记录实际错误，不冒名映射。配置请求预算至少 3000，默认 8192；不能撤销供应商余额或 RPM 限制。
4. 部署本补丁后，每席发一次唯一 task_id 的最小派单；核对 ltzzz_receipt 的 DID/requested_model/provider_reported_model/observed_at/upstream_http/finish_reason。HTTP 200 但空 content 或 length 不能算成功；回执未签名，不是密码学证明。
5. 登录 OGCard 后只读核对当前卡状态、充值币种及网络、最低额、手续费和充值入口；核对连连卡消息。不得转账或提交付款。
6. 回仓库提交脱敏版本号、DNS/HTTP 实测时刻、接单及交付；无法执行逐项标 BLOCKED，不把本文件当接单或完成。
