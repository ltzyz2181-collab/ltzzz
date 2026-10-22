# 派单通道与实际执行方

类型：工程规则；2026-10-22。实测结果以 `knowledge/results/dispatch-channels/DISPATCH-CHANNELS-ISSUE-*.json` 为准。

## 本轮修复

Pulse 过去把可派单对象等同于健康监控 `targets`，因此 Claude、Meta、WorkBuddy 不在 `/control dispatch` 可接受名单内。现在使用单独 `dispatch_targets`，不虚构健康地址，也不把外部客户端加入 HTTP 故障惩罚。GPT 和千问权限一致，微软正式席位仍暂时除名。

已注册派单目标：GPT、豆包、DeepSeek、Grok、Kimi 国内、千问、Claude、Meta、WorkBuddy、Manus、Kimi 国际；WEP3 服务保留兼容目标。

## 一次真实验收

Owner 创建标题以 `[LTZZZ派单验收]` 开头的本仓 Issue，触发固定 Actions；Issue 正文不能传命令、URL 或模型参数。先提交唯一编号/nonce 预留，再执行：

1. 千问原生 API 最多一次、512 输出 tokens，返回固定 nonce 和路由清单；这是通讯复述，不是原创业务设计。记录提供商实际 model、finish_reason、request_id、用量，不能用模型自报身份。
2. 以千问独立认证角色向各席发 `probe_only` 派单，逐单回读 id、目标、issuer、原文哈希；重点三席重复同一幂等键只产生一条。
3. 托管 Meta 只生成一次 nonce 短回复。实际供应方是 Cloudflare Workers AI / Llama，不是外部 Meta 客户端。旧部署随机 token 只留临时文件；现在可从既有受管凭证派生专用执行 token（或使用已配 Secret），只进 Worker Secret，不进仓库。
4. WorkBuddy 职责自动化执行一次真实仓库文件核对及 SHA-256，随后由认证执行器回读确认；不能标成原生 WorkBuddy 桌面模型。
5. Claude 仅检查公开元数据并签发真实收件卡；免费客户端没有经过验证的自动唤醒接口，不尝试付费 Anthropic API，也不代造 Claude 接单。

没有新增 cron、USDC 付款、投资、签名或发布。模型 API 用量与 USDC 结算分别计数。超时不自动重发、不重购；已有预留的 Issue 重跑不会再次调用模型。

探针状态为 `probe_waiting_consumer`，不能被普通日课当新付费任务消费。普通 `ack_dispatch` 不得把探针算成真正接单；有实际规则/Llama实物才记 `probe_consumed_by_verified_executor`，并明确 `native_client_verified=false`。历史业务派单不能为了挤进测试而被静默丢弃，容量满时明确拒绝并要求核对。

## 外部席接力

各席读取 `ops/dispatch/inbox/<seat>/DISPATCH-CHANNELS-ISSUE-*.json`。回执按卡内 `expected_return` 路径写入，引用原 task_id、nonce、实际执行环境和模型元数据来源。没有实际工具记录就写未验证。派到仓库、模型生成、客户端接单、业务验收、部署、付款仍为不同状态。

## 桌面身份纠正

Owner 最新明确：界面是 Microsoft VS Code / GitHub Copilot，所配模型是 DeepSeek。记录见 `identity/desktop-client-routing.json`；Microsoft 不能因提供界面而获得 DeepSeek 的产出署名。每次真实执行仍以工具/提供商元数据核验，不采信模型自称。
