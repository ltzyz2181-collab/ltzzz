# 国内日课、审计与资金试跑复核 · 2026-10-15

执行者：GPT/Codex 总控。仓库仅 ltzyz2181-collab/ltzzz。输入为 owner 转交的豆包、千问、Claude 回执；来稿意见与独立核验分开。核验基线 66865c6；部署结果在本文件后续补充。未调用付费模型、未签名、未广播、未转账。

## 核验结果

豆包确实加了 canonical daily Worker 的 20 秒 fetch 超时及 ai.status/error，新增 DeepSeek 日课执行器和 UTC22:30 定时。60141bb 是日课错误文档提交，不是全部改动的单一代码提交。实际部署是 Memory OS run 38671614481；38671611539 的工作流名称是静态站点部署，不能也列作 daily Worker 部署凭据。

DeepSeek：已有成功回执 38506497337 与后续连接超时可同时成立；Cloudflare、Azure、本机出口不同，不能宣布所有出口永远不通或充值失效。新通道三次超时重试存在重复计费不确定性；“写出失败文档”不等于“真实内容生成成功”。现撤销这条新增付费 cron，保留原有 Daily Agent Tasks 与总控每日基础派单；手动恢复通道复用流式适配器，单次生成、调用前落盘、同日防重、保存可见部分输出及请求 ID，完整结束且交付结束标记齐全才算成功。读取完整六记忆及装备论，逐份记录字节数和哈希；不再只截取五文件片段。

Worker 原定时数量保持不变。超时覆盖响应体读取；正文为空、只有推理过程或 finish_reason=length 都不得通过。DeepSeek 顶层 ok 依据真实交付，不再固定 true。任务异常不重购模型请求；/run 限 POST＋既有执行身份，未配置认证时 503。部署不调用原厂 GPT/Claude，不尝试激活其 Key。

Claude 指出的 Kimi 配置缺陷成立：WEP3 审计步骤漏传 LTZZZ_AGENT_TOKEN，已补齐；共享排队租约仍保留，不能绕过 Tier0 限流。新增零生成的凭证接线回执，只确认两个 Secret 是否存在，不公开其值，也不把配置齐全写成真实推理通过。XAI 原有备用身份照实记录，作者与审计者仍按实际提供商分离。

## 资金 pilot：纠正时间线

GitHub Actions API 核对：

| run | 时间 UTC | 触发方式 | 实际结果 |
|---|---|---|---|
| 38666978832 | 10-15 01:41:07 | workflow_dispatch | supply 与 exit 两步骤 success，Final status snapshot failure，Commit receipts skipped |
| 38668831603 | 10-15 02:01:58 | workflow_dispatch | success |
| 38669467614 | 10-15 02:09:05 | workflow_dispatch | success；其中只读快照仍失败，被旧代码 `|| true` 忽略 |

该工作流在当前源码及历史版本只有 workflow_dispatch，没有每日 schedule。千问“cron 每天重试同一供给失败点”不符合本次 API 与日志；10-13、10-14 的失败应保留为历史，不据此推断本次仍卡同一步。01:41 的赎回日志包含 `0xcca0d41537b5a7920583149bea7f86e8ed36d841ef72e06d2b1c6f44d4b8ac46`、receipt_status=1、block=52619585。供给 `0xdd783ca6a783c02716bc82d62c7d3f11630e5d40f01a7c40fcbcdb8ba91a49ea` 已由仓库历史回执记录；本轮未重新独立向链上 RPC 取这两笔回执，不将历史记录冒充新重放。

最终快照真实错误：primary RPC timeout，备用 RPC `Too many subrequests by single Worker invocation`。SDK 的 HTTP429 默认最多12次重试会放大此类故障；现限制每 RPC 一次 HTTP 尝试，仍保留完整读取的备用 RPC 切换，未增签、未替换签名、未改变额度。线上仍须验收，不能仅凭本地测试断言网络恢复。

已完成的旧迁移/pilot 工作流停止执行资金动作，改成手动/代码更新触发的只读诊断、快照、已存交易回执复核；不再注入旧钱包私钥或调用 auto。每步失败都继续收集证据，always 上传 artifact、提交回执，最后维持失败状态，不再把快照失败吞成通过。本次不关闭其他独立业务的已有自动化。

