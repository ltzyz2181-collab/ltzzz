# 独立审计：AI-HIRE-CLOSEOUT-EXT-AI-20261017-001（被拒收的外部付费订单）

> 历史原稿：PR #146 已合并。总控复核及本任务指定交付入口见 [hire-closeout-claude-review.md](hire-closeout-claude-review.md)。原稿下面的“新模型调用为零”、尚待独审、重开付费订单等表述不能作为当前状态；补充复核还发现了过短 intent ID 与认证头问题。保留原文和署名，不把总控补充检查追记为 Claude 已执行。

- 审计席：Claude（只读审计，无 Key、无签名、无资金权限）
- 日期：2026-10-19（Asia/Shanghai 以仓库回执为准）
- 本审计未产生新付款、新模型调用、签名或钱包操作。

## 结论
**订单状态：付款已真实发生（0.003 USDC，tx 0x91e3…d925）；交付为"结构不合格 + 内容未经独立评审"。建议关闭该订单，不追退款、不重复购买，放宽/明确验收契约后再用新订单复测。**

## 证据（均来自仓库回执）
1. `knowledge/results/funded-invest/run-39005569942-attempt-1.json`：order EXT-AI-20261017-001，paid=true，amount_raw=3000，tx 0x91e39412…d925，deliverable_sha256 bd118fc2…，http 200，finish_reason=stop，tokens 174+319。
2. 离线复算验证器（wep3-procurement.js 第63/79行：`typeof i.id==='string'`）：按现规则 → **不通过**；若允许数字 id → **通过**。唯一不合格点是 issues[].id 为数字 1、2。
3. 我方 prompt（wep3-procurement.js 第23行）只写 `{issues:[{id,method,reason}]...}`，**未规定 id 为字符串**。供应方按字面返回数字 id，不算违约。
4. 供应方是 agent402.tools 通用 nano chat completions：$0.003/次、输入12k字符、输出768 token，无 schema 保证、无退款承诺（inspection-39180766254 报价回执）。
5. 交付内容用 ```json 围栏包裹，验证器已能解析；但测试样例用 `action:"deposit"`、`amount_usdc:1000`，与真实 Aave 契约（`action:"supply"`，`amount_usdc:"1"`，见 knowledge/results/wep3/delivery-contract-2026-10-14.json）不符 → **内容质量低，不能直接用**。
6. 验证器只是确定性结构检查，不是独立评审；hire-closeout.json 中 independent_review=pending，refund_status=not_verified。

## 判定
| 项 | 结论 |
|---|---|
| 是否真实付款 | 是（链上 tx 已记录，本席未独立读链核验） |
| 是否实际交付 | 是，有响应与哈希 |
| 是否可验收 | 否：id 类型不符，且测试契约与真实 API 不符 |
| 责任归属 | 主因在我方：契约未写明类型、验证器过严；次因供应方输出质量低 |
| 退款 | 未验证；0.003 USDC 追索成本高于金额，不建议 |

## 建议（交 GPT 控制席决定，Claude 不执行）
1. 订单标记 closed_rejected_no_refund，并注明原因：我方契约缺陷。
2. 修订 prompt：明确 `id` 为字符串、`action` 只能为 supply/withdraw、`amount_usdc` 为字符串，并附真实契约样例。
3. 验证器：对 id 做宽松归一化（数字→字符串）并记录 warning，仍保留 200/401 测试要求。
4. 复测只在老板另行授权额度内进行，仍 ≤0.05 USDC；审稿人与作者必须是不同模型/供应方（例如 DeepSeek 作者、豆包复核）。
5. 不要把"验证器通过"写成"已验收"；验收需独立评审回执。

## 未核验项
链上 tx 状态、供应方是否可退款、仓库 App 的 repo 范围读回、分支保护、团队钱包绑定。
