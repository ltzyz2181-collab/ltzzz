# 桌面 Claude Code / WSL 面板：安装、入口与修复

本文件记录一次真实部署里跑通过的做法和踩过的坑。环境为 Windows 11 + Ubuntu-24.04（WSL2），Claude Code 2.1.325，node v22.23.5。

## 1. 为什么用这个组合

- 桌面 Windows 上的 Git Bash 已经坏了（每次启动 `0xC0000142`），跑不了 `node`/`git` 脚本。
- 直接把项目放 `/mnt/c/...` 会因 9p 挂载极慢而超时。
- 结论：**WSL 里放 Linux 克隆，Claude Code 跑在 WSL 远端，桌面只做界面**。

## 2. 安装顺序

1. WSL2 + Ubuntu：`wsl --install -d Ubuntu` 依赖 GitHub 清单会失败，改用官方 rootfs 导入：
   `wsl --import Ubuntu-24.04 <install-dir> <rootfs.tar.gz> --version 2`
2. WSL 内装 node：走 `nodejs.org/dist` 的 tar 包，不要 apt 源里的旧版本。
3. Claude Code：`npm i -g @anthropic-ai/claude-code`（registry.npmjs.org 可达）。
4. VS Code 侧：Windows 上装 Remote-WSL 与 Claude Code 扩展；server 包在 Windows 下好再解压进 WSL，别在 WSL 里直接下载。

## 3. 打开面板

- 命令面板 →「檢視: 切換 Claude Code」。点状态栏图标不会开面板。
- 首次会连点两道信任：VS Code 工作区信任、Claude Code 的 `Trust this folder in Claude Code?`。
- 会话头若显示 `This session is in worktree ...` 且顶部红条说目录不存在，说明面板挂在已废弃的 worktree 上，换目录重开会话。

## 4. 面板交互的坑

| 现象 | 实际做法 |
| --- | --- |
| 点「发送」按钮没反应 | 焦点在输入框内按 Enter |
| 点权限弹窗选项按钮没反应 | 按数字键（1/2/3）再 Enter |
| 粘贴长提示词被截断/丢字 | `cu.set_clipboard` 写剪贴板，再 `Ctrl+V` |
| 改了 `~/.claude` 配置但行为不变 | Claude Code 只在会话启动读配置，`+ New session` |
| 命令返回 `Exit code 1` 就停住 | 让它先读报错再改，别重复同一条命令 |

## 5. 权限与配置基线

- `~/.claude/settings.json`：`permissions.allow` 放只读与构建类命令（node/npm/npx、git status|diff|log|show|branch|add|rev-parse、ls/cat/head/tail/wc/find/grep/rg、timeout/mkdir/cp/sed/sort/diff/tar/jq/which/env/echo），**故意不含 commit/push**；改前备份为 `.bak-before-perms`，权限 600，保留原有 `env`/`modelSettings`（模型中转配置）。
- `~/.claude/CLAUDE.md`：强制中文回复 + 不 commit/push，几十字节即可，别写长文。
- 弹窗决策口径：写文件选 2（本次会话全放行，不写配置）；带 shared 选项的 bash 选 1；只有 Yes/No 的复合命令每次选 1。

## 6. 已试过无效的修复路径

- 最小 PATH 启动、关闭 Defender/管家、脱离作业对象、便携版 Git 2.56.1、重启系统：全部仍 `0xC0000142`。
- `shutdown /r` 被完全访问执行层硬拦，不要重复尝试。
- 线索：卡在 `/etc/post-install/06-windows-files.post`，属半完成的 Git for Windows 升级；正解是补完/重装 Git for Windows，而不是再重启。
- WSL 内 `claude -p` 在 `/mnt/c/...` 上超时属挂载问题，与模型可用性无关。

## 7. 恢复清单

1. 确认 WSL 可用：`wsl -d Ubuntu-24.04 -- bash -lc "node -v && git -v"`。
2. 确认 Linux 克隆干净：`git -C /home/<user>/ltzzz status --porcelain`。
3. 重开面板会话（含信任弹窗）。
4. 第一条消息就写清：只改哪个目录、跑哪条测试、不要 commit/push。
