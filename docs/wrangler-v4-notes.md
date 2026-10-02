# Wrangler v4 部署备忘（2026-10-01 固化 · 豆包实测）

> 来源：2026-10-01 DeepSeek/GPT/Kimi/XAI 槽位部署实测。踩坑记录，防再犯。

## 1. 语法变更（v3 → v4 关键差异）

| 操作 | v3 写法 | v4 正确写法 |
|---|---|---|
| 部署 | `wrangler deploy --name X --main file.js` | ❌ 不识别 `--main`（报 `Unknown argument: main`） |
| 部署 | — | ✅ **推荐**：`npx wrangler deploy --config wrangler.xxx.toml` |
| 部署（无 toml） | — | ✅ `npx wrangler deploy file.js`（位置参数） |
| Secret | `wrangler secret put K --name X` | ✅ 不变（`--name` 仍支持） |
| Secret 传值 | 交互输入 | ✅ `$key \| npx wrangler secret put K --name X`（管道免交互） |
| Cron | `--crons` / `--file` | ❌ 不存在；✅ 写 toml `[triggers] crons = ["0 9 * * *"]` |

## 2. toml 最小模板（Worker 槽位标准）

```toml
name = "ltzzz-xxx-proxy"
main = "xxx-proxy-worker.js"
compatibility_date = "2026-10-01"

[vars]
# 非敏感变量放这里（如模型 base_url）；敏感 key 一律走 secret
# KIMI_BASE_URL = "https://api.moonshot.ai/v1/chat/completions"
```

- `[vars]` 是明文变量（可入库）；API key 等敏感值**必须** `wrangler secret put`，永不入库。
- 部署后验证：`GET https://<name>.ltzyz2181.workers.dev/health`（各 proxy 统一返回 ok/has_key）。

## 3. Secret 注入流程（值不进对话/仓库/回执）

```powershell
# 从 Key.doc 提取（二进制 UTF-16 + ASCII 双通道扫描，取 unique）
$bytes = [IO.File]::ReadAllBytes("C:\Users\李天柱\Desktop\Key.doc")
$all = [Text.Encoding]::Unicode.GetString($bytes) + "`n" + [Text.Encoding]::ASCII.GetString($bytes)
$key = [regex]::Match($all, 'sk-proj-[A-Za-z0-9_\-\.]{20,}').Value.Trim()
# 管道注入（不在命令行明文显示；临时文件用完即删）
$key | npx wrangler secret put OPENAI_API_KEY --name ltzzz-gpt-proxy
```

## 4. UTF-8 注意事项（PowerShell 实测）

- **写文件**：中文必须 UTF-8 无 BOM：`[IO.File]::WriteAllText($p, $s, (New-Object Text.UTF8Encoding $false))`。
  `Out-File -Encoding utf8` 在 PS5.1 写 **带 BOM**，部分工具（JSON 解析器）会报错。
- **读文件**：`Get-Content` 默认按 ANSI 读，中文会乱码（如 transactions.json 的“绗_”乱码）。
  用 `[IO.File]::ReadAllText($p)`（自动按 BOM 判断）或显式 `-Encoding utf8`。
- **git commit message 用英文**：PowerShell 传中文给 git 会变乱码；提交体用 ASCII。
- **git 警告** `LF will be replaced by CRLF` 是正常提示（core.autocrlf），不是错误。
- **push 被拒** `fetch first`：先 `git pull origin main` 合并远端（多 AI 协作常有），再 push。

## 5. 已验证 Worker 槽位（2026-10-01 状态）

| Worker | 路径 | 状态 |
|---|---|---|
| ltzzz-deepseek-proxy | POST /（messages） | ✅ live（deepseek-flash） |
| ltzzz-gpt-proxy | POST /chat | ✅ live（gpt-4o-mini） |
| ltzzz-kimi-proxy | POST /（messages，KIMI_BASE_URL=moonshot.ai） | ⚠️ 429 限流（key 有效） |
| ltzzz-xai-proxy | POST /（messages） | ✅ live（grok-4.3） |
