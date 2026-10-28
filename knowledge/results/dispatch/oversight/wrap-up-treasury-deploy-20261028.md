# 豆包回执：TREASURY-DEPLOY-20261028（XAI 转来三项部署，owner 指令"帮他部署完成"）

- 派单来源：XAI 转达 Claude 交付异常与 Treasury 待办 → owner 在对话中指令"XAI发来的你帮他部署完成"
- 实际执行身份：**豆包（Doubao，本云 VM 执行席，did:ltzzz:doubao）**
- 回执时间：2026-10-28T20:30+08:00（UTC 12:30）
- 模型调用：0（纯 git/gh/脚本/只读核验，无原生模型调用）
- paid=false / tx_hash=null / financial_execution=false
- 红线：未注册任何账号、未动主钱包资金、未编造任何链接或回执；失败与限制如实标注。

## ① Treasury PR #269（Node 测试 → 浏览器回归 → 人工审核 → 合并 → 生产核验）—— 完成

- **Node 测试（红/绿闭环）**：main 上跑 PR 版测试=10/12（缺 missing/partial 两例，证明新用例有牙齿）；PR 分支=12/12；A2 官方套件基线 94/94。合并后 CI 门禁在 Pages 部署 run 40678455394 的 "Verify Treasury display escaping and progress boundaries" 步骤 **success**。
- **浏览器回归（headless chromium + 本地 https mock）**：`treasury-dashboard.html` 以 API 指向本地 mock（127.0.0.1:8443，全端返 `{}`）真实渲染 → **6×`<div class="big">未知</div>`、0×`0 U`、0 JS 异常**；页面加载与错误兜底路径（fetch 失败 → `#raw` 显示 TypeError 兜底、不渲染伪零）也通过。443 绑定 EACCES、host-resolver 跨端口不可用两条死路不重试（已记录）。
- **人工代码审核**：diff 仅 2 文件（`treasury-dashboard.html` -6/+6：数字指标用 `== null ? '未知'`，计数指标用 `?? '未知'`；测试 +21 行 3 用例：空数据→6 未知无 "0 U"、显式零保留、部分数据混合）。全仓 grep：无其他资金指标 `?? 0` 渲染残留。非阻塞意见：若 API 传 NaN 会显示 "NaN U"（JSON 无法携带 NaN，属数据契约侧约束）。
- **合并**：`gh pr ready 269` + `gh pr merge 269 --merge` → **MERGED**，merge commit **faa3e4ad5bd714b47c161b77b5e4368e04b6a082**（2026-10-28T11:14:51Z）。同账号作者直接合并（owner 已授权，见经验存档）。
- **生产核验**：Pages 部署 run **40678455394**（head=faa3e4ad）**success**；生产页 https://ltzzz.com/treasury-dashboard.html（200）与 merge commit 中 `treasury-dashboard.html` **逐字节一致**，含「未知」逻辑×6、`?? 0` 残留 0。
- **备注（如实）**：`patchgate-a2-base-checks` 对 #269/#282/#280/#278 全仓性报 `trusted_same_repository_base_required` 失败 —— A2 基础设施级问题，非 #269 引入，且未阻塞合并（非 required check）；总控侧需修。worker 端 `ltzzz-treasury-v11.ltzyz2181.workers.dev/*` 从本 VM curl 均 000（出口限制，与既有 egress 经验一致），本批改动产物（静态 HTML）已在生产核验，API 健康需 owner 侧环境复验。

## ② Memory Manifest 生成时间 10-23 —— 已核实：非故障，线上已刷新

- **线上 main（API 权威）`ltzzz-memory/manifest.json`：generated_at = 2026-10-28T09:09:45.300Z，files=240**，由 sync-memory.yml 在我们 08ed536c 记忆补录 push 后运行的 run 40662058901 生成并提交（commit **adaba058**）。
- XAI 读到的 "10月23日" 来自本地陈旧副本（旧 checkout），不是线上状态。
- **缓存/刷新策略（已查明）**：`sync-memory.yml` 触发路径 = push 命中 `ltzzz-memory/**`、`lab/` 关键记忆、`memory/daily/**`、manifest 工具自身；`syncMemoryManifest()`（tools/sync-memory-manifest.mjs）在 origin/main 的 detached worktree 运行 `build-memory-manifest.mjs`（generated_at=`new Date()`），`git diff --staged --quiet` 无差异则返回 changed:false 不提交（幂等），有差异才 commit+push。故「generated_at 旧」只可能出现在「自上次刷新后无记忆变更」或「读的是旧副本」两种情形，不能据此断言系统故障。结论：**本次为后者（陈旧读取），系统无故障**。

## ③ Daily Worker 与豆包代理真实生成状态 —— 以仓内回执为准（不能只看 health 200）

- **Daily Worker 真实回执**：`knowledge/results/dispatch/daily-latest.json` 最新实际条目 = **2026-10-27**，status=`assigned_waiting_external_acceptance`，**model_calls=0**。今日（10-28）仓内尚无新的 daily-latest/daily-board 回执（daily-board 最新=2026-10-27.json；本 VM 观察到的今日 run 中无 daily 任务 workflow 新 run）→ **今日 Daily Worker 无新回执，如实报，不推断生成成功**。
- **豆包代理**：`https://ltzzz-doubao-proxy.ltzyz2181.workers.dev/health` 与 `https://api-doubao.ltzzz.com/health` 从本 VM 均 **000**（出口限制）；card 内最后一次健康观测=2026-10-23T00:07:52Z（http 200，**generation_verified=false**）→ health 200 不等于交付回执。**真实生成状态以仓内回执为准**：豆包席今日实际交付 = A2 对抗探测 49/49（`knowledge/results/patchgate/a2-adversarial-probe-20261028.json`）、#278 沙盒复现（PR #278 分支 e74be4ad）、REMAINING-DEPLOY wrap-up（commit 49008126）、本批 Treasury 部署（本文）；`data/memory/doubao.json` 最新条目 10-27（只读复核，0 模型调用）。

## 结论

三项逐条有据：① 已合并并完成生产核验；② 线上 manifest 已刷新，旧时间戳系陈旧副本，非故障；③ Daily Worker 今日无新回执、豆包代理 health 本 VM 不可达（出口限制），均如实记录，未以 health 200 冒充交付，未编造任何生成链接。
