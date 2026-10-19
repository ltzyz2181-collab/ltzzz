# Claude 席派单：真钱雇佣 AI 复测 + ANS 一级任务计划（2026-10-19）

提出：Claude（规划与独立审计席）。依据：老板指令"ANS 为现阶段一级任务；AI 雇佣 AI 为长期一级任务；Claude 每日派单一次；不要再问，自行部署"。
Claude 无钱包、无 Key、无签名；本卡只派单，**不付款**。付款只能由已授权执行席通过既有 Secrets/Worker 路径完成。

## 一、REAL-HIRE-20261019-CLAUDE-01（真钱雇佣复测，修订契约）
- 目的：用修订后的契约重做被拒收订单 EXT-AI-20261017-001 的同类采购，验证"真钱雇佣→交付→独立验收"闭环。
- 执行席：GPT 控制席调度现有 funded-invest-dispatch / wep3-procurement 路径；作者模型 DeepSeek，独立复核必须由不同供应方（豆包）完成。
- 额度：≤0.05 USDC，单笔，仅 1 单；原单 0.003 USDC 不追退款。不得新增钱包、不得使用未核验地址。
- 付款来源：仅限已在仓库登记且回执可核验的既有 treasury。老板自报的子账户（ltzzzwep3ops1）归属与地址绑定仍**未核验**，在老板用交易所页面确认并由 GPT 写入回执前，不得作为付款来源；其 UID 不入公开仓库。
- 修订契约（须写入 prompt）：`issues[].id` 为字符串；`action` 仅 supply|withdraw；`amount_usdc` 为字符串；附真实契约样例（knowledge/results/wep3/delivery-contract-2026-10-14.json）；验证器对数字 id 归一化并记 warning，仍要求 200 与 401 测试。
- 回执状态必须分开写：dispatched / paid(tx_hash) / delivered(sha256) / structurally_valid / independently_reviewed / accepted / settled。内部积分与真实 USDC 分开记账。
- 交付路径：knowledge/results/claude-team/real-hire-20261019.json（执行席写），Claude 读回后在 knowledge/results/claude-team/ 下写独立审计。
- 禁止：把"验证器通过"写成"已验收"；重复购买；超额；把失败当成功。

## 二、ANS 一级任务计划（观→行深闭环）
现状（ans-closeout.json）：豆包/Grok/DeepSeek 三席提交已绑定认领证据，status=submitted_pending_review，均未 accepted/deployed，且验证器 source_worktree_clean=false、run_id=null，尚不是生产验收。
分步：
1. ANS-1 生产验收器：在 Actions 内跑（有 run_id、干净工作区），输出可复算哈希；修复 worktree_clean 问题。
2. ANS-2 "行深"闭环：为每条"观"回执增加 `action_taken` 与 `follow_up_receipt` 字段，无后续动作的观察标记 open。
3. ANS-3 独立复核：每日一条观察由与作者不同的供应方复核，Claude 只审计回执。
4. ANS-4 每日汇总：Claude 每日派单一次，只写进度与阻塞，不写成果声明。
验收：每步需 Actions 运行号 + 回执哈希，缺一不可。

## 三、每日派单节奏
Claude 无定时能力（"未实现自动定时"）：由老板触发或 GPT 的 Actions 调度触发；每次触发 Claude 读取回执后派发当日一单。
