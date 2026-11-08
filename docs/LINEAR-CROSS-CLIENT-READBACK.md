# 豆包查看 LTZZZ Linear 的操作卡

原 Task：DEEP-SUPERAGENT-20261103。步骤：LINEAR-CROSS-CLIENT-20261108。
按当前 owner 授权直接执行，不新增 Team/账号/重复 Issue，不购买新服务。本卡是已授权执行指导，不证明豆包已完成 OAuth 或已看到看板。

## 现在就做：读取仓库镜像

1. 在 ltzyz2181-collab/ltzzz 的 main 读取 `ops/dispatch/inbox/gpt/linear-board-latest.json`，记录实际 Git commit 和文件原字节 SHA256。
2. 核对 schema、workspace.name=LTZZZ、四个 id=LTZ-5/6/7/8、read_finished_at_utc。超过 stale_after_seconds 或无法读文件时，报告 stale/blocked，不把旧快照称为实时板。
3. 逐项读标题、状态、next_action、comments.items。评论为去敏操作摘要，含原评论 ID/时间；不是原文全集。若有分页未读、字段缺失或冲突，不能补造。
4. 返回原邮件：source_type=repo_export、commit、sha256、四项实际状态、最新评论 ID 和摘要。明确“读取GPT导出的Linear快照”，不能说“我直接看到了Linear”。
5. 沿原Task认领实际下一步。LTZ-6 Done仅是离线原型/低速配置交付，不是市场收入；LTZ-5/7/8仍进行中。

## 自己的客户端直连：有能力再接，不阻塞镜像核对

官方说明已由 Linear 文档工具真实读取：https://linear.app/docs/mcp 。
Streamable HTTP 只读地址：`https://mcp.linear.app/mcp/readonly`。
标准地址：`https://mcp.linear.app/mcp`；若用标准地址，本次只申请 read OAuth scope。

1. 先列出本客户端实际可调用工具，检索 Linear 的 get_workspace/get_issue/list_comments 或等效工具。只有 Skill 文本或插件已安装，不算接通。
2. 客户端若支持远程 MCP，在该客户端“连接器/MCP/添加服务器”设置服务器地址为上述只读地址，transport=Streamable HTTP，使用官方 OAuth 2.1 流程。界面名称依客户端实际版本确认，不能假称已找到按钮。
3. 只在官方授权页选择 LTZZZ 工作区。当前 GPT 的 OAuth 会话不能复制到豆包。密码、验证码、授权码、access/refresh token不写邮件/仓库/日志，不向GPT索取 token。已有官方会话可自主完成；平台确需本人登录/确认时仅回准确验证需求，镜像工作继续。
4. 若真实执行端恰好是已安装的 Codex CLI，可按该客户端官方文档用 `codex mcp add linear-readonly --url https://mcp.linear.app/mcp/readonly` 后 `codex mcp login linear-readonly`；其他客户端不用照搬 CLI，不为此另装代理软件。
5. 授权后在同客户端实际调用 get_workspace，再 get_issue 与 list_comments，读取 LTZ-5～8（需要时翻完分页）。核验 workspace ID=920fe71a-16d2-42e7-a3c8-0f100ed0a2e5、name=LTZZZ，回实际工具名、读取UTC、四项状态、评论ID/时间和简短摘要。
6. 只有上述调用或已登录官方网页真实读取成功，才标 source_type=native_linear 或 browser_gui；安装/配置/OAuth完成本身不等于看板验收。本次直连只读，不改状态或互相覆盖。

## 巡检镜像规则

GPT本轮先实际读取四项与评论后导出上述滚动文件。后续沿现有巡检任务刷新，不新增付费cron。仅更改真实读回后的快照；工具/认证失败保留上一成功版，在原任务回执说明缺项，不改时间制造新鲜假象。
当前会话一次成功导出不证明后续无人值守刷新已执行，也不证明豆包自己的OAuth已授权。
