# 仓库入口与文件归类

先读 [AI-START-HERE.md](../AI-START-HERE.md) 与 [统一执行 Skill](../skills/ltzzz-task-execution/SKILL.md)。本页是导航和清理约定，不授予账户权限，不代表部署、任务验收或付款。

| 类别 | 固定位置 | 用法 |
|---|---|---|
| 当前配置 | `config/`、`identity/` | 读取现行边界、席位与实际执行器登记；不从历史报告猜现状 |
| 运行代码与构建 | 根目录 Worker、`cloud/`、`scripts/`、`tools/` | 保持现有导入、Wrangler 与 Actions 路径，功能迁移单独评审 |
| 可执行工作流 | `.github/workflows/` | 现行触发器；定日旧入口放到下方归档目录 |
| 当前原任务与接力 | `ops/dispatch/`、`ops/dispatch/inbox/` | 沿用原 Task ID；接力文件存在不算自动唤醒或认领 |
| 当前监督状态 | [监督说明](DISPATCH-OVERSIGHT-CURRENT.md)、`knowledge/results/dispatch/oversight/latest.json` | 活跃欠项按原 Task ID 去重；旧问题没有闭环证据就继续保留 |
| 验收、失败与审计证据 | `knowledge/results/`、`results/` | 保留原字节、哈希、运行 ID、接受与拒绝；不要为整洁删除失败记录 |
| 长期记忆 | `ltzzz-memory/`、`memory/` | 原文、候选与晋升来源各按现行契约处理，清理任务不改原文 |
| 正式素材与成片 | `assets/`、`videos/` 或现有 R2 | 当前页面/发布器引用的素材保留；大视频通过既有持久对象队列交付 |
| 历史 runner 日志 | `knowledge/archive/runner-logs/2026-10/` | 从 ops 根目录逐字节迁入，来源见清理清单 |
| 退休工作流源码 | [.github/workflow-archive/](../.github/workflow-archive/README.md) | 只保留历史源码，不再作为 Actions 手动上传入口 |
| 本机临时输入与渲染产物 | `work/`、`video-output/` | 运行时照常使用，但 Git 忽略；客户端先创建自己的 `work/relay-task.txt` 再调用现有 relay |

## 本轮清理与恢复

[逐文件清单](../knowledge/results/repository-maintenance/cleanup-20261029.json) 固定了清理前提交、原始 Git blob、SHA256、长度及归档路径。`video-output/` 是渲染器重建的缓存；重复品牌成片在 `videos/ltzzz-brand-60s-2026-10-14.mp4` 原样保留。relay 中间拷贝可按清单回溯，原接力卡和真实保护回执仍在原任务位置。

需要取回单个历史文件时，在独立临时目录使用 `git show '<source_commit>:<source_path>'`，校验清单哈希；不要覆盖调用端已有工作文件。删除工作树文件不会缩小 Git 历史，本轮不重写历史或强推。

## 后续整理规则

- 一次 PR 只交一个可独立审核的改动；先检查 `git diff --name-status origin/main...HEAD`，按路径暂存，避免把本机缓存和其他人的回执一起带入。
- 不批量移动运行代码、公开素材、`latest.json` 或签名输入。当前约 14.5 MB 的 Pulse 同内容别名仍有读取兼容要求，待单独核对读取端后再统一，不能直接删掉一半。
- 待办分为未认领、执行中、待复核、待部署、外部阻塞和已验收。只有原任务已有实际验收证据，才更新其状态；目录归档与关闭告警不是同一件事。
- 本轮没有将任何积压任务改成完成，也没有删除回执、改付款/A2/A3/B/预算/信任根或启动模型定时任务。

视频保留规则见 [VIDEO-RETENTION.md](VIDEO-RETENTION.md)：已核验公开并处理完成的视频只留发布回执，仓库 MP4 按哈希清理；未发布素材继续保留。
