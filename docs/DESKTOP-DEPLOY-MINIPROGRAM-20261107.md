# 桌面兜底部署回执：小程序开发版上传（2026-11-07）

> 整理日期：2026-11-08。下文保留执行席原记录日期与事实，仅整理版式；能力陈述限定于该记录的客户端和时刻。旧密钥失效、CLI 或 CI 不可用等历史结论，不覆盖后续上传回执。

## 结论
- 结果：**成功**。微信开发者工具（本地 Windows 桌面）在 2026-11-07 20:13 提示「代码上传成功」。
- 版本号：`0.1.20261107`
- 项目：`miniprogram/`，appid `wx562bcb6057346fb2`，云端环境 `shizhang-pay-d0g1n58020acf6b5b`
- 代码基线：本地仓库 main == 远端 main == `5ddc193b`（推送前 clean）
- 上传时备注：`LTZZZ 数字实验室服务展示：资料核对/交付验收/资料整理；不接支付与自动交付。main@5ddc193b 桌面兜底上传 2026-11-07`

## 为什么必须走桌面（云端做不到的证据）
1. `scripts/miniprogram-upload.mjs`（CI 同款 miniprogram-ci 链路）在本机跑通到上传请求阶段，但微信服务端拒绝：
   - 密钥 A（`.secrets-local/wechat-miniprogram-upload-key-wx562bcb6057346fb2.pem`）→ `[error] 20003 ... errMsg: inner get attr fail with errcode: 41001, errmsg: access_token missing`
   - 密钥 B（`.secrets-local/wechat-miniprogram-upload-key.pem`）→ 同一 `41001 access_token missing`
   - 即：本机保存的两把「小程序代码上传密钥」均已被微信侧判定失效（不是 IP 白名单问题，回执里 `observed_ips` 为空）。
2. `cli.bat upload` 两次报 `IDE service port disabled / 工具的服务端口已关闭`；管道喂 `y` 不生效（CLI 需要 TTY，退出码仍为 0）。
3. 微信开发者工具当时处于**游客模式（未登录）**，图形界面与 CLI 上传都缺登录态。

## 实际解决路径
1. 在开发者工具右上角账号面板由 owner 用手机微信扫码登录（本次已由 owner 亲自扫码完成）。
2. 用快捷键 `Ctrl+Shift+U` 走「上传」（点顶部图标存在命中偏差，"预览"按钮与"上传"按钮相邻）。
3. 弹出「上次提交已被选为体验版，本次上传将会覆盖体验版」→ 确定。
4. 填版本号 `0.1.20261107` + 项目备注（见上），点「上传」→ 20:13 提示「代码上传成功」。

## 未做的事 / 边界
- 未重新生成上传密钥：需 owner 登录 mp.weixin.qq.com 在「开发管理 → 开发设置 → 小程序代码上传密钥」重置；重置后需同步更新 GitHub Secrets 的 `MINI_UPLOAD_KEY`，CI 才能恢复自动上传。
- 未设置体验版、未提交审核、未发布线上版本。
- 未改动任何小程序代码；本次仅上传既有 `main@5ddc193b`。
- 本机新增临时依赖：`%TEMP%\mini-ci`（miniprogram-ci SDK，供 CLI 链路使用，可删）。
- 未改动开发者工具的任何设置项（服务端口仍为关闭状态）。

## 对长期规则的落地
本条回执即「云端部署不了 → 转桌面豆包执行」规则的第一次实际执行记录（规则正文见 `DESKTOP-FALLBACK-POLICY-20261107.md`，邮件 msg_id `msg_JwFNEliv9Eu8jwyx2lF4uuNmuK-ocGv4Ia778t3CfpsfYg`）。

---

来源：[原始证据卡](https://github.com/ltzyz2181-collab/ltzzz/blob/7729a4edb1609869629d1ee1bd7b410f22c49693/ops/dispatch/inbox/gpt/DESKTOP-DEPLOY-MINIPROGRAM-20261107.md)。原卡保留，未覆盖。原记录署名：豆包席；排版：GPT / Codex；整理日期：2026-11-08。
