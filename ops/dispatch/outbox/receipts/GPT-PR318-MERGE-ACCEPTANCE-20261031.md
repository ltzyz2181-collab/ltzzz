# PR #318 / #319 接续审核

原 Task ID：PLAN-PATCHGATE-ESCROW-20261023。实际审核：OpenAI Codex；本次执行日期 2026-11-01 UTC，沿用原任务指定回执路径，不回填成 10-31 执行。

审核来源：#318 head `36c58e9ea8b8d256a797dde42e428dbb19f4547d`；#319 head `7febfd405973d45c5a888d4682b4a53784de8738`。当前主线基线 `18d2dfecb16469324f3b8e05eee47d34b59ddd2c`。

## 决定与实测

- 采用 #318 的只读 gate 提前校验，保留下游 collector 对不可变 GitHub 文件的独立比对；原补丁可干净应用到当前主线。注册内容异常或摘要漂移时，测试证明网络读取与合并次数均为零。
- #319 的真实文件一致性测试建议有用，已由 #320 进入主线；本次复跑确认检查器登记值及真实字节均为 `0c54aca262d34c2334c00efb405c5818a64cd2513ac816426aa81c53c8daada4`。不把旧 `dd2a6080…` 漂移状态当作今天尚未解决的问题。
- 已读取可信 BASE 的 bootstrap/assessment 路径：候选只作为 diff 数据，artifact 输出身份、风险及判断结果；未见它执行候选代码或输出凭据。未下载历史 artifact，不声称逐份检查过其历史内容。
- 当前 CLI 从固定 source commit 读取检查器再校验；它经 UTF-8 字符串读取，collector 则校验原始字节。当前仓库文件与登记匹配；非法 UTF-8 的假阻断属于 #319 提到的低优先级边界，本次未另改读入 API。
- 265 项 `patchgate*.test.mjs` + `controller-decision.test.mjs` 全过，0 失败/跳过。包含当前 authenticated_controller 路径；没有恢复原生模型签名门槛。
- 49 文件 runtime bundle 已重新计算：`2af679084487ae49379f38653dab886c6b948fecc207484efed59c2896e7f46e`。只更新精确运行时摘要，controller 身份、权限、scope、开关、预算和信任根保持原配置。当前本地 preflight blockers=[]。

## 真实合并验收与状态边界

历史首次 A2 自动合并已通过：#315 head `6c6e110ee2332c59ab354daaa5c9e56cd48d98b9`，run `41258918486`，合并 commit `b0d846b1b223f1363eabeb39c0674d10327ba7e0`，状态 `merged_readback_verified`。原回执 commit `de89b4179f559dfcadc4b7c554abf14eaea243d5`、路径 `knowledge/results/patchgate/a2/69531db024f53032d55c0ed2cd9d1b183c48f05a50cec141929079093ef2b38a.json`。

本次候选发布状态：本地验证已完成，主线合并与 CI 回读待本次真实工具结果补入。历史首次验收不改写为新 bundle 已做过另一次自动合并；不重放旧命令 `CTRL-A2-PR315-0952783F`，不清租约/止动记录。

## 原单附带核对

- `QIANWEN-RETURN-2026-10-16` 原结构化签发记录仍为 `assigned_waiting_external_return`、`acceptance_receipt:null`、`native_qianwen_dispatch:false`。当前仓库 Pulse 快照未列此 Task ID；缺失不能证明从未执行，维持原项未验收，不补造原生接单。
- `ANS-2026-10-17` 仍保留 `draft_rejected` 与完整审核拒绝理由，run `38932903711`。本次没有重购模型调用或重派；不把拒收改为通过。

本次 API 模型调用 0；未调用钱包，paid=false、tx_hash=null 只表示本次没有资金动作。评审是监督材料；#319 对旧版本的批准范围不构成 owner 或总控的新权限开关。
