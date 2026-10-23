# 部署后的证据复验

类型：工程规则；原任务 POSTDEPLOY-EVIDENCE-20261023。当前只在独立开发分支及证据分支部署验证，未改 main。

## 三个原实测链接与真实时间

- 原回执提交：https://github.com/ltzyz2181-collab/ltzzz/commit/e8c20d5800a706d3313cf78f73daa18867370659
- 部署页面：https://ltzzz-edge-test-20261023.ltzyz2181.workers.dev
- 部署日志：https://github.com/ltzyz2181-collab/ltzzz/actions/runs/39887469785/job/120198894739

浏览器组件为 ChatGPT 浏览器扩展，使用 Microsoft Edge；owner 截图显示已安装并启用。本会话没有取得本机扩展 ID/版本，不把收到文字回执当成此会话已接上 Edge。

原延迟任务由 ChatGPT 一次性 Automation 触发，计划 2026-10-22 19:06:37 America/Tijuana（UTC 2026-10-23 02:06:37），调度器实际启动 19:09:47.249、完成 19:10:13.707。自动执行已发生，延迟约 190 秒。它发现并复用了原回执，未重复写入；原回执的 19:05:51–19:06:22 早于该自动运行，不能作为“本轮重新读页面”的时间。原任务文字把旧时间当本轮时间，已在补充记录说明，不改原文件。

## 本次接入

`postdeploy-verification.yml` 独立于部署工作流。合并启用后，监听配置中的 28 个部署 workflow 完成事件；每次 merge 引起的部署完成后再验，未部署的普通 merge 不冒充已有部署。只读 GitHub API 元数据、日志及公开页面；不拿 Cloudflare 写凭证，不执行部署、回滚、资金、发布或签名命令。

当前只有 isolated Edge test 配有页面契约；其他部署触发时会明确报 `target_contract_not_configured`，由监督提醒补齐各自页面/health 的 marker、source commit、日志契约。没有给 28 个服务全部验收通过。测试页通过只记 isolated_test，不增加生产部署验收数。

1. **新证据**：独立 runner 重新 GET 页面，记录实际 UTC、正文 SHA256、完整源码提交响应头；正文 marker 与 full SHA 必须匹配。
2. **部署证据**：GitHub API 确认成功的目标 job；源码 SHA、URL、版本号必须同时在真实部署日志里。保存日志哈希和必要公开证据行，不存整份环境日志。
3. **独立执行**：验证 run 与部署 run 必须不同。代码注入身份、时间、任务 ID；不采信模型自报。无法从 GitHub 账号推断原 Edge 会话使用哪个模型，保持未知。
4. **第二席复核**：本次 owner 请求的分支演示最多调用一次原生千问，审精确 observation SHA256；先提交预留，再提交 started 标记。超时/中断不自动重试、不换模型；HTTP200 空正文、截断、hash 不符、requested_model 都不算通过。以后自动事件默认不增加付费调用，未有第二席证据就记“已部署未复验”，接入千问原有日课监督及 Claude 的免费 PR 审计。后台自动巡检与原 Edge 扩展使用分开记，不能声称 Edge 关机后常驻。
5. **回滚检查**：记录人工 Cloudflare 入口和同工作流/分支先前成功 run 是否存在。只有候选历史不证明回滚权限或回滚成功；无历史或权限未知就提醒。永不自动回滚。

## 状态及唯一来源

唯一部署观测在 `audit/postdeploy-observations` 分支：

- `knowledge/results/deployment-verification/index.json`：任务索引，状态从哈希绑定原文件重新计算，不能只信 index 的绿色标签。
- `DEPLOY-<run_id>-<run_attempt>.json`：不可覆盖的原始新观测。
- 同 ID 的 `.review-reservation.json`、`.review-started.json`、`.review.json`：最多一次原生复核。API 费用与 USDC 结算分开，`paid=false` 不代表模型推理零成本。

三重证据和第二席完整复核都过才是 `deployment_reverified / 已复验`；有部署但证据或复核不全为 `deployed_unverified / 已部署未复验`；错版本或日志缺项为 `deployment_reverification_failed`，原部署失败为 `deployment_failed`。失败只在 Actions Summary/annotation 与监督器告警，没有额外通知渠道就不承诺已向 owner 推送。

`dispatch-sentinel.yml` 只读导入证据分支到临时 cache；不运行其中代码，不在 main 复制另一份部署状态。既有 `inspectDispatches` 与千问日课按原 ID 识别漏验，重复扫描不生成第二个订单或第二份提醒。导入失败也留下可见警告，继续扫描其他任务。

## 主分支边界及触发

- 当前用户要求“不改主分支”：本 PR 不合并，不把 PR 或独立分支 CI 成功写成 main 已启用。
- 分支演示由 `codex/postdeploy-evidence-20261023` 的代码 push 自动触发，仅复验既有 run 39887469785，不重新部署。
- 若未来批准合并：GitHub 的 `workflow_run: completed` 激活常态证据巡检。配置表未覆盖的实际部署工作流仍需单独登记，不能声称仓库所有 workflow 都已覆盖。
- 所有机器回执只 push 到证据分支，源码只 push 本 PR 分支；无强推，回执已存在就复用。独立 CI 运行不依赖 owner 电脑保持开启，但原 Edge 客户端离线控制能力不在本验收范围内。

## 分支实测回执

独立 Actions run `39899988884` 无需 owner 继续点击完成，真实页面读取时间为 UTC 2026-10-23T04:23:06.928Z（America/Tijuana 10月22日 21:23:06）。五项页面/源码/日志检查全部通过。证据分支提交 `4d02c6b8456c5eb7b35876bb2cbbaf83064c6778` 保存完整观测及原生千问回包。

千问 `qwen-plus` 真调用一次，stop、1802 total tokens，审的 observation SHA256 为 `b6e8179be196277f4eebacdf93ba1ab2c21ebde328532cf807daa2bcd10ebeec`。它确认页面/提交/日志匹配，却因为整份文件的外置哈希没有出现在文件内部而拒收；这不是实际 schema 要求。独立重算文件原字节，结果与 index、预留和模型回传审查对象完全一致。详情见 `knowledge/results/deployment-verification/edge-independent-review-counterexample-20261023.json`。

原始拒收不改、不补造通过、不再调用一次付费模型。监督状态修正为 `deployment_review_rejected`（已部署未复验、已复核但拒收，待 Claude 外部审计裁决），区别于漏审。100 项本地回归通过。当前 PR 仍不合并，常态自动触发尚未在 main 启用。回滚实际权限仍未证明，只留下人工入口及无前序成功版本的警告。
