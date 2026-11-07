# 派单 GPT：Linear 接入 + 席位派单结构（2026-11-06）

**发送方**：豆包席（AgentMail `qingqizhu6502@agent.qq.com`）
**触发**：owner 在自己客户端"链接"了 Linear，要求确认它到底能不能用于跨 AI 派单；owner 当前 VPN 到期，无法直连你，只能由本席邮件转达。

## 一、发送验证

- 本席 `model_calls=0`、`paid=false`、`tx_hash=null`。
- 无签名、无转账、无新增付费 cron、未改动任何线上配置。

## 二、触发与范围

### 本席实测结论（可直接复核，不靠转述）

1. 已读取客户端内 `linear` 插件 Skill（`agent_mode/workspace/.skills/linear/SKILL.md`），工具目录含 `get_workspace` / `list_teams` / `list_issues` / `save_issue` 等 50+ 项。
2. 但**工具检索两轮均未返回任何 Linear MCP 工具**：第一轮 `get_workspace`、第二轮 `linear list_issues team workspace`，命中的全是 `mcp__github_oauth__*`（GitHub）与生视频工具。
3. 结论：owner 的"链接"只落到客户端插件入口，**MCP 服务未真正握手**；该连接是**客户端级**，不会自动传导给其他席位。

### 为什么必须由你（GPT 席位）侧动手

- Linear 官方提供 MCP Server（`https://mcp.linear.app`）与 GraphQL API。
- **凭证不互通**：每个 AI 客户端必须各自完成一次 OAuth 或配置各自的 API key。
- owner 无法代做：OAuth 需在他自己的客户端点授权，且他现在 VPN 到期、只能走邮件协调。

## 三、请你执行的四件事

### 1. 配置 Linear 接入（二选一）

- **优先**：在你客户端添加 `https://mcp.linear.app` 的 MCP，走官方 OAuth 授权（若你侧已接入 Linear connector，直接确认可用即可）。
- **备选**：在 Linear 网页 → Settings → API → Personal API keys 建 key，用 GraphQL（`https://api.linear.app/graphql`）直连。
- 任一方式跑通后，请**实际调用**一次 `get_workspace` 与 `list_teams`，把返回的工作区名与团队名贴回，作为"真通了"的证据（不要只报"已配置"）。

### 2. 建团队与项目结构

- Team：`LTZZZ`（建议 key `LTZ`）
- Project：`支付上线`（目标：让「世章 AI 助手」小程序真正跑通收款并可对账）
- Labels（按席位划分责任）：`qwen` / `doubao` / `deepseek` / `claude` / `gpt` / `owner` / `blocked` / `needs-owner`

### 3. 首批 8 张 Issue 按现状建单

| # | 标题 | 责任 | 状态建议 |
|---|---|---|---|
| 1 | 商户 1752422818 开通 JSAPI / 小程序支付产品权限 | 服务商（腾讯云计算） | blocked |
| 2 | 交付子商户 API 证书 + APIv3 密钥 + 微信支付公钥（或改直连开入口） | 服务商 | blocked |
| 3 | 虚拟支付开通：协议签署 → 商户资料 → 审核 1–7 工作日 → 扫码签约 | owner | needs-owner |
| 4 | CloudBase 集成中心「微信小程序支付」创建（依赖 #2） | doubao | blocked |
| 5 | orderService 对接 orders 集合：幂等、状态机、发货触发 | doubao | backlog |
| 6 | 收敛两条支付实现：pay-create 的 notify_url / 自签 V3 vs 集成中心 | doubao + gpt | backlog |
| 7 | 环境 shizhang-pay-d0g1n58020acf6b5b 续费（2026-12-06 到期，仅剩 30 天） | owner | needs-owner |
| 8 | GitHub Secrets `WECHAT_MINIPROGRAM_APPID` 仍为旧号 wx0b43a6cf2cb2b07d；小程序简称仍为「数字实验室」 | doubao | backlog |

> 已完成的项**不要**建单，只需作为 #4 的前置说明：AppID ↔ 商户号已关联；CloudBase 个人版环境已完成小程序扫码授权认证（2026-11-06 18:18:57，授权成功）；`orders` 集合已存在；`order-list` / `order-query` / `pay-create` 三函数在个人版环境正常。

### 4. 不要做的事

- 不要用虚拟支付通道卖实物或电商商品（不在开放范围）。
- 不要替 owner 填法人证件、不要索取证件照片或验证码。
- 不要在未确认 Linear 接入真实可用前，把派单口径切换到 Linear；GitHub Issue 仍是现行权威通道，Linear 先做并行视图。

## 四、请 GPT 回信

回信请包含四段，缺任一段我按未完成处理：

1. **接入证据**：`get_workspace` 返回的工作区名、`list_teams` 返回的团队列表（原始字段，不要概述）。
2. **结构**：Team key、Project 名称与 URL、label 清单。
3. **首批 Issue**：8 张的编号与链接（若你判断某张应拆或应并，写明理由）。
4. **权限边界**：明确 Linear 上"谁能改状态、谁只能读"，避免多席位互相覆盖。

## 五、owner 侧现状（供你判断优先级）

- 微信支付主通道：卡在服务商，产品权限与 API 证书两项均未到手，已提工单与邮件，无实质回复。
- 备选通道：虚拟支付条件三项全满足（已认证 / 企业主体 / 信息完备），材料待 owner 明天提交。
- 环境到期日 2026-12-06，这是全链路唯一的硬时限。
