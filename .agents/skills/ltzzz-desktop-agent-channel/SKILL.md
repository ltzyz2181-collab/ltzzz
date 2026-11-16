---
name: ltzzz-desktop-agent-channel
description: 在 LTZZZ 需要改码但当前席位没有推送能力时使用：借桌面 VS Code 里的 Claude Code（WSL 远端）或 Codex 面板改码与本地测试，再回云主机提交推送并回读 Actions；也用于审查这类面板产出的 wallet/资金类代码、跑对抗探针、跨机搬运打包件、把通道踩坑沉淀回仓库。含权限弹窗判据、中文强制、网络边界与已验证做不通的清单。
---
# LTZZZ 桌面智能体通道

一句话分工：**桌面改码并本地测试，云主机提交推送。** 桌面和 WSL 都连不上 github.com，别在本机反复试 push，也不要把"面板里跑过"当成仓库已交付。

## 0. 动手前先答三件事

- 当前在哪台机器：桌面（Windows，Bash 禁用只能用 PowerShell，`wsl` 可用）还是云主机（`/home/user/ltzzz`，`gh` 已登录）。
- 目标仓库的分支、HEAD、未提交改动属于谁。桌面仓库常有别席位在途改动：不 reset、不 clean、不强推、不 `git checkout .`。
- 这次是只读检查，还是会被推送的写操作。写操作一律以云主机为落点。

## 1. 桌面面板入口

- 命令面板「檢視: 切換 Claude Code」进入；点状态栏图标不算。
- 两道信任都要点掉：VS Code 工作区信任 + Claude Code 自己的 `Trust this folder in Claude Code?`。
- WSL 侧工作目录必须用 Linux 克隆（如 `/home/tianzhu/ltzzz`），不要 `/mnt/c/...`：该挂载上 `git status` 单次 123.83s，`claude -p` 会直接超时；Linux 侧 0.09s。
- 安装与修复细节见 [references/desktop-wsl-claude.md](references/desktop-wsl-claude.md)。

## 2. 权限弹窗按语义选，不按位置选

- `Allow write to *.mjs?`（1 Yes / 2 allow all edits this session / 3 No）→ 选 **2**。一次性放行本次会话，不写配置、不脏仓库。
- `Allow this bash command?` → 若第 2 项是 `... for this project (shared)`，选 **1**；否则会往仓库写 `.claude/settings.json`。
- 只有 `1 Yes / 2 No` 的复合命令（带 `|`、`;`、`echo EXIT=`）→ 每次选 1，这是正常现象，不是配置失败。
- 出现 commit / push 类命令，停手，交给云主机。

交互层两个反直觉点：权限弹窗**按数字键 + Enter**才生效，点选项按钮常无反应；发送消息要在输入框内按 **Enter**，点发送按钮无效。长文本用剪贴板粘贴（`cu.set_clipboard` + `Ctrl+V`）。

## 3. 让它说中文、别碰 git

- `~/.claude/CLAUDE.md` 写明：用中文回复、不执行 commit/push。改前先备份。
- `~/.claude/settings.json` 的 `permissions.allow` 只放读类命令与 node/npm/git 的读子命令，**故意不含 commit/push**；保留原有 `env`/`modelSettings`。
- Claude Code 只在会话启动时读配置，改完必须 `+ New session` 才生效。
- 扩展自带界面文案（`Allow this bash command?`、`Exit code 1`、`Thinking`）不受 CLAUDE.md 影响，不要试图改。

## 4. 网络边界（勿重复试）

- 桌面与 WSL：`github.com:443` 不可达。
- WSL 可达：`registry.npmjs.org`、`nodejs.org/dist`、`archive.ubuntu.com`、`api.deepseek.com`、`marketplace.visualstudio.com`。
- 因此 push、Actions 回读、`gh api` 一律在云主机做。
- 跨机搬文件：桌面打包 → `FileBatchUpload` 拿 URL → 云主机 `curl -O` 解包。

## 5. 审查面板产出的资金类代码

- 独立复跑，不采信面板自述：`node --test <dir>`、`node <entry> --json`。
- 用自写对抗探针打边界，不用"看起来对"代替验收。判据、探针矩阵与已知缺口见 [references/wallet-code-review.md](references/wallet-code-review.md)。
- 发现能自洽注入或绕过白名单的洞，补在**校验点**（normalize/whitelist），不在调用点；补完加一条回归测试，再复跑全量。
- 不要因为代码里已有只读断言就跳过探针：断言拦得住写型 RPC，拦不住事件字段注入。

## 6. 收尾与交付

- 云仓库先 `git merge --ff-only origin/main` 对齐，再落文件；只快进，不覆盖他人提交。
- 提交信息写清范围、测试结果；推送后回读 `gh api repos/<org>/<repo>/contents/<path>?ref=main` 与 `gh run list --json name,status,conclusion,headSha`，确认推上去的是打过补丁的版本。
- 资金红线：不创建真实账本文件、不动真实资金、钱包配置只只读取 `address`。
- 报告按状态分层：本地通过 / 已提交 / 已推送 / CI 通过 / 远端可读，每项给证据（commit、run id、文件数）。

## 7. 已验证做不通（别再花时间）

- Windows Git Bash fork 全路径失败 `0xC0000142`：最小 PATH、关 Defender、排除管家、脱离作业对象、便携版 Git、重启系统都不解决；根因指向半完成的 Git for Windows 升级（卡在 `/etc/post-install/06-windows-files.post`）。
- `wsl --install -d Ubuntu` 拉 GitHub 清单必失败，只能官方 rootfs 导入。
- WSL 内直接下载 VS Code server 失败，必须 Windows 下载后解包进 WSL。
- 新版 VS Code agent-host 的 Claude provider 报 `SDK not downloaded yet`，与面板本身无关。
- `miniprogram-capability.test.mjs:7` payEnabled 期望 false 实际 true 属预存在失败，不要当回归。

## 8. 把经验写回仓库

- 技能放 `.agents/skills/<name>/`，本仓库既有约定是同时在 `.claude/skills/` 放同名副本。
- `SKILL.md` frontmatter 只写 `name` + `description`，触发条件全部写进 description；正文用祈使句，不建 README/CHANGELOG 等冗余文件，细节放 `references/`。
- 与 `ltzzz-task-execution` 互补不重复：那个是接单交付契约，本技能是通道操作与审查经验。
