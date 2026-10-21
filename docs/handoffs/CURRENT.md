# LTZZZ 精简接力入口

类型：事实索引与未完成项；替代重复读取长对话。具体状态只引用原始回执，不在本页复制余额与多份状态。

最新巡检分工：[千问与Actions验收规则](../QIANWEN-ACTIONS-AUDIT-CONTRACT.md)。Actions持凭证并留真实调用证据，千问只审文件与回执，不复制Token。共用GitHub账号不证明模型来源；Claude外部材料与国内代执行分别署名。#170已合并，豆包Pro已补交，不能继续沿用旧“未合并/未修复”清单。

## 最新纠错：席位和豆包日课

当前分工及五签/观察席区别见 [SEATS-AND-GOVERNANCE-CURRENT.md](../SEATS-AND-GOVERNANCE-CURRENT.md)。GPT总控仍在任，关闭的是原厂付费日课；Claude为观察、独立审计与规划席，仓库写入已验证；Microsoft除名。

豆包日课已修复上线：#175/#177/#178。真实运行39559504877经既有鉴权Worker返回Pro完整读后感和视频脚本，原件 [2026-10-21-doubao-pro-key-repair.json](../../knowledge/results/daily-recovery/2026-10-21-doubao-pro-key-repair.json)，独立于被审输出的总控复核见同目录`2026-10-21-doubao-controller-review.json`。这是补交草稿，原轮超时不改成按时交付；不表示视频已生成/发布或所有日课已完成。api-doubao别名仍未配置，不影响日课当前使用的workers.dev通道。

## 权威入口

- 岗位、分工：`identity/seat-registry.json`、`config/claude-team.json`。
- 实际DNS/HTTP：`identity/endpoint-status.json`；公开名片为`/api/agents/<seat>/card.json`。health不证明模型生成或额度。
- 钱包登记：`wallet/addresses.md`；不读聊天缩写，不把岗位任命当私钥或链上签名权。
- 当日派单/认领/交付：`knowledge/results/daily-board/`；ANS：`knowledge/results/ans-cycle/`。
- 工作秘书：`knowledge/results/dispatch/sentinel-latest.json`；这是代码扫描，不冒充WorkBuddy客户端常驻在线。

## 已完成与正在部署的区别

PR #161登记为Claude外部仓库审计，已合并；GitHub共用账号只证明写入，原生提供商身份仍按归属说明标为外部自报。Claude在任“独立审计＋规划”。原厂API欠费并不取消已收到的外部审计材料。Microsoft沿用最近任命“暂时除名”，不恢复旧GPT代执行额外日课。

PR #162已合并：7个在任岗位存在可读健康入口；18个公开名片路径线上读取通过。豆包正式Worker HTTP200，api-doubao别名ENOTFOUND；Grok以api-xai为准，api-grok别名失败。api-claude自定义域名绑定403/code10084，workers.dev只读名片入口已上线；该入口无推理。

旧运行39413172927曾因Base RPC只读对账失败。最新39513398544已成功完成部署、核心验收与只读对账，financial_book_unchanged=true，未新增签名或转账；保留旧失败原件，不将旧告警当当前状态。

OWNER-EXT-AI-20261020-01只接受为`paid_delivery_accepted_engineering_draft：复述提示词＋回归件，非原创设计、非生产部署`。下一单盲测提示词已改，新增价值须独立复现；本轮不再购买。

## 本轮变更验收入口

代码注入执行者、实际请求型号/提供商返回型号、任务引用及UTC时间；正文自述身份不可信。HTTP200空内容或length不是完整交付。

Kimi质量配置见`lib/kimi-profile.js`：官方目录确认后优先K3；默认16384、派单最低3000，撤掉应用层输出上限、固定RPM和单并发。保留认证、一次性任务认领、独立复核以及提供商真实限额/欠费反馈。没有新付费定时。

千问为独立审计与总控备援；豆包做执行部署/流水线，已派固定辅助清单；WorkBuddy代码哨兵关联真实任务ID和回执，不代AI接单。新的线上结果保存在`knowledge/results/identity/provider-execution-*.json`及豆包派单回执；没有回执前只说待验收。

聊天记录不能由本仓库删除或重置产品额度。本页仅压缩任务上下文；长期原文、付款与审计原件继续保留。

## 本轮实际交付

- 六个模型代理的新身份回执版本均已上线：knowledge/results/identity/provider-execution-39513398647.json。
- Kimi原生验收39513546192 attempt2完成：实际kimi-k3，stop，6020 token，哈希绑定审核成功；审稿结论拒收历史工件，不是服务调用失败。原件knowledge/results/wep3/kimi-native/issue-167.json。
- K3指出TREASURY_001的actual/expected一致而passed=false。总控独立重放当前纯校验器得到true，确认历史记录有矛盾；不篡改旧回执，补充未来逐字段比较、响应哈希与代码版本。原因仍不能仅从旧日志推定。
- 豆包真实交验收清单：1636 token；由总控复核并明确修正api-deep域名缩写和Kimi新增服务Token绑定的表述，验收仅限辅助清单。
- 当前未完成：api-doubao/api-grok别名未解析、api-claude域名补权、Claude原厂额度、其他被拒收日课工件的整改；豆包10-21补交已另有Pro真实验收与总控复核。不把元数据健康当全部原厂API恢复。WorkBuddy每小时代码哨兵已运行，客户端常驻仍未验证。

国内Kimi代理统一到已核验Moonshot国内Key与官方CN接口；国际Kimi账号另算。其他模型Key保留。此绑定通过既有GitHub Secret完成，值不进对话或回执，目录GET不算生成。
