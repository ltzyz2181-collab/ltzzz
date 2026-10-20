# LTZZZ 精简接力入口

类型：事实索引与未完成项；替代重复读取长对话。具体状态只引用原始回执，不在本页复制余额与多份状态。

## 权威入口

- 岗位、分工：`identity/seat-registry.json`、`config/claude-team.json`。
- 实际DNS/HTTP：`identity/endpoint-status.json`；公开名片为`/api/agents/<seat>/card.json`。health不证明模型生成或额度。
- 钱包登记：`wallet/addresses.md`；不读聊天缩写，不把岗位任命当私钥或链上签名权。
- 当日派单/认领/交付：`knowledge/results/daily-board/`；ANS：`knowledge/results/ans-cycle/`。
- 工作秘书：`knowledge/results/dispatch/sentinel-latest.json`；这是代码扫描，不冒充WorkBuddy客户端常驻在线。

## 已完成与正在部署的区别

PR #161为Claude本人外部仓库审计，已合并；Claude在任“独立审计＋规划”。原厂API欠费并不取消已交付的外部审计。Microsoft沿用最近任命“暂时除名”，不恢复旧GPT代执行额外日课。

PR #162已合并：7个在任岗位存在可读健康入口；18个公开名片路径线上读取通过。豆包正式Worker HTTP200，api-doubao别名ENOTFOUND；Grok以api-xai为准，api-grok别名失败。api-claude自定义域名绑定403/code10084，workers.dev只读名片入口已上线；该入口无推理。

WEP3部署39413172927实际代码、核心验收及资金账本保持不变已验证，但最后只读Aave对账因Base RPC不可用失败。整条运行是failure，不能写全绿；既有签名交易不重复广播。未完成对账交安全/执行席定位，不在本轮新增投资或付款。

OWNER-EXT-AI-20261020-01只接受为`paid_delivery_accepted_engineering_draft：复述提示词＋回归件，非原创设计、非生产部署`。下一单盲测提示词已改，新增价值须独立复现；本轮不再购买。

## 本轮变更验收入口

代码注入执行者、实际请求型号/提供商返回型号、任务引用及UTC时间；正文自述身份不可信。HTTP200空内容或length不是完整交付。

Kimi质量配置见`lib/kimi-profile.js`：官方目录确认后优先K3；默认16384、派单最低3000，撤掉应用层输出上限、固定RPM和单并发。保留认证、一次性任务认领、独立复核以及提供商真实限额/欠费反馈。没有新付费定时。

千问为独立审计与总控备援；豆包做执行部署/流水线，已派固定辅助清单；WorkBuddy代码哨兵关联真实任务ID和回执，不代AI接单。新的线上结果保存在`knowledge/results/identity/provider-execution-*.json`及豆包派单回执；没有回执前只说待验收。

聊天记录不能由本仓库删除或重置产品额度。本页仅压缩任务上下文；长期原文、付款与审计原件继续保留。
