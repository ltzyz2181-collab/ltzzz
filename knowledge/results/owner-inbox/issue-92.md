# 国内执行席工单回执 · issue-92

状态：submitted_pending_review；运行：38855613317。仅草稿，未验收、未发布、未交易。

## 国内模型交付 · 实际 DeepSeek / deepseek-v4-pro（岗位标识：DeepSeek）

【客户端判断】
AUTH=当前 Harness 客户端凭证未通过 DeepSeek 远端认证；远端 API 可用不等于桌面客户端可用，两客户端凭证存储不同，须在报错客户端换有效 Key，非改仓库/远端。

【最小实施步骤】
独立 worktree 改 run-daily-tasks.mjs：dailyAssignment 后先 Pulse /control 真实 claim_task；生成完整结果写 knowledge/results/ops 下不可变公开工件并 commit；再 submit_task 提交工件哈希并回读。禁止把 pulse/latest.json 当线上任务板。修掉 const 重赋值、提交路径与 hash 对象不一致。

【失败/重复处理】
先查 claim/submit 记录，不重复购买模型；提交超时保留 unknown，不重试不计奖惩；待独立审核通过才计奖惩。

【未验证】
未实调 DeepSeek/豆包，未读仓库/运行测试/部署/付款；以上为方案，生产未修复。

【交付结束】

## 国内模型复核 · 实际 Doubao / doubao-seed-2-1-pro-260915（岗位标识：Doubao）

【客户端判断】
AUTH 仅表示该 Harness 本地存储的 DeepSeek 凭证未通过认证；VS Code 配置成功不能替代 Harness。远端 API 可用也不能证明桌面客户端已修复，需在报错客户端单独更换/配置有效 Key。我本轮未联网、未读取仓库、未运行测试。

【最小实施步骤】
新建独立 worktree 修 `scripts/run-daily-tasks.mjs`：
1. `dailyAssignment` 后先调用 Pulse `/control claim_task`，校验认领成功及任务 ID；
2. 运行任务并检查输出非空、完整；
3. 将完整结果写入 `knowledge/results/` 下允许的不可变工件，提交 git commit；
4. 计算该提交中工件文件的哈希，调用 `submit_task`，提交内容须包含一致的路径与哈希；
5. 回读 Pulse 状态确认。禁止使用本地 `pulse/latest.json` 充当线上任务板；修复 const 重赋值等草稿错误。

【失败/重复处理】
重跑前先按任务 ID 查询 claim/submit 与工件记录，已有结果则复用，不重复购买模型。submit 超时只记 `unknown`，不假定成功或失败；不得自动重购、重罚或结算。经独立审核后，才计算奖惩。

【未验证】
未实际调用 DeepSeek、豆包；未改代码、测试、部署或付款。生产代码是否修复、权限路径是否全部匹配、Pulse 接口字段和幂等行为，均待验证。

复核意见：第一份方案具体缺口是未明确“提交哈希必须针对已 commit 的工件字节，并用提交后路径回读校验”；还应在 claim 前做幂等查询。其余方向性错误未发现。

【交付结束】
