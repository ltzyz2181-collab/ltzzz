# 原任务积压收尾证据契约

类型：工程规范。修复既有 `QIANWEN-RETURN-*` 与 `ANS-*-deepseek` 的监督消费断点；不生成历史认领、不替换拒收、不把文件证明写成生产部署或原厂密码学证明。

## 千问回归单

原 `knowledge/results/dispatch/qianwen-return-YYYY-MM-DD.json` 可分别链接 `acceptance_receipt`、`delivery_receipt`、`review_receipt`；每个链接必须是 `{path, sha256}`，SHA256 由执行器按工件原字节计算。未提供新证据的旧单继续告警，正式 `DAILY-*` 日课不能抵扣。

- 认领沿用已有契约：`task_id` 必须是原 `QIANWEN-RETURN-*`、`claimed_by="qianwen"`，`accepted_at` 不早于原 `issued_at`，且不在未来。这里只证明仓库内回执关联，`claim_verified=false`，不冒充远端原生接单证明。
- 交付 schema 为 `ltzzz.external-return-delivery.v1`：原 `task_id/date`、`logical_seat="qianwen"`、同一 `acceptance_receipt`、40 位 `source_commit`、数字 `run_id`、真实 `actual_provider/model/metadata_source/model_calls`、`at_utc`、`artifact={path,sha256}`、`paid=false/tx_hash=null`。本期只消费 `delivery_kind="readonly_inspection"`；工程补丁不能用此状态代替代码、测试、PR 收尾。认领→交付→复核时间不得倒置。
- 复核 schema 为 `ltzzz.task-artifact-review.v1`：同一 `task_id/source_commit/artifact`，并绑定交付侧车的 `delivery_receipt`；`accepted` 必须为布尔值，附实际提供商与执行器元数据、`at_utc`、`paid=false/tx_hash=null`。实际提供商必须不同于作者；Qianwen/DashScope/Alibaba、Doubao/Ark/Volcengine 等别名不能冒充独立提供商。
- `repository_executor_code` 支持零模型只读检查（`model=null/model_calls=0`），必须如实署名；独立复核仍需模型提供商执行器的回执，不能由第二个规则名称自审。

全部匹配且接受只记 `external_return_reviewed_delivery_claim_unverified`，`delivery_status="partial_reviewed_delivery"`、`missing_stages=["authenticated_claim"]`，范围仍为仓库证据核验，`claim_verified=false/deployed=false/native_generation_verified=false`。原任务继续告警，不能拿已审交付消掉缺少真实认领的警告；目前没有配置依据允许这类回归单免认领，也没有新实现认证 claim 通道。缺失、篡改、自审、拒绝分别保持待交付、待审、无效或待修订，不因新增文件数自动关闭。

## 被拒 ANS 草稿的工程收尾

沿用 `knowledge/results/dispatch/oversight/closeouts/<原TaskID>.json` 的原任务、源提交、测试运行、PR、实物及哈希契约。另需：

1. `original_artifact={path,sha256}` 与原 ANS worker 工件完全一致，防止拿别单的补丁销账。
2. 真实作者 `actual_provider/model/metadata_source/model_calls`、`at_utc`、`paid=false/tx_hash=null`。
3. `review={path,sha256}` 指向新的 `ltzzz.task-artifact-review.v1`；绑定新工程实物和源提交，由另一实际提供商复核，`accepted=true`。旧草稿拒收不能作为新实现的通过证明。

满足时只记 `engineering_delivery_verified_not_deployed`；旧草稿 `draft_accepted=false` 和拒绝原文保留。测试回执、PR 或独立复核任一缺失，仍为 `engineering_completion_unverified`。本消费者不触发模型、合并、部署、支付或链上签名。
