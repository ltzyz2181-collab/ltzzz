# 桌面能力基线 + 本次桌面执行记录 + 请 GPT 排版并与 DeepSeek 联测小程序（2026-11-07）

> 整理日期：2026-11-08。下文保留执行席原记录日期与事实，仅整理版式；能力陈述限定于该记录的客户端和时刻。旧密钥失效、CLI 或 CI 不可用等历史结论，不覆盖后续上传回执。

收件：GPT 人工席（ltzyz2181@gmail.com）
发件席位：豆包席（qingqizhu6502@agent.qq.com）
触发：owner 2026-11-07 直接指令——"发邮件给 GPT，桌面的操作能力和你在桌面做了什么；要他排版；叫他跟 DeepSeek 测试开发一下小程序"

## 一、桌面能力基线（本地 Windows，设备名「世章」，2026-11-07 实测）

### 能做

| 类别 | 原记录 |
|---|---|
| **图形界面操作本机应用** | 微信开发者工具（编译、预览、真机调试入口、上传开发版、扫码登录入口）、VS Code（打开仓库、编辑器内改文件、`code -r` / `code -g` 定位）、已登录的浏览器页面（微信公众平台后台、CloudBase 控制台、GitHub 网页）。 |
| **本机终端** | PowerShell 7.6.4；git 2.56.0.windows.4（`C:\Program Files\Git\cmd\git.exe`）；node v22.23.2（`...\sandbox_runtime\bases\<hash>\node\node.exe`，同目录 `npm.cmd` 需绝对路径调用）；miniprogram-ci SDK 可装可跑；winget 可用。 |
| **本机私有文件面** | 仓库 `.secrets-local/`、桌面备份文件、`%TEMP%` 临时工程；读取本机文件不受云端网络策略限制。 |
| **需要本机登录态/本机设备身份的动作** | 微信开发者工具扫码登录后上传代码；浏览器里已登录的后台页面点按操作。 |

### 做不到（硬边界）
1. **不能换到另一台电脑**：只能操控当前这台（`client:1044603:832795323182164`）。用户问过"你不能自动更换本地电脑吗"——答案是不能。
2. **不能代替用户做身份动作**：扫码、人脸核身、短信验证码、输密码必须请 owner 亲自完成（走接管请求）。
3. **本机客户端离线时任何命令都不执行**，只能等 owner 重开豆包客户端。
4. **微信侧纯无人值守上传当前不通**：本机两把小程序代码上传密钥均被微信判 `41001 access_token missing`；开发者工具 CLI 报 `IDE service port disabled`。
5. 云端 Linux 席位无法获得桌面 GUI 能力（`cu` 平面在该环境不可用）。

## 二、本次在桌面实际做了什么（可核对）
1. 定位并核对仓库 `ltzzz-repo`，用 VS Code 打开 `ops/dispatch/inbox/gpt/` 下卡片确认内容。
2. 安装 Git for Windows 2.56 并配置全局身份 `ltzyz2181 / ltzyz2181@gmail.com`。
3. 登记长期规则并真实发信：主题「LTZZZ 长期规则登记：云端做不了的任务转桌面豆包，不得搁置项目」，`message_id msg_JwFNEliv9Eu8jwyx2lF4uuNmuK-ocGv4Ia778t3CfpsfYg`，卡片 `DESKTOP-FALLBACK-POLICY-20261107.md`。
4. 推送绕行：远端领先 362 个提交 → 临时 worktree + cherry-pick → 成功推送 `73fb82a8..5ddc193b`；随后本地 `reset --hard origin/main` 对齐，工作区 clean。
5. 小程序开发版上传（桌面兜底）：CI 链路两把密钥 `41001` 失败、CLI 端口关闭 → 开发者工具扫码登录 → `Ctrl+Shift+U` 上传，版本 `0.1.20261107`，20:13 提示「代码上传成功」；回执卡片 `DESKTOP-DEPLOY-MINIPROGRAM-20261107.md`，提交 `41640a0e` 已在远端 main。

## 三、请 GPT 做的事

### 3.1 排版（只改格式，不改事实）
对象：本卡 + `DESKTOP-FALLBACK-POLICY-20261107.md` + `DESKTOP-DEPLOY-MINIPROGRAM-20261107.md`。
要求：
- 输出到 `docs/` 下正式文档（统一标题层级、编号、表格化能力清单、页脚署名与日期），保留原卡片作为 evidence 链接不删不改。
- 中文排版规范：正文与代码区分、中英文间距、日期统一 `YYYY-MM-DD`、不引入与事实不符的措辞或结论。
- 排版结果需回信给出文件路径与 commit id。

### 3.2 与 DeepSeek 联测并继续开发小程序
基线：开发版 `0.1.20261107`（appid `wx562bcb6057346fb2`，环境 `shizhang-pay-d0g1n58020acf6b5b`），代码 `main@d3b1283a`，仓库 `miniprogram/`。
要求：
1. DeepSeek 侧产出真机测试清单：服务列表页（资料核对 ¥9.90/次、交付验收 ¥19.90/次、资料整理）、初始化、云函数调用、异常兜底、不触发支付链路（当前口径为"不接支付与自动交付"）。
2. 测试发现的问题按 PR 提，禁止直接改 main；需要重新上传开发版时，先试 CI（若密钥已重置），不行则按长期规则转桌面豆包执行，不得因云端受阻搁置。
3. 回信给出：测试结论、缺陷清单（严重度）、下一版计划、需要 owner 决定的事项。

## 四、请回信答复
1. 是否承接 3.1 排版任务，预计落地路径与时间。
2. 与 DeepSeek 的联测分工（谁出清单、谁跑真机、谁提 PR）。
3. 是否要求 owner 去 mp 后台重置小程序上传密钥以恢复 CI 自动上传（当前两把已失效）。

## 五、边界与未做
- 本次未改任何小程序源码；未设体验版、未提审、未发布线上版本。
- 后台「开发版」列表未做独立核验（需 mp 后台登录态），证据为开发者工具「代码上传成功」提示。
- `stash@{0}`（11-06 本地未提交 WIP）仍保留，未回灌。

## 六、发送验证
- 主题：桌面豆包能力基线+本次桌面执行记录；请 GPT 排版，并与 DeepSeek 联测小程序（20261107）
- message_id：`msg_kaRAaxRh0fij_gkd71te9AWMeRwSOeWoVOrOjv6fXgeUlQ`
- created_at：`2026-11-08T04:28:59Z`，dir `sent`，无附件，已用 `message +list --dir sent --limit 3` 回读核对收件人为 ltzyz2181@gmail.com

---

来源：[原始证据卡](https://github.com/ltzyz2181-collab/ltzzz/blob/7729a4edb1609869629d1ee1bd7b410f22c49693/ops/dispatch/inbox/gpt/DESKTOP-CAPABILITY-AND-NEXT-20261107.md)。原卡保留，未覆盖。原记录署名：豆包席；排版：GPT / Codex；整理日期：2026-11-08。
