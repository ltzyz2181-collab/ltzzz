# 把桌面 VS Code 工程席接到国内模型

本轮先接 DeepSeek，复用已有供应商账户余额，创建桌面专用 Key `ltzzz-vscode-local` 即可；不用换掉云端日课的 Key。另一个 Key 不是免费额度，仍按同一供应商账户的实际 API 用量收费。工程选 V4 Pro，轻量任务选 Flash。实际执行者记录为 DeepSeek，不称为原厂 GPT/Claude。

## 1. 在哪里创建 Key

- [DeepSeek 官方 API Key 页面](https://platform.deepseek.com/api_keys)：登录现有账户，新建桌面专用 Key。创建 Key 与充值、购买套餐是不同动作；先查看账户已有余额。
- 若以后接豆包：[火山方舟官方 API Key 页面](https://ark.volcengine.com/region:cn-beijing/apikey)。需要模型专用 API Key 和实际开通的模型 ID；本轮不改豆包生产配置，不使用主账号 Access Key 代替模型 Key。

Key 只在供应商官方页面和本机 VS Code 的密钥输入框之间传递。不放对话、Issue、PR、截图或仓库。GitHub/Worker Secret 不支持反向取回明文；不能把“看不到 Secret 值”当成 Key 未部署。新 Key 的明文显示往往只有一次，复制后直接填 VS Code 安全输入框。

## 2. 桌面执行席准备

在 owner 已有的 `ltzyz2181-collab/ltzzz` 本地仓库更新 main。先识别当前运行的是 GitHub Copilot Chat，还是 Codex/Claude 等其他扩展；后者的认证和模型设置不同，不能套用本页后宣称已完成。检查 VS Code 版本与实际模型管理界面，CLI 不在 PATH 不等于 VS Code 没安装。

```sh
node scripts/prepare-vscode-domestic.mjs
```

命令只在已被忽略的 `.ltzzz-tools/vscode-domestic/` 生成无密钥模板和 `prepared_not_installed` 回执。不会读取本机 Key、改用户配置、安装扩展、调用模型或覆盖既有输出。重复运行时保留已有输出，需单独核对本地文件版本。

## 3. 使用内置模型管理器接入

1. VS Code 按 `Ctrl+Shift+P`，运行 `Chat: Manage Language Models`（聊天：管理语言模型）。选择 `Add Models → Custom Endpoint`。
2. 分组名填 `LTZZZ DeepSeek`，在 VS Code 的密钥输入框粘贴刚创建的 DeepSeek Key。API 类型选 `Chat Completions`。
3. 向导打开真实的用户级 `chatLanguageModels.json` 后，仅向 `LTZZZ DeepSeek` 分组添加模板中的两个 `models` 条目。保留向导生成的 `apiKey` 安全引用和其他已存在的供应商；不能整文件覆盖。模板的 `${input:ltzzzDeepSeekApiKey}` 是密钥引用示意，不是已填好 Key 的证明。
4. 模型接口完整地址：`https://api.deepseek.com/v1/chat/completions`。模型 ID：`deepseek-v4-pro` / `deepseek-flash`。模板设置 `toolCalling:true`；先使用文本工具调用、非思考模式做兼容验收，不启用图像转发。
5. 打开聊天模型列表，工程任务选 `LTZZZ DeepSeek V4 Pro（工程）`，日常选 `LTZZZ DeepSeek Flash（日常）`。模型没有出现时检查实际配置错误、工作区信任、版本/组织策略，再按官方说明重新加载窗口。不能以显示名代替真实调用成功。
6. 如果使用实验性 Agent Host，只有在当前版本需要时才考虑 `chat.agentHost.byokModels.enabled`。先在普通 Chat Agent 会话验收，不能静默开启一组无关实验功能。

模板采用 65536 输入、8192 输出上限作为初始工作预算，并非模型厂商的最大上下文。DeepSeek 默认开启思考模式；Chat Completions 的思考模式工具调用要求回传 `reasoning_content`，客户端未保留它时可能报错。先验收非思考模式，再单独验证思考兼容性；模板出现在列表不代表完整的高级推理、图像或全部 MCP 能力已验证。

## 4. 先做一个小验收，再做真实工程

只用 Flash 做一次小任务：

> 通过文件读取工具打开 `ops/relay-readonly-task.txt`，确认开头是否是“总控”，回复首句。只读这一个文件，不访问网站、不改文件、不执行终端命令、不调用其他模型。

需要同时核对三项：VS Code 模型选择与响应详情确实显示 DeepSeek；会话工具记录确实读取了该文件并接回结果；最终答案与文件一致。仅模型自称“我是 DeepSeek”不算身份或工具验收。保留供应商请求 ID / 实际模型 / usage（如果客户端有显示），不要打印认证头。只做一次；超时、截断或结果未知就留阻塞，不用反复长任务烧额度。

此后可用 Pro 修一个小问题并跑测试。回执逐项记录 `client/version`、实际模型、模型选择、工具调用、测试、是否部署，以及尚未核实的部分。尚未在 owner 电脑执行时，只能写 `prepared_not_installed`；模型列表可见但未完成工具往返时仍是 `configured_unverified`。

主聊天改用 BYOK 不代表所有后台功能都自动改走国内账单。按照当前 VS Code 设置核对 `chat.utilityModel` / `chat.utilitySmallModel` 或 `chat.byokUtilityModelDefault`，将必要的摘要/标题任务指向实际可选的国内模型，或关闭相应默认调用。语义搜索、补全等能力可能仍依赖 Copilot 服务；不要承诺整套工具从此完全免费、不依赖国外服务或永久不断线。先报告实际生效的范围。

本地聊天需要电脑、VS Code 和模型网络可用；已部署的云端日课另行运行，不增加桌面每日任务、付费 cron、钱包操作或自动订阅。DeepSeek Key 不能用于 Seedance 视频生成，视频仍需其自己的 Ark 权限与计费。

## 官方依据

- [VS Code 模型与自带 Key](https://code.visualstudio.com/docs/agent-customization/language-models)：模型管理器、Custom Endpoint、密钥引用、工具能力、后台 utility 模型。
- [DeepSeek 首次 API 调用](https://api-docs.deepseek.com/zh-cn/)：当前模型 ID、兼容 API 与 Key 官方入口。
- [DeepSeek 思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)：默认思考与多轮工具历史要求。
- [DeepSeek 的 Copilot 接入指南](https://api-docs.deepseek.com/quick_start/agent_integrations/github_copilot/)：另有扩展接法；本页采用 VS Code 内置端点，不自动安装第三方扩展或启用图像代理。

上述配置依据官方文档编写；本地准备测试不证明 owner 电脑、供应商 Key 或真实模型工具往返已经验收。
