# 桌面席位（世章）网络与仓库状态（2026-11-17）

本文件记录桌面 Windows 席位当前实测状态。只描述事实与结论，不改动桌面仓库的既有改动。

## 一、GitHub 出网（第 18 项）

| 端点 | 实测 | 结论 |
| --- | --- | --- |
| `github.com:443`（git https） | `Failed to connect to github.com:443 after 21090 ms` | **不通**，git fetch / git push 全部失败 |
| `github.com` `curl -4` | 000，15s 超时 | 同上 |
| `github.com` `curl -6` | 000，无法解析 | 无可用 IPv6 出口 |
| `api.github.com` | 200 | 通 |
| `raw.githubusercontent.com` | 301（可达） | 通 |
| `codeload.github.com` | 301（可达） | 通 |
| 本机代理 `127.0.0.1:10810` | 端口未监听；`ProxyEnable=0` | 当前没有可用代理 |

结论：**不是 git 配置问题，是 `github.com:443` 这条出口被封**。GitHub 的 API / raw 域名可达，但 git 协议域名不可达，因此桌面上无法直接 fetch / push。
解除方式（任一）：开一个能连 `github.com:443` 的代理并给 git 配 `http.proxy`；或换网络出口；或继续用云主机执行 push。

## 二、推送通道（现状可用方案）

- 云主机（vm）`gh` + `git push` 正常，本日 #399、#400 均由 vm 推送与合并。
- 桌面只做本机实测与编辑；需要推送时由 vm 执行，不依赖桌面出网。
- WSL 侧 `git ls-remote` 本轮实测 `GnuTLS recv error (-110): TLS connection was non-properly terminated`，与桌面同因（出口不通），凭据 helper 已指到 `git-credential-wincred.exe`，**待网络恢复后可直接用**。

## 三、桌面仓库同步（第 19 项）

- 仓库：`C:\Users\李天柱\Desktop\ltzzz-repo`
- 分支：`feat/order-closure`，HEAD `f42e5b33`
- 落后 `origin/main`：**229 个提交**
- 未提交改动：**27 项，全部为未跟踪文件**（`git diff` 为空）：`.agents/skills/ltzzz-desktop-agent-channel/`、`.claude/skills/ltzzz-desktop-agent-channel/`、`.claude/worktrees/`、若干 docs 与截图、`ops/dispatch/inbox/workbuddy/*` 回执、`products/workbuddy/ltzzz-source-check-1.0.2.zip`
- 已做的保护：`C:\Users\李天柱\ltzzz-backup-20261117\` 存了 `HEAD.txt`、`status.txt`、`untracked.txt`、`tracked-changes.patch`
- 未做（也做不了）：fetch / rebase / 切分支 —— 依赖第一节的出口。

恢复出网后的一条命令序列（桌面执行，保留 27 个未跟踪文件不动）：

```powershell
cd C:\Users\李天柱\Desktop\ltzzz-repo
git fetch origin main
git worktree add ..\ltzzz-main origin/main
```

`git worktree add` 不改动 `feat/order-closure` 及其未跟踪文件，另开一个指向 `origin/main` 的工作目录用于当前工作；确认无误后再决定是否把 `feat/order-closure` 归档。
