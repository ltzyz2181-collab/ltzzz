# 原厂各 AI / 云端席位：Linear 部署路线（2026-11-09）

配套文件：`LINEAR-ACCESS-STANDARD-20261109.md`（v2，豆包席实测 + 分席清单）
本卡回答一个更具体的问题：**不同厂商的 AI 席位（桌面客户端 / 云端 agent / 纯脚本容器），各自该怎么把 Linear 接上，且不给它写权限。**

取证时间：2026-11-09T03:23Z（UTC）。官方依据：Linear 官方文档 MCP server（页面更新日期 2026-03-03 之后的 2026-11-03 版本）与 Linear Changelog。

---

## 一、先分类：席位只有三种，路线只有三套

| 类型 | 典型席位 | 路线 | 要不要 key |
|---|---|---|---|
| T1 客户端有连接器市场 | 豆包客户端、Claude 桌面 / 企业版、Cursor 应用、v0 | 在客户端里装 Linear 连接器，走 OAuth | **不要** |
| T2 客户端支持远程 MCP、但没市场 | Claude Code、Codex CLI、VS Code、Windsurf、Zed、fx | 加一条 MCP 配置，指向只读端点，走 OAuth | **不要** |
| T3 纯脚本 / 容器 / 无 MCP 能力 | 我们云主机上的 harness、cron consumer、gh 脚本 | T3a 用 bearer token 直连只读端点；T3b 不直连，继续走 GitHub repo 镜像 | T3a 要，T3b 不要 |

**结论先说**：绝大多数"原厂 AI"其实落在 T1/T2，走 OAuth，不需要建 key。只有 T3a 那批自建脚本席位才需要凭据。

---

## 二、官方给了两个端点，其中一个结构上不能写

| 端点 | 能力 | 适用 |
|---|---|---|
| `https://mcp.linear.app/mcp` | 默认读写 | 只给确认需要写的席位 |
| `https://mcp.linear.app/mcp/readonly` | **只暴露读工具**，服务端层面没有写工具 | 所有只读席位（推荐） |

另有一条：用 `/mcp` 但 OAuth 只申请 `read` scope，token 层就够不到写 API。
授权方式：OAuth 2.1（动态客户端注册），或直接带 bearer token / Linear API key（官方 FAQ）。

**我们一律用 `/readonly`**：不是靠"约定别写"，是服务端根本没给写工具，比口令约束硬。

---

## 三、原厂逐家落地（照抄官方文档，逐条可执行）

**Claude（网页版 Team / Enterprise）**
进 Connectors 页 → 连接 Linear。管理员可开 MCP 企业托管认证（Okta），成员免二次登录。

**Claude（桌面版 Free / Pro）**
Settings → Connectors → 添加 Linear 连接器。

**Claude Code（CLI）**
```
claude mcp add --transport http linear-server https://mcp.linear.app/mcp/readonly
```
装完在会话里跑 `/mcp` 走一次授权。

**Codex（CLI / IDE 扩展共用配置）**
```
codex mcp add linear --url https://mcp.linear.app/mcp/readonly
```
首次用 MCP 需在 `~/.codex/config.toml` 加：
```
[features]
experimental_use_rmcp_client = true
```
然后 `codex mcp login linear`。

**Cursor**
MCP tools 页搜 `Linear`，点 Add to Cursor（安装后把 URL 改成 `/readonly` 版本）。

**VS Code / Windsurf / Zed**
配置里写：
```
npx -y mcp-remote https://mcp.linear.app/mcp/readonly
```
（VS Code 走 `MCP: Add Server` → Command (stdio)；Windsurf 走 Add Server → Add custom server；Zed 写 `context_servers`。）

**fx**
```
/mcp add linear https://mcp.linear.app/mcp/readonly
/mcp login linear
```

**其他任何支持远程 MCP 的客户端**（含各厂商自研 agent）：
能直接填 URL 就填 `https://mcp.linear.app/mcp/readonly`；只支持本地 stdio 的老客户端用 `npx -y mcp-remote <URL>` 做兼容层。

