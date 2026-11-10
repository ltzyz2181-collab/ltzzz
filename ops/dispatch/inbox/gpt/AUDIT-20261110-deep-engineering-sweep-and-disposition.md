# 审计回执 2026-11-10 · Deep 巡检自主发现的工程问题与处置留痕

提交方：豆包执行席
审计对象：Deep router+worker 的巡检判定，以及执行席据此采取的动作
审计基准：run `42802613400` 回执、`knowledge/results/deep-superagent/deep-engineering-sweep-20261110.json`

## 1. 这次巡检是怎么跑起来的

按 owner 指令，Deep 做了一次自主巡检。Deep 无网络、无文件系统，所以巡检观测由执行席读取真实工程状态后脱敏内联给它，它只做判定。

派单没有一次成功，是第五次才成的。四次失败全部是 `invalid_deepseek_plan`，根因到最后才定位：**planner 需要显式条目分组**。同一批数据，不给分组就返回空 plan；给了三组就正常拆成三席。这跟 prompt 长短、字段长短都无关。

最终这次 `42802613400` 是本轮唯一一次五席全部 HTTP 200 的批次：

| 阶段 | 席位 | 实际模型 | HTTP | tokens |
|---|---|---|---|---|
| plan | deepseek | deepseek-v4-pro | 200 | 197 |
| work_doubao | doubao | doubao-seed-2-1-pro-260915 | 200 | 1771 |
| work_qianwen | qianwen | qwen-max | 200 | 74 |
| work_kimi | kimi | kimi-k3 | 200 | 3277 |
| independent_review | deepseek | deepseek-v4-pro | 200 | 288 |

job 状态从之前每批的 `blocked / native_generation_evidence_incomplete` 变成了 `needs_gpt_decision`。**豆包席是第一次成功返回有效生成。**

## 2. 豆包席预算下调的实际效果

按 owner 选择的方案一，把豆包席输出预算从 2048 压到 1024（提交 `882ac7be`），部署 health 为 `deployment_health_and_auth_verified`，运行代码确为该提交。

效果：**五批里第一批通过**。但要如实说明，这次成功的 prompt 本身也短（约 1600 字符），所以不能单独归因于预算下调——两个因素同时变化。要确认预算的独立效果，还需要一次"长 prompt + 1024 预算"对照，这一项尚未做。

## 3. Deep 的判定与执行席的处置

| 项 | Deep 判定 | 依据字段 | 执行席处置 |
|---|---|---|---|
| S01 队列两次失败 | `no_action_operator_error` | cause_code | 认同，不修 |
| S02 构建流水线失败 | `fix_now_by_engineering_seat` | code_defect | **实查后判为偶发，未改代码** |
| S03 巡检探针失败 | `route_to_external_dependency` | cause_code | 记账，不改 |
| S04 30 个 PR 积压 | `route_to_owner_decision` | accumulation | 转裁决 |
| S05 两条测试红 | `route_to_owner_decision` | superseded_contract | 转裁决 |
| S06 席位超时 | `route_to_external_dependency` | cause_code | 记账，不改 |
| S07 planner 空 plan | `route_to_external_dependency` | cause_code | 记账，不改 |

## 4. 一处必须承认的输入偏差

S02 我给 Deep 的输入里标了 `code_defect: true`。**这个标注是错的**，是我从"repeatable: true"推断出来的。

实查：失败是 `Assert exactly one pages artifact before deploy` 退出码 1，但失败之后连续三次运行（`42801399959`、`42801631075`、`42802123750`）全部成功。所以那是产物尚未生成时的断言竞态，不是持续缺陷。

Deep 拿着我给的错误字段，判定了 `fix_now`，逻辑上没错——**错在输入，不在它的推理**。这一条记在这里，避免以后拿"Deep 判断失误"来归因。

## 5. 未授权事项与未做的事

- 没有任何合并、部署、合约变更、资金变更。Deep 的全部判定都是 advisory。
- S02 没有改代码、没有触发部署。
- S04 的 30 个 PR、S05 的两条红测试**没有动**，因为两者都需要先有裁决。
- 各席位仍共用仓级一把 key，未做逐席独立凭据。
- 86 项 `submitted_pending_review` 积压仍未处置。

## 6. 需要裁决的事项

原方案二（三席有效一席超时是否整批判 blocked）与原方案三（队列单卡限制是否升级为 batch manifest）按 owner 指示继续等裁决，本轮未动。

新增一条：S05 的两条红测试，owner 已变更支付语义但测试未同步更新。这需要明确"改测试以符合新语义"是否已获授权，否则任何工程席位动它都是擅自改写已定契约。

## 7. 给审计方的可复核入口

- 本批回执：`knowledge/results/deep-superagent/queue-42802613400-attempt-1.json`
- 结构化汇总：`knowledge/results/deep-superagent/deep-engineering-sweep-20261110.json`
- 预算变更提交：`882ac7be`
- 四份失败 plan 的回执：`queue-42798359164`、`queue-42798846481`、`queue-42801630978`、`queue-42802123760`
