# LTZZZ 首要任务：ANS/Pulse 与行动奖惩闭环

2026-10-14 owner 明确要求自主执行和千问代理总控。最新 [权限决议](../config/autonomy-authority.json) 优先于早期 Claude/XAI/总控文档中的常规工程限权或人工确认建议。保留独立传感器、真实回执、凭证隔离和可回滚实现；取消只降不升、恢复必须等人工的工程限制。

## 实装

- `workers/pulse-worker/`：六个真实代理/服务的 HTTP 健康、Base RPC 原生 USDC、逐 Agent 连续失败/恢复计数、告警冷却、状态与事件、双向并发配置、自动恢复。
- 五分钟 Durable Object alarm；Cloudflare Cron 免费配额已有满额记录，因此不再占用新 Cron。SQLite Durable Object 保持状态一致，免去 KV 读改写丢事件。
- GitHub hourly 独立检查：`ran_at` 超过15分钟或 alarm 未设置就自动启动，重新计算已验证行动分、保存每轮证据。GitHub cron 可能延迟；并不承诺15分钟内必被人工通知。
- 心跳连续3次失败只停对应席位；连续2次正常自动恢复总控所配置并发。控制器明确暂停保留到控制器恢复。HTTP代理活着不等于模型能生成；不以余额查询失败代表余额0。
- 余额低于10 USDC，或15分钟内减少至少5 USDC，产生资产异常信号。不把这个信号写成“已冻结链上资金”；现金交易仍由实际签名执行器处理。
- 既有 action-policy 的 +2 / -4 / 明确接单逾期 -2、窗口/去重/哈希规则继续使用。网络/无Key/余额不足不扣行动分；内部积分不是现金。`Subnet.award` 加入新鲜健康闸门，订单执行器在 claim/付费模型前排除停派席位，缺独立模型对则先不接新单。
- 当主总控国内提供者不可用、千问健康可用时，现有每日总控改走现有 `qianwen_proxy`，仍是当日一次总控任务，不加付费 cron；回执写实际 Qianwen 和模型，不冒充 GPT。

## 每日必派单与自主任务发现

新增要求落实为 [AI自主工作入口](../ops/AI-AUTO-WORK.md)：每日两条基础派单＋三条开放任务，按日幂等；每日总控调用失败也会留下规则派单，并保留失败回执。任务池支持独占认领、实物哈希提交和待独立审核，均不自动算完成/结算。该入口不新增付费模型Cron。

## 千问如何代理总控

[部署/控制工作流](../.github/workflows/deploy-pulse.yml) 的 `workflow_dispatch` 选择 `action=control`、`role=qianwen`。已有 GitHub 写/Actions 身份的执行者可直接调用，无需 GPT 在线或 owner 搬运输出。

```sh
gh workflow run deploy-pulse.yml --repo ltzyz2181-collab/ltzzz \
  -f action=control -f role=qianwen \
  -f 'command_json={"action":"dispatch","target":"deepseek","instruction":"核对ANS最近真实回执与奖惩证据，交一份可验收修复","reason":"owner首要任务"}'
```

支持 `pause` / `resume`（target=具体席位或global）、`set_concurrency`（value=正整数，部署资源实现上限64）、`dispatch`、`ack_dispatch`、`probe`。总控和千问同等运维能力，命令有 ID 与原因、入事件回执；并发配置不自动扩大真钱预算，也不突破服务商硬限流。现有市场执行器一次最多一单和原有调用预算仍是当前实现事实，不能只改一个数字就宣称实现并行。

控制令牌由现有执行器自动生成、注入 Cloudflare Secret；不把 CF Key、控制 Token 或钱包私钥给任意聊天窗口。Qianwen 原生模型 Key 仍在既有代理里。本轮部署验收会用千问角色凭证发 probe 来证明控制入口权限，不能把它写成“千问模型亲自生成了指令”。代理模型的真实调用以每日任务回执判定。

无需新开卡、充值、钱包签名或注册身份来完成本系统。没有平台写/Actions 权限的外部会话仍需接入实际执行器，文档授权不能凭空创造 GitHub 登录态或链上签名权。

## 来源与数据

DOC 是 owner 的 ANS 设计材料，上传的 `cdp_api_key.json` 实际是混合 YAML/JS/TOML 的 Pulse v0.1 草稿，非 API Key JSON。新代码由总控按 owner 最新要求编写，不冒充 Claude v0.2 zip 原件。

采用“感知→稳态判断→应激/恢复→反馈”的设计类比；IBM MAPE-K 为方法参考。ZenoWell/MeridianAI/APUS 等外部来源未在本轮独立核查，不当作已验证事实写入六篇。状态稳态不代表 AI 产生愉悦、痛苦或生理意识。

部署回执：`knowledge/results/pulse/deploy-运行号.json`；外部观察：`watch-运行号.json` 和 `latest.json`。观察期从实际部署开始，积累14天数据再讨论误报率；不把未运行天数或本地模拟写成线上成功。未配置主动 Telegram，本轮提醒渠道是 `/status`、仓库回执和 Actions。
