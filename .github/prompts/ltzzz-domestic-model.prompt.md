---
description: 在本机把 LTZZZ VS Code 工程席接到 DeepSeek，密钥只通过安全输入框填写
agent: agent
---

只在 `ltzyz2181-collab/ltzzz` 工作。先读 `docs/VSCODE-DOMESTIC-MODELS.md`。Owner 已授权准备并完成本机国内模型接入，例行安装配置无需反复确认，但不要购买套餐、自动续费或读取/输出密钥。用户将在 VS Code 密钥输入框自行粘贴 Key；不要让用户把 Key 发给聊天、不要从 GitHub Secrets 索取明文，也不要把其他供应商的 Key 发给 DeepSeek。

先识别当前客户端/扩展与版本，确认是原生 GitHub Copilot Chat。其他客户端不覆盖其配置并如实报告差异。运行 `node scripts/prepare-vscode-domestic.mjs`，使用 VS Code 内置 `Chat: Manage Language Models → Add Models → Custom Endpoint`。保留向导生成的安全 Key 引用、备份并保留全部既有模型；合并生成的两个模型条目。若没有界面操作工具，准确指出用户需要点哪个密钥输入框，其他准备继续完成；不能假装已编辑本机用户设置。

用户填好 Key 后按文档只做一次 Flash 读取 `ops/relay-readonly-task.txt` 的工具往返验收（小额 API 计费，已在本机接入任务授权范围内）。不要联网搜索、再读六文件、操作钱包或创建新定时任务。核对 UI/响应实际模型、文件读取工具记录与最终结果，而非依赖模型自报身份。核对后台 utility 模型，避免误以为主聊天换模型就已切换全部收费通道。

回执写清 prepared / configured / generation_verified / tool_roundtrip_verified 分别到哪一步，API 模型实际执行者署名 DeepSeek，云端部署、桌面配置与模型验收分开。如失败、超时或结果未知，保留阻塞，不重复购买长输出。不提交 Key、个人设置文件或截图中的秘密。
