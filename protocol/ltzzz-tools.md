# LTZZZ 工具清单（选定接入）

> 版本：2026-09-17。原则：只接对 LTZZZ 有用的；有现成替代的不重复接。

## 已接入/可用（LTZZZ 主链路）

| 工具 | 用途 | 状态 |
|---|---|---|
| FFmpeg 本地引擎 | 视频合成/字幕/封面（1080×1920/9:16/30fps/H.264） | ✅ |
| Seedream（image_gen） | AI 图片生成 | ✅ |
| GitHub / Pages | 仓库/网站托管（ltzzz.com） | ✅ |
| Cloudflare Workers | API/任务中枢/支付代理 | ✅（部分待部署） |
| 支付宝 ltzzz-pay-proxy | 支付（沙盒已验证） | ⏳ 提审中 |
| YouTube / TikTok Worker | 视频发布 | ⏳ 待 OAuth |
| Telegram Bot | 通知通道 | ⏳ 待 Bot Token |

## 本次新增选用（2026-09-17）

| 工具 | 用途 | 接入方式 | 状态 |
|---|---|---|---|
| **Deepnote** | AI 数据工作流（账本分析/实验数据/报表，类 Jupyter + Agent） | 官方账号 + API Token（deepnote.com） | ⏳ 待账号 |
| **CodebaseDesign** | 代码库架构/模块设计辅助（Worker/工程结构） | Agent 按需调用（应用市场获取） | ⏳ 待安装 |

## 不接入（明确）

| 工具 | 不接原因 |
|---|---|
| Deep Art AI | 图片/视频生成已有 Seedream + FFmpeg，功能重叠 |
| DeeplyClear | 思维导图，LTZZZ 用 Markdown 文档即可 |
| Data（数据问答） | 具体服务/API 不明，Deepnote 可覆盖 |
| CE Cosmos Deep Dive | 依赖不明，数据源可按需用搜索替代 |

## 说明

以上工具均与 DeepSeek **无任何关系**（仅名字含 Deep）。Deepnote/CodebaseDesign 接入后，用于 LTZZZ 数据分析与代码工程，不承担资金/密钥职责。
