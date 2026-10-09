# Meta 正式任务单

任务给：did:ltzzz:meta（通过Hub/git读取任务的外部协作席；与Cloudflare托管Llama运行服务分别记回执）
内容：审核kimi-global的abcd提案 + 补Meta Worker部署（Llama托管版）+ 提案补Claude退出后的5签空位。
是否需key：否（读取仓库、审查、写提案、提交PR无需Moonshot Key；实际Cloudflare部署由已配置权限的GitHub Actions执行）。
原截止：2026-10-02 17:00 Asia/Shanghai，已过期。本任务实际派出时间2026-10-09 UTC/2026-10-08 America/Tijuana，文件名按owner指定保留，不倒填已派发。新交付目标：接单后24小时；如受阻写原因与预计完成时间。
当前状态：assigned_awaiting_acceptance。owner同意参与；GPT同意执行本审查方案，未授予第五签。

## 当前事实，先读再做
Meta托管Llama已由GPT部署：workers/meta-worker/index.ts、wrangler.meta-hosted.toml。knowledge/results/meta/37877508573.json证实匿名401、两项真实推理200及正确提案。不要重复写成“未部署”，也不要把Llama服务当Meta官方账号/Instagram发布接口。
kimi-global零Key任务包：ltzzz-memory/kimi-weekly/2026-10-09-task.md；历史模型提案可读2026-10-07.md。先定位真实ABCD原提案文件和commit；未找到就标缺源，不能自己编造四项。
核心输入：ltzzz-memory/魄.md、识神.md、梦境数据库.md、文明研究.md、项目历史.md、重要事件.md。

## 交付
1. 写接单回执 knowledge/results/meta-external/accepted-20261009.md，含executor/source_commit/accepted_at。
2. 写 docs/meta-review-kimi-global-20261009.md，逐项列ABCD证据、可执行动作、预算、失败判据和不能验证之处；缺原稿则如实说明。
3. 复核docs/meta-slot-patch.md与已部署Worker；存在漏洞则提交最小PR与测试。合并、部署成功、真实调用通过分别记录。
4. 第五签仅提案：列kimi-global候选理由、钱包地址控制证明、DID链上注册、治理裁定、Safe成员及threshold实际读取/变更步骤。未完成前不得声称正式签名席。不得收集或公开五个私钥。
5. 写交付receipt：task_id/executor/time/status/evidence；没有交易tx_hash=null。GPT验收，千问独立审计。

Instagram发布另交Manus，不占本任务。每小时扫Hub是外部席自行承诺，本文件不能证明其扫描器或接单已经运行。
