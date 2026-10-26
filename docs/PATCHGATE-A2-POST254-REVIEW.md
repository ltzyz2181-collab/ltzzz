# 事实：PR254 之后的 A2 检查登记与闩调和候选

原任务：PLAN-PATCHGATE-ESCROW-20261023。#240 已按 #254 的“仅合并、A2 关闭”范围合并。

本补丁只改新增的两部分，不重新宣称旧阶段已验收：

1. 登记 GitHub 实际 checker workflow_id 396518006（run 40284816827，pull_request_target，原 job skipped，仅证明身份）。checker 仍只运行 BASE 代码，不获取写权限或 Secret；新增 BASE 只读策略 bootstrap，使后续验证不再依赖 owner 到 Settings 操作。readonly_checks_enabled=true 仅允许检查，A2/signing/merge/funds 仍关闭。workflow_sha256 固定本候选实际工作流字节，不能拿旧审计摘要批准新工作流。
2. 新增闩调和：只接受已结束、已登记工作流产生的原任务原 head 回执，核对不可变 blob、签署 subject、PR、原运行、Git parents/tree/blob/mode，先把释放意图写入并读回 main，才可删除唯一 stop ref；保留每 head 的原认领、失败和未知结果，不再次合并。未知结果只能由原 PR 的新鲜完整树证明调和；未证明则保持 stop。

## 当前候选边界

- automatic_release_enabled=false，execution_authority=null。尚无真实 A2 execute 工作流登记；不得填虚构 workflow_id。自动 workflow_run 接线在未来真实 executor 结束后触发，当前只能观察。
- A2、A3、B、自动业务合并/部署/回滚、钱包和资金全部关闭；#246 保持 draft，不能手动合并来冒充自动验收。
- 闩调和五个文件进入固定 bundle（19→24），需要对新 bundle 审核；旧 #254 的 19 文件审计保留，但不是新 bundle 的启用授权。
- 当前线上 stop ref 为 404；本地测试只使用 fixture。尚无真实 stop 释放、真实 checker green 或首次自动合并验收。
- 签名密钥持久化是另一张 #255，未在本补丁里启用信任根或签名角色。

## 独立复核要求

Claude 和另一提供商审本 diff 与实际新 head，逐条引用代码/测试证据。尤其审 DELETE 白名单、原运行/subject/树绑定、未知结果处理、意图落盘、原运行恢复/新闩所有者竞态、BASE-only bootstrap 和实际 workflow ID/hash。未展示的 helper 必须写未覆盖，不推测其实现。

已有本地确定性测试不能代替上述独立审查、真实 runner 或启用审计。新 head 和运行链接由 PR 评论另行固定，避免文件包含自身提交号。
