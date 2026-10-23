# 部署后的证据复验

类型：工程规则；原任务 POSTDEPLOY-EVIDENCE-20261023。PR #218 仍待审、不合并；当前仅在开发分支和证据分支演示，main 未启用常态复验。

## 状态与证据

确定性结果与模型意见分开记录。页面时间窗、标记、完整提交号、部署日志佐证、线上实际版本及独立运行实例全部满足时，状态为 `reverified_deterministic`（确定性复验通过）。模型审核是附加意见：`accepted`、`rejected`、未请求或对象不同，不能由单个模型否决已通过的确定性检查，也不能用模型同意替代失败的检查。

- 页面：HTTPS / workers.dev 固定目标，禁止重定向；正文 marker、正文完整 source commit、`x-source-commit` 必须匹配部署提交。HTTP 200 单独不够。
- 时间窗：执行器在实际请求前、读完响应后记录 UTC；HTTP Date 必须落在这段区间 ±5 秒，读取耗时不超过 30 秒。Date 缺失、非法、过旧或未来时间均不通过；Age 若存在只能为 0。no-cache 不是新鲜性证明。这项只证明响应时间窗，不能证明源站执行了新逻辑或从未经过缓存。
- 线上版本：页面读取前后各 GET 一次 Cloudflare 当前 deployments。官方定义列表首项为当前服务流量的部署。两次 deployment ID 必须相同，且均以 100% 流量运行日志所记录的 version UUID。分流、版本不符或读取期间切换都不通过；缺 Secret、403 或结构不明则明确未验证。不会为了取版本重新部署 Worker。
- 日志中的 `SOURCE_COMMIT` 是部署作业自己打印的，只是部署方自报佐证；页面与响应头也来自同一个响应。不能称为“三重独立证据”。外部证据是实际页面响应和 Cloudflare 当前部署只读 API。
- 独立性：观测工作流 run 与部署 run 不同；未知的部署者 provider 仍为 null，不从 GitHub 用户名推断模型身份。

Cloudflare 官方 API：https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/ 。凭证只在 Actions 观测步骤注入，代码仅发 GET；不保存账号 ID、Token、认证头、作者邮箱或原始错误正文。

## 版本、幂等与监督

原 Task ID 沿用 `DEPLOY-<部署 run>-<attempt>`。不可变原观测及原模型拒收不覆盖。补齐新检查时追加 `<Task ID>.v2.json`，内含旧观测路径与 SHA256；外置 index 指向当前修订，并保留旧观测和旧意见的关联。旧意见只审过 v1 的哈希，不得当作审过 v2。回执写入后不再重新读页、不重复写入；证据 writer 拒绝修改已提交的回执，仅 index 可以更新。

证据只写 `audit/postdeploy-observations`，代码只写 PR 分支；不写 main、不强推。Sentinel 将严格白名单内的 JSON 和哈希导入本地缓存，重新计算状态，不执行证据分支上的代码。缺失/损坏证据可见告警；确定性通过后沿原任务收口，历史模型拒收仍作为附加意见可见，不能继续误报“漏审”。`isolated_test` 永不计入生产部署数量。

映射目前只有 `edge-isolated-20261023`。登记 28 个工作流名称不代表 28 项服务都已验收；未配置目标的部署只报 `target_contract_not_configured`。当前 PR 未合并，`workflow_run` 常态触发尚未在 main 启用。分支 push 演示只读取既有部署，不重新部署、不调用付费模型。

回滚始终只告警：人工入口存在不代表权限可用，前序成功 run 元数据也不代表能回滚；没有执行过回滚，当前可用性与权限仍未验证。无自动回滚、资金或新采购动作。

## 原实测与保留的反例

- 原回执提交：https://github.com/ltzyz2181-collab/ltzzz/commit/e8c20d5800a706d3313cf78f73daa18867370659
- 页面：https://ltzzz-edge-test-20261023.ltzyz2181.workers.dev
- 原部署日志：https://github.com/ltzyz2181-collab/ltzzz/actions/runs/39887469785/job/120198894739

组件为 ChatGPT 浏览器扩展，owner 的 Edge 截图显示已安装。本会话没有取得本机扩展 ID/版本或本机连接，不把云端 Actions 验证说成当前会话操作过本机 Edge。

原一次性 Automation 计划 UTC 02:06:37、实际 02:09:47.249 启动、02:10:13.707 完成（2026-10-23；America/Tijuana 为前一日）。它复用了原回执，原回执里的 02:05:51–02:06:22 早于自动运行，不能证明自动运行当时重新读过页面。补充纠正已入本 PR，原件不改。

第一次独立 Actions `39899988884` 在 UTC 2026-10-23T04:23:06.928Z 读页。旧版五项布尔检查全过，但没有实现 Date 时间窗和线上版本对比，不能追认成 v2 确定性通过。

千问 qwen-plus 原生调用一次，stop、1802 total tokens，审查原文件 SHA256 为 `b6e8179be196277f4eebacdf93ba1ab2c21ebde328532cf807daa2bcd10ebeec`。它确认页面/提交/日志匹配，但误以为整份文件的外置摘要必须出现在文件内部，故拒收。原审意见和当时 `deployment_review_rejected` 索引仍可由证据分支历史回读，不覆盖、不再次付费调用。v2 将确定性结果与这条历史模型意见分开，不能把历史拒收悄悄改成模型同意。

本轮本地 106 项回归通过。v2 真实线上观测及当前版本是否匹配，必须以随后 Actions 回执为准，不能用本地 mock 推断成功。

## v2 实际线上验收（2026-10-23 UTC）

- 代码：`e217fac1fb6e9a251291f3549ca219d025bb6f4b`；独立运行 `39906731890`，verify / observe 均 success；PR 只读检查与 Sentinel PR 检查也均 success。
- 回执：https://github.com/ltzyz2181-collab/ltzzz/blob/99397fe820b9193a7fc3db90567fc37b1eba55f9/knowledge/results/deployment-verification/DEPLOY-39887469785-1.v2.json
- 页面：https://ltzzz-edge-test-20261023.ltzyz2181.workers.dev
- 本次运行日志：https://github.com/ltzyz2181-collab/ltzzz/actions/runs/39906731890/job/120260348486
- 实际页面请求 UTC `05:37:12.541–05:37:12.647`，Date 为 `05:37:12 GMT`；时间窗检查通过。
- Cloudflare 页面前后均返回 deployment `9e74d5c1-6a1c-46a9-a5e0-4bf6be2ff2fc`、version `3298029a-0640-4b21-a475-e25b7583acce`、100% 流量；版本与原部署日志一致。
- v2 SHA256：`52d0dacfe975bc76f3832520fc3580e47a58b42c55eb9520b0297d07588ea2ab`。外置 index 的状态是 `reverified_deterministic`。原观测仍为 `b6e8179b…beec`，原模型回包仍为 `e37c63a5…216bb`，原拒收状态另列 `original_index_status: deployment_review_rejected`。
- 由 git 原字节再次复算三份文件哈希，与 index 全部一致；证据分支本轮仅新增 v2 和更新 index。只读导入后监督器重算同一 Task ID 为确定性通过，历史意见仍 rejected，`production_deployed=false`。
- 本轮新增模型调用 0、资金动作 0、Worker 部署 0；没有把 Actions 云端复验写成当前会话操作过本机 Edge。回滚仍未验证，main 仍未合并/启用。
