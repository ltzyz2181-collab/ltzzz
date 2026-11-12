# Deep 中转执行席启用与真实调用回执（2026-11-12）

## 1. 本轮改了什么

- commit `95cd599da`：Deep Worker 传输层改为 LTZZZ relay-proxy 转发。
  - 直连站点 key 一旦出现即 `relay_direct_station_key_forbidden`，不再作为回退。
  - Deep 侧只持 `RELAY_PROXY_TOKEN`（受限网关令牌），请求头 `x-ltzzz-seat-token` 与 `x-ltzzz-batch: 1`。
  - 中转席仍只能 `work_gpt` / `work_claude`，不能 planner、不能独立复核。
- `RELAY_STATION_KEY` 同步为仓库 actions secret，使 CI 注入与线上 Worker 的站点 key 单一来源；值未进入仓库、日志或聊天。

## 2. 部署结果

| 工作流 | run | 结论 | headSha |
| --- | --- | --- | --- |
| Deploy LTZZZ relay proxy | 43137263881 | success | 95cd599da |
| Deep Superagent isolated deployment and explicit bootstrap | 43137263839 | success | 95cd599da |

## 3. 真实 Deep -> 中转调用

- 探针卡：`ops/deep-superagent/tasks/DEEP-RELAY-PROBE-20261112-01.json`（commit `8c25445c6`）
- queue run `43137568562`，回执 `knowledge/results/deep-superagent/queue-43137568562-attempt-1.json`
- job 状态：`completed_pending_external_acceptance`，`model_calls=3`

| 阶段 | 席位 | 实际 provider | 实际模型 | request id | tokens | 结束 |
| --- | --- | --- | --- | --- | --- | --- |
| plan | deepseek | deepseek | deepseek-v4-pro | 43bf4751-884f-4902-ac1a-9711f8a4974d | 831 | stop |
| work_gpt | gpt | apisrouter_relay | gpt-6.1-sol | resp_0c947c4aa318b502016af51c2c060c87d0b9d8746397977760 | 7726 | stop |
| independent_review | deepseek | deepseek | deepseek-v4-pro | f310a40c-67b7-4674-9899-03c06093fd63 | 1345 | approved |

结论：Deep 席经中转完成一次完整链路（原生 planner -> 中转 gpt 生成 -> 原生独立复核）。这只证明传输可用，不等于外部验收或客户可用。

## 4. 边界

- `paid=false`、`financial_execution=false`；本轮无资金动作。
- 资金、签名、钱包、Safe、放款、生产写仍排除在模型执行器之外。
- 评审、技能迭代、资金三类自动化部署仍需 GPT 裁决。
- 中转不计入「≥2 家原生 provider 独立复核」映射。

## 5. 已发裁决邮件

- message_id `msg_H54jFJM5EhkoFM8HAcxxCmjfAPdev9SpKPqU9dZAjen_Kw`，created_at `2026-11-12T01:55:40Z`，收件 `ltzyz2181@gmail.com`。

## 6. 仍待裁决

1. 是否认可中转席进入常态派单。
2. 是否加「原生可做优先原生」的派单偏好，避免 planner 滥用中转席。
3. Claude 默认档固定为 `claude-sonnet-4-6`（`claude-haiku-5-5` 站点侧 503）。
4. 网关令牌是否与 Deep 对外鉴权令牌拆分为两个 secret。
