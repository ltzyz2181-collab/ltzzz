# 事实：A2 主线执行工作流候选，尚未启用

原任务：PLAN-PATCHGATE-ESCROW-20261023。Claude #257 要求单独审查真正执行工作流；本 PR 不能借 #254/#257 的旧批准自行上线。

## 来源与权限

- 只接受同仓 main 的 workflow_dispatch，固定完整 GITHUB_SHA、workflow_ref、run ID 与 attempt。PR 事件只运行无 Secret、只读的候选测试。
- 独立 gate job 只读该 main 提交的配置、固定 bundle 和现有阶段签名。A2 默认 false、签名未配或执行 workflow_id 未登记时，写权限 job 不启动。
- 写权限 job 也只 checkout 触发时的 main；候选只被 git fetch 并作为 diff/blob 数据读取，从不 checkout/import/执行候选代码。所有策略、信任根、验证器来自固定 main 提交。
- 只有 job GITHUB_TOKEN 用于 GitHub；不读取模型 Key、CF Token、私钥或钱包。收集器只 GET；准入证据读取器有固定 repo/ref/path 白名单；唯一写入路径仍是已有 mergeDocsOnce 的白名单、每 head 认领、全局 stop、预期 HEAD 合并和整树复验。

## 输入和证据

workflow request 沿用严格的 collection-request 六字段：schema、task_id、candidate_pr、candidate_head、audit_pr、audit_path。没有开启、支付、密钥、签名或策略覆盖字段。audit_pr/path 仅为沿用的咨询身份数据，本执行器不把它当 Claude/owner 签名，也不拿它增加模型票。

请求示例中的 HEAD 必须换成实际已审核同步过的完整 40 位提交，不能使用旧缓存：

```json
{"schema":"ltzzz.patchgate.a2-collection-request.v1","task_id":"PLAN-PATCHGATE-ESCROW-20261023","candidate_pr":246,"candidate_head":"<actual-40-hex-head>","audit_pr":257,"audit_path":"knowledge/results/patchgate/claude-post254-review-20261026.md"}
```

模型/检查执行器尚未实现的原生 attestation adapter 需另行审查。当前工作流不生成或补造签名。未来真正签名器把公开证明提交到隔离不可变证据：

- K = SHA256(task_id + ':' + source_main_sha + ':' + candidate_head + ':admission')
- ref：`patchgate-a2-attestations/<K>`
- 文件：`knowledge/results/patchgate/admission/<K>.json`，在读取到的 ref commit 上按 git blob SHA/字节长度核对。
- 严格字段：schema=`ltzzz.patchgate.a2-admission.v1`、task_id、source_main_sha、candidate_pr、candidate_head、subject_sha256、checks_sha256、attestations。
- attestations 是公开的 key_id/payload/signature 数组（4–16条），只接受 author/review/checks 角色；密码学验证与两家真实提供商 quorum 仍由已有闸门强制。模型自述、nonce challenge 或 GitHub 共用账号不能填补它。

证据放在被认证的 main 提交以外，避免提交包含自己证明而造成循环依赖。checker 运行、job、app、HEAD、BASE、attempt、工作流原始字节和新鲜度仍由现有收集器实际读取，原签名的 checks_sha256 必须与这次观察一致。

## 不重放与回执

工作流 concurrency 不取消正在执行的旧运行；既有全局 stop 和 per-head claim 仍防并发/重放。未知合并响应、不合格整树、回执写失败保持 stop。执行器不重试合并、不自动回滚或调和。独立调和工作流虽可在执行结束后触发，但 automatic_release_enabled 继续 false。

动作回执由既有受限 API 写到隔离 claim 分支；工作流报告仅 upload artifact，包含 run/attempt。不得在来源绑定合并前向 main 推送统计文件；artifact 留存30天，生产长期归档需另行核验，不能声称永久可取。

## 本次复核范围

新增 CLI、编排库、工作流和17项执行器回归进入固定 bundle（24→28），配置仍关闭，执行 authority 保持 null。既有树读回、密码学验证、鉴权和闩机制不改。

请 Claude 单独审：可信来源、权限 job 的前置条件、实读运行身份、证据与双提供商绑定、checker 路径、仅 L0 正常文档、变更自身检查是否被阻止、未知结果/日志/归档边界。测试中的替代 preflight/merge 仅用于编排 fixture，不是生产准入或真实自动合并；真实密码学与变更拒绝由既有回归独立覆盖。

仍未完成：原生角色签名服务、actual execution workflow_id 审后登记、精确新 bundle 启用审计、#246 首次自动合并。A3、B、资金继续关闭。
