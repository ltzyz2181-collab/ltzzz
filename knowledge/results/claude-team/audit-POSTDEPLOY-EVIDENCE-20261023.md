# Claude 独立审计：POSTDEPLOY-EVIDENCE-20261023（PR #218）

- 审计席：Claude（仓库 PR 渠道，无原生 API；本审计无任何付款、签名、部署）。
- 审查对象：PR #218 head（`pr218`），证据分支 `audit/postdeploy-observations` 的 `DEPLOY-39887469785-1.json` 与 `.review.json`。

## 1. 反例裁决：成立（保留千问原拒收，不改写）
我独立下载两份原始字节复算：观测文件 SHA256 = `b6e8179b…beec`，与回执、外置索引、千问 `reviewed_sha256` 三处一致；观测文件字节内不含自身摘要（自指不可能）。千问拒收理由“被审哈希未在任何字段出现”要求文件内含自身整体哈希，不成立。千问原文的另两项判断（响应头、日志、deployment.source_commit 三方一致）与我读到的字段一致。
结论：千问判定 accepted=false 的**理由错误**，反例成立；但这是千问的原始输出，保留为 `deployment_review_rejected`，不得被覆盖为通过。

## 2. 我认为需要修的问题
1. **最终“已复验”被单个模型的判定卡死。** 五项确定性检查全过 + 独立运行已成立，状态却取决于一次 LLM 判定。LLM 误判会造成假阴性，也会（反向）造成假阳性。建议：确定性五项+独立运行 = `deployment_reverified_deterministic`；LLM 复核作为附加意见；反例裁决走“哈希绑定的二次裁决记录”，裁决者须为不同提供商，原拒收保留。
2. **“版本号核对一致”说过头。** 代码只是从部署日志取出 `Current Version ID` 并要求它存在（`Boolean(sourceLine&&urlLine&&versionMatch)`），没有与线上实际版本比对（页面/头里没有该 ID）。证明的是“日志里有版本号”，不是“线上就是该版本”。线上与提交的绑定其实靠页面正文和响应头的 commit，应如实写。
3. **`fresh_http_200` 只检查 status===200。** 请求带了 `Cache-Control: no-cache`，并记录了 Date 头（04:23:06 GMT），但没有校验 Date 头落在观测窗口内。名称里的 fresh 缺少校验。
4. **日志中的 `SOURCE_COMMIT=` 行是部署作业自己打印的**，属自报；真正的外部证据是页面正文和头部的 commit。两者应分开写，不要算成“三重独立”。
5. **回滚**：`no_previous_successful_run_rollback_unverified`——没有上一个成功运行，回滚入口、权限均未核实。GPT 的“失败只告警、不自动回滚”正确；但不能把回滚写成已具备。

## 3. 确认正确的部分
- 重复触发不重复调用千问：先提交预留再调用（`reservationForReview`），已存在则不执行。
- 目标限定 https、`.workers.dev`、无端口/凭据；`redirect:'error'`；缓存引用要求路径正则+哈希核对。
- 范围是 `isolated_test`，不是生产；main 未改；`paid=false`、`tx_hash=null`。

## 4. 状态建议
- 本次演示：确定性五项通过，独立运行成立，千问拒收理由已被反例驳倒但未被第二提供商确认 → 保持 `deployment_review_rejected`，附“反例成立（Claude，原字节复算）”，待第二提供商（豆包，按规章）复算同一哈希后再升为已复验。
- 不建议在修复第 1、2 点前把常态自动复验接入每次部署。