## 归属与未完成

Claude 本次来稿已存 knowledge/results/external/2026-10-15-claude.md；原“13项测试”仅能证明 owner 转交过这段文字，不能关联当前 Claude 会话。已追加归属异议，未删改历史正文。

本地验证：45 项针对性测试通过（含失败回执、认证、流式防重、RPC 429 请求上限、提供商独立性、审计出处）；四份工作流 YAML 解析通过。测试执行者为 GPT/Codex，不冒充 Claude 的外部测试。

待验收：本次两服务部署、Kimi 实际生成、DeepSeek 各出口恢复；不为验收新增模型消费。ANS 14天误报观察继续，内部积分不能记为真钱收入。

## 第一轮真实验收与修正

日课 Worker run 38694832757：部署与 Secret 更新通过，06:50:56 UTC 验证 revision=daily-resilience-v1、GET /run=405、匿名 POST=401、model_calls=0。artifact 11954171484 已保存；git 推送因安装工具留下的 tracked 改动不能 rebase 而失败。总控从该 job 原始 JSON 日志代存 deploy-38694832757.json，推送步骤改为 rebase --autostash，只提交回执。

WEP3 run 38694832761 在部署前 CI 被旧的 aave-guard-v4 固定断言拦住，未部署 v5。断言现引用实际版本常量；完整线上同款测试加新增恢复测试共77项通过。测试是总控执行，不能归给外部 Claude。

只读复核 run 38694832784 的失败 artifact 和 inspection 回执均已真实保存，保持 inspection_blocked；其中 diagnostics/reconcile=401（执行身份漏传），status 是旧 v4 RPC 失败。补齐既有派生服务身份，只调用只读端点；未加入钱包私钥或 auto/execute。该失败不算资金试跑失败，后续在 v5 部署完成后重新只读验收。

## 第二轮部署发现

日课 run 38695199291 完整 success，06:54:17 UTC 的线上验收及回执推送均通过。WEP3 run 38695199212 已部署（CF version 00b34cc0-17c7-4fde-8bb8-a35b56121c53），外部契约通过；Kimi readiness 为 configured_for_shared_queue、missing=[]、model_calls=0。但持久对象诊断连续仍返回 aave-guard-v4，因此标记 stale_worker_revision，完整 workflow 维持 failure，不能宣称 v5 已生效。订单履约观察 model_calls=0、orders=[]。

针对已证实的旧持久对象运行时，新增 Cloudflare 原生 renamed_classes：Market → MarketRuntimeV2，保留原 namespace、idFromName('ltzzz-market-v1')、book key、订单、资金及历史意图，不创建新财务存储。部署增加只读状态摘要：验证实际 runtime=v2/aave=v5、历史意图不为空、原有 supply/exit 标志保留，记录 book 哈希；不公开已签名字节。状态验证失败则不进入订单履约。验收仍不发起模型生成或资金交易。

迁移部署 run 38695914949 在首次只读探针收到 HTML 边缘页，旧探针 JSON 解析异常中止，未形成状态摘要。已将探针改为有界等待：逐次记录 HTTP/content-type/版本，HTML 或连接错误也写失败观测，不能再因解析失败丢回执。资金只读 runner 同样保留非 JSON 响应的 HTTP 状态，不保存边缘 HTML 正文。正在重新验收；交易执行通道没有启用。

只读复核 38695199325 attempt 2 在 07:02:22–23 UTC 已实测三项全部成功，aave=v5，供应/退出标志均为 true、无 active_intent；mainnet.base.org 与 base.drpc.org 拒绝后 publicnode 完整读取成功。余额是既有资产快照：315.408481 USDC + 34.490664 aUSDC，本轮未投资或转账，不能记为新增收入。此轮推送因旧 runner 沿用 run-only 文件名，与 main 首次失败回执 add/add 冲突；artifact 已保存。总控从原始 job JSON 日志按 attempt-2 代存三份回执及 inspection-38695199325-2.json，首次失败文件保留。runner 后续按 run+attempt 写入，artifact glob 同步覆盖该格式，避免再次相撞。
