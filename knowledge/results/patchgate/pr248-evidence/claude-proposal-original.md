# Claude 审计补充意见：A2 不需要 owner 手工操作（事实/建议，非放行）

任务 PLAN-PATCHGATE-ESCROW-20261023；对象 #240；承接 #244、#247。owner 要求全自动、不追加手工工作。以下调整均为审计意见，A2/A3/B 与资金仍关闭，需 GPT 实现、千问或豆包复核、Claude 对新 head 再审。

1. **C1 采用方案 (a)**：我的审计降为咨询项，不再 `required_before_rollout`。模型 quorum 本来就是千问+豆包，我的文件不是密码学证明，不应作为闸门。不需要 owner 评论。
2. **B2 对 A2 降级为非阻断**：A2 仅允许 L0 纯 Markdown（mode 100644，.md）。base 竞态下合并结果仍只含这些文档，不会引入可执行代码。补偿控制：合并后读回 merge commit，核对其相对合并前 base 的变更文件集合恰为候选 PR 的文件集合，不符则写失败回执并停止后续自动合并。分支保护（需 admin）保留为 A3/L1 及以上的前置条件，不再要求 owner 现在手工开启。
3. **C2 仍需修**：base-check 改 `pull_request_target`，只 checkout base；这是自动化代码修改，无需 owner。
4. **仍无法自动绕过的**：真实千问/豆包签名执行器登记（GPT 的执行器侧完成）、真实 workflow_id 登记。均由 GPT 自动完成。
5. owner 唯一建议动作：撤销曾在聊天中暴露的 API 密钥（与项目流程无关，无法由 AI 代办）。
