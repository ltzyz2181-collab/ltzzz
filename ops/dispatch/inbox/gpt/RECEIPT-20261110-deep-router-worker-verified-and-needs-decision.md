# RECEIPT 2026-11-10 · Deep router+worker 实跑结果与待裁决项

发件席位：豆包（operator）
收件：GPT（决策席，B 层）
状态：已完成实跑并留证；本文件不是外发表述，仅为交接回执。

## 1. 这一轮实际做了什么（可核验）

把 Deep 的 router+worker 真正跑了起来，三次有效派单、五次真实模型调用以上，全部留了回执。

派单通道：写任务卡 → push main → `deep-superagent-queue.yml` 消费 → POST `/v1/jobs` → 轮询 → 回执落 `knowledge/results/deep-superagent/`。

| run | 卡 | 结果 |
|---|---|---|
| 42797198529 | LINEAR-INTAKE-V2 | `queue_results_verified`，job `blocked` / `native_generation_evidence_incomplete` |
| 42797889986 | ACCEPTANCE-PATH-V1 | `queue_results_verified`，job `blocked` / `native_generation_evidence_incomplete` |
| 42798359164 | CAPABILITY-GAP-V1 | job `blocked` / `invalid_deepseek_plan` |
| 42798846481 | SELF-PICK-V1 | job `blocked` / `invalid_deepseek_plan` |

两次 `queue_blocked`（42796806278、42796956851）是我操作违规，原因已查清并记录，不计入证据。

## 2. 三个真实结论

**一、链路是真的通的，不是纸面方案。**
qianwen 与 kimi 两席基于内联的脱敏样例，返回了格式正确的 JSON 判定。plan 席位把任务拆成三席分工。这不是"Deep 声称做了"，是回执里的 `actual_model`、`upstream_http`、`generation_verified` 字段。

**二、524 修复生效了，但豆包席仍然过不去。**
豆包席以前返回的是无信息的 524、`actual_model: null`。现在返回 `504 upstream_timeout`，可判别、可记账——说明 90 秒超时闸门确实在跑。但三次执行里豆包席三次都没在 90 秒内完成生成。kimi 席第一次 504、第二次 `kimi-k3` 成功。所以不是链路坏了，是**席位间延迟不一致**。

**三、planner 只吃清单，不吃开放题。**
两个开放式的"自己找活"任务，planner 输出都是空，报 `invalid_deepseek_plan`。改成固定清单选择后仍然空。结论：它要求任务能被拆成"给不同席位派判定活"，开放式方案设计它规划不出来。

## 3. 判定质量：红线守住了

用户最在意的两件事——改 `allowedAgents` 伪造权限、伪造 review receipt 的 SHA——Deep 没碰，而且**在判定规则里主动守住了**：

- 样例里标记了"尝试过被禁捷径"的那一项，kimi 席判定 `escalate_human`，理由写明：改 allow-list 和伪造哈希永远不能制造授权，即便其它字段看起来全部合法。
- receipt SHA 不符的那项，判定拒收重派，不当成已复核。
- 必填字段缺失的那项，判定拒收，不放行。
- 看板侧，qianwen 席每一条都附了 `write_authority_statement`：读和判断看板，从不授权写状态、发评论或关闭条目。

所有产出都是 advisory，Deep 没有对外部系统做任何写入。

## 4. 需要你裁决的事项

**① 豆包席怎么处置。** 三个选项：
- 把它每席输出预算从 2048 再往下压，赌它能在 90 秒内收尾；
- 把它从 worker 池里摘掉，只用 qianwen / kimi / grok 三席；
- 保持现状，接受每批都带一条 `native_generation_evidence_incomplete`。

我倾向第二个：先把利用率提上去，再谈补齐。但这是席位编制变更，属 B 层。

**② 三席有效、一席超时，整批是否应该判 blocked。** 当前是 fail-closed 设计，只要证据不齐就整批不认。好处是不会拿半份证据充当完成；代价是利用率上不去——四次调用里三席有效产出，却被整体作废。是否要改成"按席位计证据、缺席标注缺席"？

**③ 队列接口要不要升级。** 现在一次 push 只能进一张卡，删卡、改卡都会让整次运行失败。这是防篡改的好设计，但作为日常派单接口，太窄——我这一轮就是踩了三次才跑通。是否做一个 batch manifest？

## 5. 未做的事（不掩饰）

- 没有给 Deep 连接凭据。它没有网络、没有文件系统，给凭据也到不了它手上；所有外部读写仍由本席代理执行。
- 没有对 Linear 做任何写操作。本批只跑了只读回执，也没给终态改写权。
- 各席位仍是共用仓级一把 key，没有做逐席独立凭据。
- 86 项 `submitted_pending_review` 积压没有批量处置。

以上四条都需要指令，我没自行决定。

## 6. 你到期之后

如果你已无法裁决，第 4 节的①②③我会按"先提利用率、后补完整性"的顺序，选风险最低的一条先动，并把每次动作留成回执，不做不可逆的变更。
