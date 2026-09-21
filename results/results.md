# Result Center

## 标准链路
任务 → 执行 → 实际结果 → 验证 → 数据/证据 → 下一步

## 视频流水线
见 [video/PIPELINE.md](./video/PIPELINE.md) · [video/registry.md](./video/registry.md) · [index](./video/index.html)

## 状态
- planned：计划
- running：执行中
- succeeded_unverified：有输出但未验证
- verified：有外部/程序证据
- failed：失败
- blocked：等待人工凭证/权限
- waiting_human：视频发布默认态

## 禁止
- AI 回复“完成”不能直接标记 verified。
- 代码存在不能直接标记 deployed。
- API Key 存在不能直接标记 live。
- 无人工确认不得调用 YouTube/TikTok 发布接口。
