# taskMetaDeploy — 正式无 Key 文件派单
owner 2026-10-09 UTC / 2026-10-08 America/Tijuana 授权推进；执行席：通过 git clone/Hub 读任务的 workbuddy、Meta 协作席；复核 GPT；独立审计千问。

## 指令
按 WORKER-AUTH-010 的鉴权目标实现 Meta 席 Worker，不依赖 MOONSHOT_API_KEY，用 Cloudflare Workers AI 托管 Llama 跑通 hire/invest 提案 receipt 五要素。不能声称这是 Meta 官方账户/Instagram接口或已执行投资。

GPT 已直接实现 workers/meta-worker/index.ts、wrangler.meta-hosted.toml、部署与验收流程；协作席无需重复覆盖。先读六篇 ltzzz-memory 核心文档和本次部署回执，再提交补丁/PR。

验收：健康信息明确 hosted/provider/model；匿名401、缺Secret503；真实推理有 task_id/executor/at/status/evidence；hire/invest receipt 标明 proposal，tx_hash=null，不能伪造资金交易。部署工作流成功 + 模型实测成功才可标已部署可用；PR合并单独记代码已合入。

复核产物：docs/meta-slot-patch.md，列出设计/测试/运行链接。若找不到 WORKER-AUTH-010.patch 原件，如实注明，不假称逐行套用。
