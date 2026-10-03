# X 推广预检回执 · 2026-10-03

**结果：BLOCKED；本次没有向 X 发出私信或推文，也没有产生推广费用。** GitHub Actions 预检任务本身成功运行并写入 JSON 回执，但它只做账号查询；由于运行环境拿不到 `X_USER_ACCESS_TOKEN`，预检在任何 X API 请求前停止。三项动作均为 `not_run`，无消息 ID。

## 本次核验

| 项目 | 结果 |
|---|---|
| 用户授权的任务 | 2 条英文 DM（`@DeshkaAi`、`@metaeklim`）+ 1 条案例推文 |
| GitHub Actions 预检 | 三次只读预检均成功运行；[最新运行记录](https://github.com/ltzyz2181-collab/ltzzz/actions/runs/37083510668)的任务结果仍为 `blocked` |
| 预检结果 | 三次均为 `token_present=false`；两个目标均未查询；DM 与推文均 `not_run` |
| X Poster Worker | `/health` 返回 `ok=true`，其 X consumer/access/tokenSecret 配置布尔值均为 true；实际 `/tweet` 仍要求独立的 `LTZZZ_AGENT_TOKEN`，本次未发 POST |
| DM 通道 | 仓库已有的 `x-bot-worker.js` 使用 `X_BEARER_TOKEN`；X 官方文档要求 DM 使用用户上下文认证，不支持 App-Only，并要求 OAuth 2.0 的 `dm.write`、`dm.read`、`tweet.read`、`users.read` |
| 花费 | 0；没有购买 API 额度，没有对外发送 |

## 替代通道核查（2026-10-03 UTC）

My Browser 曾成功显示 LTZZZ 的 X 已登录首页，但随后主页/时间线检查连续超时。`@DeshkaAi` 的公开资料与本次获批 DM 的对象相符，但该资料页返回登录/公开视图，没有可用的认证 DM 控件；未打开 DM 编辑器、未点击发送。由于浏览器随后无响应，未继续检查 `@metaeklim` 或发布推文。三项动作仍全部为 `not_run`。

当前设备列表只有 Sandbox；沙盒用户上传、下载和文档目录没有发现手机密钥文件；进程环境没有 X/Twitter/LTZZZ 凭证变量名。GitHub Secret 名称列表请求返回 HTTP 403，因权限不足无法查看名称；没有读取或输出任何密钥值。没有花费。

**恢复条件：** 后续取得稳定可操作的 My Browser 会话、可用的受支持 X 用户令牌，或可访问的 LTZZZ 手机密钥文件后，先按原流程预检，再使用已批准文案；不需要在聊天中粘贴密钥。

## 文案事实与平台限制

BaseScan 公开记录确认交易 `0xead753…bf117` 成功，区块 `52063278`，发生 1 USDC 转账。但项目账本把收款地址描述为可回收的测试/结算地址；BaseScan 交易本身只是 ERC-20 转账，不含推理文本。因此原稿中的“外部真实支出”及“推理附在链上”容易让读者误解，修订稿改成可验证的“Base 上的 AI 工作流实验、公开转账与任务记录”，不声称推理数据写在链上，也不声称这是一笔不可回收的外部付款。

原案例推文正文为 302 字符；附上订单要求的 Gumroad 链接后为 337 字符。现有 Poster Worker 会截断到 280 字符。经缩短并保留商品链接的候选文本为 261 个码点，X 链接计长估算为 255/280：

> LTZZZ logged an AI-work experiment on Base: Grok commissioned Doubao to draft outreach; a 1 USDC transfer and task record are public. Six agents, one loop: propose → policy-check → spend → record → reputation. Follow the build: https://ltzyz.gumroad.com/l/ugyhy

两条经事实校准的 DM 草稿和这条推文保存在 [`data/tasks/x-promo-2026-10-03.json`](../../data/tasks/x-promo-2026-10-03.json)。用户已于 2026-10-03 00:43:55 UTC 明确批准这组三条修订文案；载荷标记为 `approved_by_owner`。当前仍因 `X_USER_ACCESS_TOKEN` 缺失而 BLOCKED。

## 解堵条件

1. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 配置 `X_USER_ACCESS_TOKEN`（不要把令牌贴进聊天）。DM 必须是有 `dm.write`、`dm.read`、`tweet.read`、`users.read` 权限的用户上下文令牌；推文还需要 `tweet.write`。
2. Secret 配置后先用工作流的 `preflight` 模式重新查询目标；它只做读取。修订文案已批准，目标及令牌就绪后即可运行 `send`。该流程为手动触发，不会定时重复私信；已成功项会跳过，未知发送结果不会自动重试。

## 官方与核验来源

- X DM Quickstart：<https://docs.x.com/x-api/direct-messages/manage/quickstart>
- X DM Integration Guide：<https://docs.x.com/x-api/direct-messages/manage/integrate>
- X v2 authentication mapping：<https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping>
- BaseScan 交易：<https://basescan.org/tx/0xead7539e3b6acc8f65c942f856ae84d6440665ebd21e002d340a65096c3bf117>
- 本次自动化回执：[`2026-10-03-x-promo-receipt.json`](2026-10-03-x-promo-receipt.json)
