# Result Center

## 标准链路
任务 → 执行 → 实际结果 → 验证 → 数据/证据 → 下一步

## 状态
- planned：计划
- running：执行中
- succeeded_unverified：有输出但未验证
- verified：有外部/程序证据
- failed：失败
- blocked：等待人工凭证/权限

## 禁止
- AI 回复“完成”不能直接标记 verified。
- 代码存在不能直接标记 deployed。
- API Key 存在不能直接标记 live。
