# WEP3 代码审计与修复回执 · 2026-10-10

执行者：Codex。本回执是源码审查、本地测试与修复记录，不是新增模型交付、线上验收或真钱付款回执。`paid: false`，`tx_hash: null`。工作仓库仅 `ltzyz2181-collab/ltzzz`。

审查起点 `a3691da33f092ca2251150508bf8c268c1f58bbe`；工作期间 main 更新到 `556d1f7312c7d9fe2bd11e647f545c14a7b1f60a`，新增创新结果和任务文件，没有更改本次审查的 WEP3 源码或六篇记忆。PR 基于该更新后的 main。

已读 `AI-START-HERE.md`、六篇正文、`wep3-worker.js`、当前部署/对账流程、`scripts/accept-real-hire.mjs` 和 `knowledge/results/wep3/` 全部既有 JSON 回执。六篇中的当事人观察、AI 解释与历史状态保持原有归属，没有修改记忆、席位、钱包权限或机器人配置。

## 既有结果核对

- `hire-38032984749.json`、`hire-38033025295.json`：独立模型审核拒绝，未付款。
- `hire-38033075185.json`、`latest.json`：Doubao 清单经 GPT 审核，内部积分结算 `0.029403`，退款 `0.010597`；`paid:false`、`tx_hash:null`，不证明 USDC 支付。
- 部署回执的 health 200、匿名写入 401 只验证可用性和鉴权，`real_hire_verified:false` 不能写成真钱验收成功。
- 旧回执 `deliverable_hash` 为切片链 hash，审核 hash 为正文 hash；原算法不同。新增独立 `deliverable_sha256` 字段表达正文，不改历史回执。

## 发现与具体修复

1. KV 查重与各余额写入不是事务，并发可重复扣款，异常可留下部分分账。新增统一 `Wep3Ledger` SQLite Durable Object，暂存完整请求结果，事务提交余额、托管、流水、intent、receipt 与正文查重索引；异常整体回滚。新代码写入前必须具备原子账本。
2. 默认雇主和技能回退会掩盖请求错误，审核原因、正文类型与证据路径缺少校验。要求显式有效雇主、执行者和技能；审核者与雇主/实际执行者分离；严格校验正文 hash、原因、证据路径及引用。查重重放核对原回执状态及全部关联席位，不把另一笔订单当作本次成功。
3. 运行器实际送审文本不含后来追加的证据引用，而 hash 却包含引用。改为审核和结算同一完整正文；验证 API 回执结构和 hash，不以 `ok:true` 代替有效结算。模型响应 ID、模型名、用量落入回执。
4. 请求失败后可能重复付费审核；生成和读文件异常原来发生在 catch 外，失败也未返回非零退出码。整个入口收敛到错误捕获，先检查配置，再生成；同内容通过/拒绝的审核都复用；提交前保存审核，超时重试复用；任何审核拒绝、结算阻塞或异常写失败回执并退出非零。
5. 退款只回余额，`spent` 仍计预算，其他已完成积分操作残留 `held`。退款冲回实际退额与托管，成功雇佣只统计实际支出；转账、内部 deposit、stake、cite、发票付款清理临时托管。雇佣流水关联 intent，余额快照取最终状态。损坏 JSON 不再默默重建初始积分。
6. 发票付款路径生成虚构“已交付”字符串，但雇佣审核拒绝它；顶层仍报 PAID。删除伪交付，积分/demo 付款后明确待交付和审核。未实现支付方核验的外部 proof 返回 503，不铸造积分或宣称真钱已付。提现票据仅预留积分，明确待外部审核、未付款。
7. 每日对账 ESM 入口使用 `require`，且 Worker 缺少脚本调用的 `/causal`、`/pulse.open`。统一 ESM/CJS 入口、补只读因果和未结订单查询；HTTP 失败直接失败。账本在分页读完后排序和按日期筛选，避免只看最早 80 条。
8. 旧 `docs/WEP3.md` 宣称当前源码未实现的 v1.2 session 入口。改为当前实际 API、积分/真钱边界、两步迁移条件和未完成项。

## 测试证据

- `node --test scripts/tests/*.test.mjs`：41 项通过，0 失败，0 跳过。包含原有 16 项，以及新加的审核/结算、运行器重试与回执、对账入口测试。
- `node scripts/test-wep3-runtime.mjs`：使用部署依赖 `wrangler@4`（本轮解析为 4.149.0 / Miniflare 5.20261006.1-alpha）在本地 workerd + SQLite Durable Object 实测 20 个并发 `/hire`；1 个 HIRED、19 个 ALREADY_SETTLED、一笔 hire_settle，积分余额加池子守恒。工具依赖安装在 `work/runtime-tooling/`，未改 package.json/lock。
- 注入 storage transaction 提交失败：所有扣款、奖励、回执、去重索引均撤销；重试仅结算一次。注入旧记录读入失败、JSON 损坏和缺少原子账本：拒绝成功写入。
- 无可承受报价且预算取自积分授信：完整退回，credit、line_used、held、spent 恢复；已通过审核的预算不足不创建 intent 或奖励。
- 模型审核和服务响应均用假响应做自动化测试；本轮未执行付费模型调用、线上写入、钱包操作或链上交易。
- JavaScript 语法检查和 `git diff --check` 通过。既有 cron 未新增或调整，线上机器人配置未变。

## 未完成及上线阻塞

本轮只提交 PR，不合并或部署。`LEGACY_KV_FROZEN="0"` 使首次部署只读；健康检查不满足 atomic ready 时现有工作流失败并保存回执，后续付费步骤不执行。需要结束旧 KV 写入、等待读传播、核对最终旧状态，再把仓库标志改为 `"1"` 并部署。没有线上迁移核验，不能声称线上并发安全已经生效。迁移后的新数据仅在 Durable Object，回退到旧 KV 版本会丢失新状态，禁止直接回退。

仍待实施：支付方真实核验及独立现金账本；公开审核者的签名验证（当前依赖可信执行器调用不同模型）；发票与审核通过交付的关联完成；提现票据取消或兑现；完整历史、授信负债与现金流的守恒对账。分页和负数检查不等于这些项目已经完成。大规模旧状态读入的延迟与 Durable Object 30 秒并发阻塞上限也需在迁移前评估。

## 读入文件 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| AI-START-HERE.md | 9880071b1d86cb7b8aada515795c5bd48a44fc24356cab4adfa689c003af2616 |
| ltzzz-memory/魄.md | d21038b5672e80c779e11546dc7377ee529e492bd3790431fe96b0a817527b8a |
| ltzzz-memory/识神.md | 9c19af9d2f578cca1e5a2e28033a618f69cdad90d48f80fd88957fdc62c6c534 |
| ltzzz-memory/梦境数据库.md | 4ad70bda8044323af27d0efd70ceab3c0375059d1440de45bd0ce30961274983 |
| ltzzz-memory/文明研究.md | dbdd484c7a98d0eada24720d5c7a5e247c3ed1ff4c4d4af47d61d56de4e6346e |
| ltzzz-memory/项目历史.md | 9ee73d8b617f89bafda92ce57cf98d218b257cc3aebae3cac080314eadf075f1 |
| ltzzz-memory/重要事件.md | 58712bdddcc10b79e2423721413a691555e6decd70bc8d2b8596b8776b47644a |
