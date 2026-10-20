# 独立审计：OWNER-EXT-AI-20261020-01（Issue #159）

审计席：Claude（只读；无钱包、Key、签名；未调用任何付费 API，也未重复采购）。
日期：2026-10-20。材料：knowledge/results/owner-external/OWNER-EXT-AI-20261020-01*.json、wep3-procurement-contract.js。
我这边是独立复算与对照，不是重放线上请求；我的运行环境访问不了 workers.dev 与链上节点。

## 结论（三项分开）
| 项 | 结论 |
|---|---|
| 付款 | 回执层面成立：0.003 USDC（amount_raw 3000）≤ 上限 0.05（50000）；receipt_status=1，区块 52850746；付款方 0x5df57a78…a32d 与 wallet/addresses.md 登记的金库一致。**我未独立读链**，属"仓库回执可信、链上未复核"。 |
| 交付质量 | 弱成立：仅是工程草稿，且基本在复述我方提示词给定的信息，见下。 |
| 线上规范回归 | 8/8 通过，但它测的是**线上接口符合我方提供的规范**，不是外部供应方的工作成果。不得把 8/8 写成"外部 AI 交付通过 8/8"。 |

## 已独立核对
1. 交付哈希：对回执里 deliverable 全文重算 SHA-256 = 30a1a1ac…5eff，与回执一致。
2. 上次拒收的两个问题已修复：`id` 为字符串（INCORRECT_LIMITS_LOCATION 等）；POST 用例含合法 intent_id、`action:"supply"`、`amount_usdc:"1"`（字符串）、X-Lab-Pin 头。说明新契约比 10-17 那单更清楚。
3. 作者身份：deepseek/deepseek-chat 仅为供应方自报（model_identity_verification=provider_report_only）。豆包侧是 provider 回包 doubao-seed-2-1-pro-260915，回执也自注"不是模型身份证明"。作者与复核来自不同供应方这一点，只有"自报"支撑。
4. 豆包首次复核 10:07 失败（incomplete，blocked_review_generation），10:19 恢复复核成功；恢复流程没有新增采购和付款（new_transactions=0），1 次模型调用，1032 tokens。记录一致、没有被掩盖。

## 需要警惕的点
A. **交付基本复述提示词。** 提示词（wep3-procurement-contract.js 第14行）已明确写出两个缺陷："GET 应为 POST"与"读 status.limits 而非顶层 single_cap_usdc/exposure_cap_usdc"。交付给出的两个 issue 恰是这两条，**新增发现为零**。说是"外部 AI 做了工程审查"证据不足，只能说"外部 AI 按给定内容整理成了回归件"。
B. **交付的正对照与实测不一致的风险未排除。** 交付 VALID_PREVIEW_REQUEST 预期 200，用的是占位 PIN 和 intent_id CONTRACT_TEST_INTENT_20261020。线上规范 T08（有效 PIN）实测返回的是 422（因为带了禁止的 `to` 参数）。交付自己的 200 用例**从未线上运行**（豆包 live_http_verified=false），所以"预期 200"既未证实也未证伪。
C. **豆包"接受"是静态阅读结论。** 它自己列了 5 项无法静态证实的内容（intent_id 是否可用、PIN 是否通过、限额字段位置、真实状态码、withdraw 行为）。"accepted_engineering_artifact" 的准确含义只是"结构与逻辑自洽"。
D. **负对照是本地断言故障注入**（network_calls=0, independent_design_proven=false），回执自己也注明不证明独立设计。可以，但不要拔高。
E. 8 项里 T08 的预期值 422 与 T06/T07 是我方规范给定的，线上与规范一致只能证明"接口没跑偏"。

## 未验证
链上 tx 实读；供应方真实模型；交付 200 用例的线上行为；退款/申诉通道（0.003 USDC 不追）；agent402.tools 是否稳定可重复交付（仅 2 单样本）。

## 建议
1. 状态写法建议：`paid_delivery_accepted_engineering_draft`，范围注明"复述提示词 + 回归件；非原创设计、非生产部署、非内部积分工资"。
2. 下一单（≤0.05 USDC）改为**不在提示词里给答案**：只给 API 说明和一个已知缺陷，让供应方找另外至少一个，才能衡量"雇佣"产生的新增价值。
3. 把交付的 VALID_PREVIEW_REQUEST 改为实测可得的预期（有效 PIN 且无禁止参数的真实响应）后再入回归库。
4. 本审计不授权新增付款、定时调用或钱包权限。
