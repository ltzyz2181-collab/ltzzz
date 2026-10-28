# WorkBuddy 实际接单验收与 A2 检查故障核对

- 原 Task ID：`PLAN-PATCHGATE-ESCROW-20261023`；步骤：`WORKBUDDY-A2-CHECKS-20261028-01`。这是原工程任务的接力，不是新增市场订单。
- 对象：WorkBuddy 已安装桌面执行端；Agent Mail 为送达渠道。DeepSeek 为执行模型候选，Kimi 为不同提供商复核候选；必须按实际响应元数据署名，取不到填 null。
- 派发方：GPT / OpenAI，现有 Codex 会话；精确模型 ID 未提供。
- 授权：owner 本轮明确要求“给微信办公派单试试，核对自动补丁、合并、放款与注册进度”。不扩大 M1 2hives 跟进范围。
- 固定输入提交：`5ee46c36a6c8002e5c520a0d2c1885b216d08231`。
- 接单 nonce（关联标记，不是凭证或签名）：`WB-A2-20261028-01-5ee46c36a6c8`。
- 幂等键：`PLAN-PATCHGATE-ESCROW-20261023:WORKBUDDY-A2-CHECKS-20261028-01:workbuddy`；只执行一次。先查原任务卡、认领和回执；存在未知结果先对账，不能重复发信或重复提交。
- 截止：收到后 24 小时；未获自动唤醒就如实写未接单，不假报“后台正在工作”。

## 先认领
从本邮箱原邮件线程回复：`ACK PLAN-PATCHGATE-ESCROW-20261023 WORKBUDDY-A2-CHECKS-20261028-01 WB-A2-20261028-01-5ee46c36a6c8`，并注明实际客户端、执行时间、工具能力；不要仅复述任务就称交付。回信发往原发件邮箱，不给 2hives 或其他平台发任何消息。没有发信工具就在本机留认领 JSON，说明尚未送达总控。

## 本次实际工作
1. 读取固定提交的 `skills/ltzzz-task-execution/SKILL.md`、`knowledge/results/patchgate/status.json`、`config/patchgate-executors.json`、`config/patchgate-author-checks.json`、`config/small-payment-activation-authority.json`。记录完整提交与各文件实际 SHA256。
2. 用已有合法工具读取 Actions run **40640185026** / attempt **1**、job **122656319022**（PR #279 head `86b8c8f2a9b20282ae20bfc8d00bb21cf330b8f1`）的真实日志和公开安全工件。总控已确认 run 为 `pull_request_target / failure`，日志末尾 exit 1；没有读到细节，不能据此断定是签名缺失或代码回归。
3. 明确裁定：这是普通补丁资格检查按设计拒绝，还是收集器/脚本真实故障。列出具体文件、字段、错误原文的安全摘录、原因与一条最小可验证修复。若需要改代码，只做隔离分支与草稿 PR；若是按设计拒绝，解释准确，不为了变绿放宽检查。
4. 逐项整理“已具备 / 缺的真实能力 / 可由哪个现有执行器补齐”：补丁测试、A2 自动合并、A3 隔离部署、托管测试网充值/放款/退款三类交易。签名登记、IAM 和云端运行位置不能由模型自称或测试密钥代替。
5. 请不同实际提供商的 Kimi 复核本次工件的确切哈希、失败归因和完成用词；记录真实模型响应元数据与复核结论。若工具取不到元数据或不能自动调用 Kimi，就留 null 和具体阻塞；不能冒充已复核。
6. 已有 UUMit 绑定仅作为 owner 报告的外部连接状态。可以读回本机现有连接状态的非敏感字段，但不重装、不读取凭证值、不发布服务、不接/创建市场订单、不运行需要扣款的激活调用。该任务不是 UUMit 派单通道验收。

## 回执与验收
- 执行回执：`knowledge/results/patchgate/workbuddy/WORKBUDDY-A2-CHECKS-20261028-01/execution.json`；报告：`knowledge/results/patchgate/workbuddy/WORKBUDDY-A2-CHECKS-20261028-01/report.md`；Kimi 独立复核：`knowledge/results/patchgate/workbuddy/WORKBUDDY-A2-CHECKS-20261028-01/kimi-review.json`。
- 有仓库写通道就以独立分支/PR提交；没有则写本机 `results/workbuddy/WORKBUDDY-A2-CHECKS-20261028-01/`，邮件返回安全文本与哈希，说明还未入库。不读 Key 文件，不把本机私密路径或任何凭证贴进邮件、仓库或日志。
- 字段至少：task_id、step_id、nonce、client、actual_provider/model/metadata_source、at_utc、source_commit、run_id/run_attempt/job_id、原始错误、核对结论、artifact.path/sha256、review.provider/model/verdict/artifact_sha256、stages、status、limitations、settlement_kind、paid、tx_hash。
- `paid=false / tx_hash=null / settlement_kind=none` 只表示本次无资金结算，不代表模型 API 零成本。普通工程回执不要求 `reasoningHash`。
- 邮件 SENT ≠ 对方收件；ACK ≠ 工程交付；绑定 ≠ 自动接单；草稿/测试 ≠ 合并/部署/放款。仅有作者工件就记待独立复核。
- A2/A3/B 与支付开关保持现状；不改预算、信任根、签名人，不调用钱包，不部署生产服务，不新增定时器，不调用原厂 GPT/Claude 付费 API。不要把技术阻塞改成新增 owner 审批门。

验收目标：一次真实 WorkBuddy 工具执行 + 可回读工件 + 不同提供商的实际复核；自动收信/自动认领没有运行证据则仍未验证。
