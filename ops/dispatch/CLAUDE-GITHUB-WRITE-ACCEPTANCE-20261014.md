# Claude 单次写入验收与审核交接

单号：CLAUDE-GITHUB-WRITE-ACCEPTANCE-20261014
状态：blocked_owner_github_reauthentication；不是已接单、已提交或已完成。
来源：owner 要求解决 Claude 审核已完成但无法推送的问题，不下载附件、不把凭证发给模型。仅用仓库 ltzyz2181-collab/ltzzz；不增加付费模型调用和定时任务。

## 完成授权后给 Claude 的指令

> 读取本文件。先检查本客户端是否实际有 git push 或等效仓库写工具。若有，在 ltzyz2181-collab/ltzzz 建一个 claude/audit- 开头的分支，把你在本会话已经完成的完整审核原件直接写到 knowledge/results/external/，并在 ops/dispatch/receipts/ 留真实接单回执，提交 PR。不要让我下载文件。不能重新生成一篇摘要冒充原审核；缺少原件就明确说缺少。仅提交审核与接单文件，不改资金、Secret、自动化权限或生产代码，不直接推 main。回报真实 source_commit、分支、提交 SHA、文件路径和 PR 链接。若仍只有读取工具，直接在本会话完整输出审核正文，不索取任何密码或 Token，也不要再次断言“肯定只差安装 App”。

## 验收必须记录

- 实际 Claude 客户端/模型（不知道就未知）、执行时间与时区。
- 实际读取的 source_commit 与文件；没读六文件不能代签已读。
- 原审核全文及其引用；证据无法访问的地方保留无法核验。
- GitHub App 授权范围、当前客户端是否暴露写工具、实际 push/PR 成败分别列出。
- 由总控/豆包代存时，署名“owner 转交的 Claude 输出，由执行席代入库”；不伪造 Claude 直接推送。

## 当前边界

总控已实际用登录会话打开官方 Anthropic Claude App，选择 Only select repositories → ltzyz2181-collab/ltzzz；最后 GitHub 要求邮箱身份验证，未最终安装。安装后还需让实际具备写工具的 Claude 客户端刷新授权/连接，再做一次真实 PR 验收。

模型 API Key、模型控制台服务账户、GitHub App、git 客户端权限不是同一个东西。不能把 DeepSeek/豆包 Key 或 GitHub 登录密码填给 Claude 来解决仓库写权限。服务账户页面所属平台尚未确认，不据片段创建或提升管理员角色。
