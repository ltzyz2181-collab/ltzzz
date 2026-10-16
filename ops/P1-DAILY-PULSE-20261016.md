# P1-01 / P1-02：每日执行与 Pulse 证据链修复

## 版本事实与历史隔离

10 月 16 日正式日课 [38827688430](https://github.com/ltzyz2181-collab/ltzzz/actions/runs/38827688430) 使用 `b234d069`，结果生成于 00:10 UTC，早于 [PR #93](https://github.com/ltzyz2181-collab/ltzzz/pull/93)（`71f404a`，07:18 UTC）合并。正式结果中的 `ANS-2026-10-15-*`、`claim_verified:false` 与缺失的当日 daily-board 账本是历史事实，不得用独立 ANS [38772844137](https://github.com/ltzyz2181-collab/ltzzz/actions/runs/38772844137) 的 16 日认领来替代。

PR #93 已引入预留、认领和不可变工件提交，但其 push 验证没有调用模型，不能作为真实日课闭环验收。本次不改写 16 日正式结果、不补造旧认领、不重放付费生成。

## 本次实现

1. **两条链隔离**：正式日课使用 `DAILY-YYYY-MM-DD-<agent>`；独立工程 ANS 保持 `ANS-YYYY-MM-DD-<agent>`。隔日派单只携带指令和 `source_task_id/source_date`，不会借用另一条链的认领或工件。两个目录的出现不会额外启动模型调用，已有日课、ANS 执行频率和预算不变。
2. **在线目录一致性**：任务目录 schema 升为 2；同日部署新增 DAILY 目录后，`GET /tasks` 会持久化目录版本，使 `/tasks` 与 `/status` 一致，并保留既有 ANS 认领。
3. **认领证明**：先保存唯一 claim intent，再关联服务端 `command_ids` 与认证控制事件、任务所有者、认领时间和日期。响应丢失时只读回原 intent；不把同逻辑 Agent 的他次认领当作本执行权限，不转移模型调用预留。
4. **工件绑定和恢复**：工件校验包含 date、run_key、task_id、logical_seat、source_commit、路径及 SHA-256。只读恢复唯一、完整、属于原预留的孤儿工件；无法确认的生成转为 `generation_unknown_no_repurchase` 并上报失败，不重买。
5. **提交和审核回读**：已在 main 持久化的实际工件才可提交。幂等比较同时约束路径和哈希。审核须回读审核工件真实字节、哈希、明确的 task_id/date/run_key/source_commit/actual_provider 与 verdict；字段缺失、同供应商或错对象不能完成审核。新的回读失败清除当前验证标记，保留历史回执供追踪。
6. **正式结果投影**：仅当日期、执行 ID 与任务 ID 全部匹配时，向 `data/results` 写入 `board_lifecycle`。模型执行 `status` 和原输出不被覆盖；`lifecycle_complete`、草稿接受与 `production_deployment_accepted` 分开记录。

## P1-02 的四项错误

- 未复制会重赋值 `const taskState` 的草稿代码。
- 哈希与 Pulse 提交统一使用 `knowledge/results/daily-board/artifacts/...` 的同一不可变文件。
- Pulse 网络提交不使用 `data/` 目录。`data/results` 只是 Git 中的观察视图，保存该视图不是向 Pulse 提交交付证据。
- 适配器不直接改写 `knowledge/results/pulse/latest.json` 作为在线状态；在线 Worker 是任务状态权威来源。

## 当前验证与尚未完成项

本地联合回归 **100/100 通过**，覆盖日课、任务板、正式结果投影、独立 ANS、Pulse、核心记忆与相邻交付分类；语法、YAML 与 `git diff --check` 通过。测试使用本地夹具，没有生产模型调用或链上交易。

这份记录描述代码和本地测试，不把尚未发生的 PR/部署写成成功。发布结果以对应 GitHub Actions 回执为准。

**正式 DAILY 仍没有新增自动 `review_task` 调用。** 此次提供的是提交与已存在独立审核的严格回读接口；没有满足字段、来源与哈希绑定的独立审核时，任务应保持 `submitted_pending_review`。不能用另一条 ANS 的审核替代，也不能把 `engineering_draft_only` 写成生产部署验收。真实日课从认领到独立审核的全链验收仍待后续执行证据，P1 不因本地测试通过自动关闭。

审核 JSON 的 date、run_key、source_commit 均绑定被审核的正式日课执行；实际审核方填在 actual_provider。它与 worker 的不可变哈希一起确定审核对象，不接受仅凭 `accepted:true` 的裸声明。

## P1-03：旧 Vault 风险保留

本次不改 Vault、guardian、密钥、钱包或资金权限，不进行链上交易。用户提供的 2026-10-15 双 RPC 快照中零余额不证明旧权限撤销；旧 guardian 地址也不单独证明私钥泄露。没有新增权限解除或源码/字节码等价性证据，维持不向旧 Vault 新增资金的既有边界；不宣称盗币或已证实密钥泄露。
