# 桌面 Codex 接入 DeepSeek：model_provider 落地与实测（2026-11-16）

## 一句话结论

桌面的 Codex 应用已真正把请求发到 DeepSeek（`model_provider = "deepseek"` + `model = "deepseek-flash"`，`wire_api = "responses"` 保留）。改代码与操作电脑两项能力实测通过，可作为「对话部署」的第一档执行器。但 owner 的 key 只服务 `deepseek-flash`，`deepseek-reasoner` / `deepseek-chat` 都会被静默路由到 flash。

## 一、改了什么（可回滚）

配置路径：`C:\Users\李天柱\.codex\config.toml`，Codex CLI `0.167.0-alpha.4.1`。

| 项 | 改前 | 改后 |
|---|---|---|
| 顶层 `model` | `gpt-5.6-sol` | `deepseek-flash` |
| 顶层 `model_provider` | 不存在（等价默认 openai） | `deepseek` |
| `[model_providers.deepseek]` | base_url `https://api.deepseek.com/v1`、wire_api `responses`、requires_openai_auth false | 不变 |

两次备份，回滚任选：
- `config.toml.bak-20261114`（此前状态）
- `config.toml.bak-20261115-165229`（首次切换时）
- `config.toml.bak-20261115-flash`（改 flash 前）

回滚命令：
```
Copy-Item -LiteralPath 'C:\Users\李天柱\.codex\config.toml.bak-20261115-flash' -Destination 'C:\Users\李天柱\.codex\config.toml' -Force
```

## 二、wire_api 保持 responses 的依据

按 `scripts/desktop-codex-provider-fix.py` 的判定口径：只有 404/405 才算「端点不存在」、才可以改协议；401/403 说明端点存在、问题在 key 或余额，配置不动。

实测（POST，`Content-Type: application/json`）：

| 端点 | 结果 |
|---|---|
| `POST /v1/responses` | 200（可用） |
| `POST /v1/chat/completions` | 200（可用） |
| `GET /v1/models` | 200 |
| `GET` 到上述 POST 端点 | 405（方法不允许，不代表端点缺失） |

所以 `wire_api = "responses"` 保留，没有退回 chat。

## 三、必须记住的坑：模型名被静默路由到 flash

同一 key 分别用 `deepseek-reasoner`、`deepseek-chat`、`deepseek-flash` 请求，响应体 `model` 字段一律是 `deepseek-flash`；`deepseek-v3.2` 直接 400。也就是说：

- 请求里写 `deepseek-reasoner` ≠ 真用 reasoner，只会拿到 flash；
- Codex 还会打一条 `Model metadata for <model> not found` 的警告（自定义 provider 的正常现象，不影响运行）；
- 想真正用 reasoner，只能换一个确实开通 reasoner 的 key，或走中转席位；本 key 上做不到。

owner 2026-11-16 决定：**继续用 flash**，因此把 `model` 显式写成 `deepseek-flash`，让配置与真实后端一致。

## 四、实测结果

| 测试 | 命令 / 入口 | 结果 |
|---|---|---|
| 最小对话 | `codex exec`，提示「只回复 FLASH-OK」 | 返回 `FLASH-OK`，provider=deepseek、model=deepseek-flash |
| 改代码 | 在临时目录要求新增 `divide(a,b)` + 写 `test_calc.py` + 自跑测试 | Codex 改 `calc.py`、建 `test_calc.py`、自行 `python test_calc.py` exit 0；10,832 tokens。复核席独立复跑 exit 0 |
| 操作电脑 | 要求 computer-use 截全屏一次、不点击不输入 | 成功，截图 2160×1440、1,003,183 字节，报出窗口标题 `WorkBuddy`、`LTZZZ每日视频自动发布流程 - 豆包工作`；75,834 tokens |

临时目录：`%TEMP%\codex-do-test-20261115`（不污染仓库）。

## 五、能干什么、不能干什么

- 能：读仓库、改文件、跑命令与测试、截屏与操作桌面 GUI、在本机执行 git。
- 不能（本席判定，仍按既有边界）：直接生产写、动支付开关、签名或动 Safe、接触凭据。生产部署走 CI 既定链路，不靠桌面直连。

## 六、部署入口在哪

1. **Codex 桌面对话框**（主入口）：说「改完跑测试，commit 并 push 到 main」，它在本机执行；push 到 main 即触发 GitHub Actions。
2. **GitHub 网页 → Actions → Run workflow**：手动触发。桌面**未安装 `gh`**，命令行手动触发不成立。
3. **真正干活的是 workflow**：`.github/workflows/deploy-agi-pay.yml`、`deploy-agent-pay.yml`、`deploy-econoy.yml`、`deploy-*-worker.yml`、`deploy-relay-proxy.yml` 等。

两个前置坑：
- 桌面仓库当时停在 `feat/order-closure` 且有未提交改动；非 main 分支 push 不会触发 main 的部署。
- 桌面缺 `gh`，PR 与手动触发都只能走网页。

## 七、环境事实（同轮实测）

`$PSVersionTable.PSVersion` 7.6.4；`python` 3.13.18；`git` 在 `C:\Program Files\Git\cmd\git.exe`；`node` 来自 DoubaoWork sandbox runtime；`gh` 不存在；`codex`/`claude` 不在 PATH，codex 实际路径 `%LOCALAPPDATA%\OpenAI\Codex\bin\9e1da79431da526b\codex.exe`。

## 八、还没解决的

1. reasoner 真身：需要另一个开通 reasoner 的 key，或中转席位。
2. 桌面 `gh`：要不要装，决定能不能在桌面直接开 PR / 手动 dispatch。
3. 对照实验：同一任务跑「裸 API / Codex / Claude Code」三次，比成功率、耗时至可运行、改动文件数，目前只有 Codex 一侧数据。
