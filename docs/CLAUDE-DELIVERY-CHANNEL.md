# Claude 在任与交付通道

岗位唯一源是 `identity/seat-registry.json`：Claude负责独立审计＋规划，在任；API记录为额度不足，主要交付为 `repo_pr_only`，不要求自动原生日课。免费Claude Code的仓库PR和规划派单继续有效。微软除名与使用微软客户端外壳是两件事。

| 通道 | 监督查什么 | 不可推断什么 |
|---|---|---|
| native_receipt | 原Task ID、真实认领、不可变输出、submit/独审回读 | 心跳200不能证明生成 |
| repo_pr_only | 原Task ID对应PR、工件哈希、审核/合并阶段 | 共享GitHub账号不能证明原生Claude型号 |
| client_web_only | 网页发送与真实回复、会话/时间、客户端可见元数据 | 保存登录或ACK不等于执行/定时 |
| disabled | 当前岗位来源的明确停用状态 | API余额不足或日课模式不是岗位停用 |

实际代执行是与这些通道分别记录的事实：同一原任务由DeepSeek/豆包生成，就写logical_seat=claude、kind=delegated_artifact和真实actual_provider/model；没有同编号工件不能借别单结案。它仍需独立审核，不变成原生Claude。

用法：Claude继续按原任务开PR，实际派给千问的卡放 `ops/dispatch/queue/`，Meta/网页席放原inbox；已授权总控合并/转发，并落消费回执。#210已按这个链路交付：合并是派单入库，消费者返回才是交付；微信办公五题只验规则复述。

## 给PR与代执行绑定证据

`knowledge/results/dispatch/external-deliveries/index.json` 的 deliveries 追加一项：

```json
{"task_id":"原TaskID","receipt":{"path":"knowledge/results/dispatch/external-deliveries/receipts/原TaskID.json","sha256":"回执原始字节SHA256"}}
```

回执字段：task_id、logical_seat、kind、source_commit（40位）、artifact:{path,sha256}。工件JSON的task_id或Markdown的Task ID字段必须匹配原单。

- kind=repo_pr：另带pr_snapshot:{path,sha256}；快照由有GitHub读取能力的总控/执行器保存，包含repository、number、head_sha、state、merged和files[{path,sha256}]，匹配所审工件版本。PR未审与已合并分开，不猜原生模型。
- kind=delegated_artifact：另带actual_provider和execution:{path,sha256}；执行器JSON包含同task_id、logical_seat、actual_provider、model、source_commit、artifact_sha256、generation_verified、finish_reason。只认正常完成、原字节hash与实际上游一致；模型自称不算。

对已明确要求交付的外部任务，可把原ID列入索引的required_tasks；即使没有接单文件，也仍检查并警告PR/交付缺失，不能用未排班状态掩盖明确任务。

维护者把绑定作为同一原任务收尾，不创建第二订单。输入有冲突、hash失效或有多份互相矛盾的绑定，报external_delivery_evidence_invalid；既不补造接单，也不把错误链接当通过。

当前10-17至10-21五条旧日单：未找到同原编号的代执行工件，不能统称“DeepSeek已代做”；它们按在任的外部PR渠道更正为非原生自动接单参考项。具体认领任务仍检查PR/交付，没有把参考项算成完成。
