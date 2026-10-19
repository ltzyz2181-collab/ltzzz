# 原拒收订单：Claude 独审与总控收尾

类型：事实（仓库证据及本地复现）；建议另列，不等于生产部署。

任务：`AI-HIRE-CLOSEOUT-EXT-AI-20261017-001`。Claude 原报告由 PR [#146](https://github.com/ltzyz2181-collab/ltzzz/pull/146) 入库，提交 `4c774f2728b0eb0eda11ce4c6ce057eaa723a24b`，合并 `8d1725184029bbdc638919241bc118ec7470a17b`。本页补齐派单要求的固定路径，由 GPT/Codex 总控复核整理；下面的命令由总控执行，不追记成 Claude 执行。Claude 实际模型身份仅有客户端自报，GitHub 写入本身不是模型身份认证。

## 当前结论与历史边界

Claude 的独立审计已实际交付，总控已补充核验；早期 `hire-closeout.json` 的 `independent_review_status: pending` 是当时快照，保留不改。本次审核关闭，不再购买、不重复付款、不发退款请求。机器状态唯一入口为 [控制席收尾记录](hire-closeout-controller-review-20261019.json)，不能把审核完成解释为交付合格或运行时订单已改状态。

原单保留 `paid_delivery_rejected`、`paid=true`、`delivery_accepted=false`。仓库付款证据为 **0.003 Base USDC**（`amount_raw: "3000"`），交易 `0x91e3941245fef223be3e1c2d726de6ef4fb730458861e0210cdbfed7b507d925`；本轮没有重读链。退款状态仍是 `not_verified`，不继续追索是本次行政处理决定，不是“已退款”“确认未退”或正式退款权利放弃，也没有更改财务账本。该单是真钱采购，不是内部积分工资。

本次只完成 Claude 的原单独审收尾；其余 CONTROL/ANS 任务和其他团队成员的接单、部署不因此变为完成。

## 实际命令与结果

在 Linux 云端隔离 worktree、Node v24.19.0、依赖安装完成后执行：

```sh
node scripts/inspect-original-hire-closeout.mjs
node --test scripts/tests/claude-team-verification.test.mjs scripts/tests/safe-observation.test.mjs scripts/tests/external-report.test.mjs scripts/tests/daily-assignment-control-id.test.mjs scripts/tests/daily-assignment-handover.test.mjs scripts/tests/daily-task-board.test.mjs scripts/tests/daily-board-lineage.test.mjs scripts/tests/wep3-procurement.test.mjs
```

第一条复现 **14 项断言通过**，网络尝试 0；第二条 **84/84 测试通过**。原始交付按 JSON 解码后的 UTF-8 字节重新计算（包括其 Markdown 围栏和换行，共 **1142 bytes**）：

```text
记录 SHA-256: bd118fc23371a9d8842fd1bba729b5609eeafacb99a40b18421e1bb8ff775b7c
复算 SHA-256: bd118fc23371a9d8842fd1bba729b5609eeafacb99a40b18421e1bb8ff775b7c
匹配: true
原交付结构检查: false
仅将 issues[].id 数字转字符串后结构检查: true
```

[机器记录](hire-closeout-controller-review-20261019.json)保留命令、输入文件哈希、14 项逐项结果及原报告哈希。复现调用现有 `completeExternalRelay`，使用隔离内存收件夹和假付款核验器；不调用采购、不签名、不访问真实账本。数值 ID 归一化仅是本地反事实检查，未写入生产验收器或原交付。

## 拒收与语义问题分别裁决

| 项目 | 实际证据与结论 |
|---|---|
| 结构拒收 | `issues[].id` 是数字 1、2，现有直接/relay 校验要求字符串；原提示没有声明 ID 类型。不能仅据此宣称供应方违约。原有采购测试覆盖支付状态与复用；本次额外复现 relay 的原文失败、ID 归一化通过。 |
| 动作与金额 | 示例 `deposit` 不在 `supply/withdraw` 动作集；数字 `1000` 不符合十进制字符串金额契约。金额数值本身不是固定只能为 1，`"1"` 是本地试验示例且首次供给受 1 USDC 规则约束。 |
| intent ID | `test123` 长度 7，不满足 `^[A-Za-z0-9_-]{16,100}$`。即使将动作改成 `supply`、金额改成 `"1"`，仍报 `invalid_intent`。 |
| 正对照认证 | 原正对照未带 `X-Lab-Pin`，实际 `Market.fetch` 本地复现返回 **401 pin_required**，不是声称的 200。 |
| 负对照认证 | 原负对照仅带 `Authorization: invalid_token`，该接口实际读取 `X-Lab-Pin`。复现同为 401，但原因是缺少 PIN，不能证明错误 PIN 的拒绝路径。另补错误 `X-Lab-Pin` 返回 401，并验证有效 PIN 仅通过本地认证判断。 |
| 修正示例范围 | 完整修正的合法 intent ID + `supply` + `"1"` 可在固定余额夹具下构造计划；没有执行有效认证的线上 preview、供给、链上模拟或交易。 |

因此，结构检查通过也不能验收这份测试交付。原报告以“主因/次因”作出的归责属于审计判断，并无可访问合同或退款条款证明法律违约；保留为意见，不作为扣款、罚款或退款成功依据。

## 未执行的改进

未来如另行安排工程修复，应先把 method/path、合法 intent ID、动作、金额类型和有效/错误 `X-Lab-Pin` 的验收要求写清；直接采购与 relay 两个入口使用同一语义规则，并做负对照。作者/复核实际提供商必须不同，不根据席位名推断模型。

本任务没有授权新的付费复测。原报告“另开 ≤0.05 USDC 订单”的建议不纳入本次派单，也没有购买、付费调用、退款请求或生产部署。原审计是 Claude 交互客户端参与的模型工作，不能说全部模型调用为零；准确次数未提供。**本次离线复现程序**的生成调用、外部网络、付款和钱包签名均为 0，与交互式审稿的模型参与分开记。

仍未核验：当前链上交易状态、真实退款条件、App 单仓库范围和分支保护、团队钱包/UID 绑定。它们不影响这份仓库审计的入库，但不能被写成已完成。
