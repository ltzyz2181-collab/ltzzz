# 桌面 Codex / Claude Code 能否承担 LTZZZ 代码部署

## 结论

能，但要分三档，只有第一、二档可以交给桌面 AI 应用；第三档不做。

| 档 | 做什么 | 能否交桌面 Codex / Claude Code | 前置条件 |
|---|---|---|---|
| A 仓库内改动 | 改脚本/测试/文档，本地跑测试，commit + push | 可以 | 桌面有 git 凭据、node、仓库在 `Desktop\ltzzz-repo` |
| B 触发部署 | push 后由 GitHub Actions 构建与上线，桌面只负责触发与回读 | 可以 | Actions 权限、workflow_dispatch/受保护分支规则 |
| C 生产写 / 资金写 | 直接改线上配置、动支付开关、签名、动 Safe | 不做 | 与"生产写不交模型"冲突，仍走闸门与既有 executor |

## 已经确认的桌面事实（历史实测）

1. 桌面 `codex`、`claude` 不在 PATH；codex 实际在 `%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe`。
2. 桌面 Codex `config.toml` 有 `[model_providers.deepseek]`，但缺顶层 `model_provider = "deepseek"`——不补这行，请求不会走 DeepSeek。
3. 桌面 Claude 侧 `~/.claude/settings.json` 已指向 `api.deepseek.com/anthropic` + `deepseek-chat`，但 `api.anthropic.com` POST 403、`api.openai.com:443` 不通。
4. 桌面直连 relay-proxy 与 apisrouter TCP 不通：中转能力只在 Actions 里可用，桌面用不了中转席位。
5. 桌面此前缺 node / gh。

## 本次环境限制（必须如实说明）

本轮云主机只看到 1 个执行环境（`vm`），桌面环境不在可见列表，因此上述 5 条是历史实测结论，**本轮没有在桌面上复测**。判定是条件式的：满足前置条件即成立，不满足则停在 A 档之前。

## 要让 A 档真正跑起来，需要按顺序验证

1. `node -v`、`gh auth status`、`git -C %USERPROFILE%\Desktop\ltzzz-repo status` 三项能跑通。
2. 补齐 Codex 顶层 `model_provider = "deepseek"`（改前备份 `config.toml`）；补完跑一次最小任务确认真的走 DeepSeek。
3. 用同一个任务做对照：裸 API 出方案 / Claude Code 实跑 / Codex 实跑，比成功率、耗时至可运行、改动文件数。三个数据齐了才能说"壳多提供了什么"。
4. 首次 push 用分支 + PR，不直接推 main；CI 绿了再按既有规则处理合并。

## 边界

- 桌面 AI 应用不得直接动生产配置、支付开关、Safe 签名、凭据。
- 桌面的"部署"只等于"改代码 + 跑测试 + 触发既定 workflow"，不等于绕开 CI 直连生产。
- 中转席位在桌面不可用，因此桌面上不存在"用中转 GPT 裁决"的路径；裁决仍在云侧走邮件与台账。
