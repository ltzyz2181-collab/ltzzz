# Memory Engine 规格

## 输入
- LTZZZ Memory 文件
- Tasks
- Assets
- AI execution logs
- Results
- 重要事件与决定

## 每日流程
1. 生成 memory manifest。
2. 所有 AI 开工前读取 manifest。
3. 按任务需要读取长期记忆全文。
4. 执行任务。
5. 输出结果、证据、失败原因。
6. 提取候选长期记忆。
7. 去重/冲突检测。
8. 高影响内容进入人工确认队列。
9. 写入 daily memory。
10. 更新 capabilities / results / next steps。

## 冲突处理
不同 AI 结论不一致时，不覆盖旧结论；记录：
- claim
- source
- model
- date
- evidence
- confidence/status

## 目标
让 LTZZZ 不只是“每个 AI 每天重新聊天”，而是让不同 AI 在同一个长期状态上共同演化。