**不支持 MCP 的云端席位（T3b）**：
不接 Linear，继续读 GitHub 仓库镜像 + 回执，由能连的席位代读写。这条现在就在用（`LTZ-8` 描述里"仅作协调镜像"就是这个口径）。

**T3a（必须直连的自建脚本席位）**
需要凭据，两个选项，按强度排序：
1. 建一个 **只用于该席的 Linear 个人 API key**，配给该机环境变量 / 凭据库，请求打到 `/mcp/readonly` 或 `api.linear.app/graphql`；
2. 若工作区支持建 **OAuth 应用**，用 read scope 发 token（比个人 key 更细，可单独吊销，需现场核工作区是否有该入口）。

无论哪种：**一席一把，不共享**（便于单独吊销、单独定位异常）；**永不进 git、永不进邮件、永不进聊天卡片**；只在目标机器的凭据库里。

---

## 四、逐席现状（有证据的才写"已通"）

| 席位 | 类型 | 现状 | 下一步 |
|---|---|---|---|
| 豆包席（本席） | T1 | **已通**，三连齐（见配套卡附录 A） | 无 |
| WorkBuddy 席 | T1 | **未通**（Maton 401、本会话无 Linear 工具） | 客户端启用 Linear 连接器 + owner OAuth |
| Claude / Claude Code / Codex / Cursor | T1 / T2 | 未验证 | 按第三节命令接入，均用 `/readonly` |
| 千问 / DeepSeek / Kimi | 看其 agent 是否支持 MCP：支持→T2；不支持→T3b | 未验证 | 先自检客户端有没有"添加 MCP / 连接器"入口 |
| Grok(XAI) | 未知 | 有 11-08 探针单（旁证） | 由该席说明它当时用的是哪条路线，再对齐到 `/readonly` |
| 我们云主机上的脚本席位 | T3a / T3b | 网络已测通、无凭据 | 定 T3a 或 T3b 后我再配 |

---

## 五、云主机侧本次实测（证明"不通"不是网络问题）

从我们的云主机 `vm` 直接发请求：

| 端点 | 方法 | 结果 |
|---|---|---|
| `https://mcp.linear.app/mcp/readonly` | POST initialize（无 token） | **401**（可达，只差授权） |
| `https://mcp.linear.app/mcp` | POST initialize（无 token） | **401**（可达，只差授权） |
| `https://api.linear.app/graphql` | POST（无 query） | **400**（可达，GraphQL 校验层报错） |

时间 2026-11-09T03:23Z。
含义：云端席位**不存在"连不上 Linear"的问题**；缺的只是凭据。这也说明之前 WorkBuddy 席那份 401 是它走 Maton 网关的 401，不是 Linear 不可达。

---

## 六、还差谁做什么

1. **owner（你）**：给每个 T1/T2 席位点一次 OAuth 授权，账号统一 `ltzyz2181@gmail.com`；全部用 `/readonly` 端点。一次授权长期有效，吊销按客户端独立。
2. **各席自己**：按第三节命令接完后，跑验收三连（`list_teams` → `list_issues` → `get_issue("LTZ-5")`）并贴原始返回。
3. **GPT**：裁决 Q1（是否统一 `/readonly` 为唯一端点）、Q2（写权限三档；建议永久不给写，写入全走 GitHub 回执）。
4. **我**：拿到 T3a/T3b 的决定后配云主机席位；在此之前不建任何 key。

---

## 七、边界

- 本次**没有创建任何 Linear API key**，没有生成 OAuth 应用，没有向任何渠道写入 token。
- 没有替任何席位做授权（授权必须由账号持有人在该客户端点）。
- 没有写 Linear 工单（仍为 0 次写入）。
- 第三节命令照抄官方文档；客户端界面文案可能随版本变化，以现场为准。
