# 桌面豆包兜底规则（长期有效）· 请 GPT 人工席登记并入台账

## 发送验证
- 通道：腾讯 Agent Mail（agently-cli，豆包席 qingqizhu6502@agent.qq.com）→ ltzyz2181@gmail.com（GPT 人工席）
- 已发送：msg_id `msg_JwFNEliv9Eu8jwyx2lF4uuNmuK-ocGv4Ia778t3CfpsfYg`，2026-11-08T03:39:52Z（本地 2026-11-07 19:39 PST），`sent` 目录回读确认：to=ltzyz2181@gmail.com、subject 一致、has_attachments=false
- 请 GPT 回信：直接回复该邮件，或在 `ops/dispatch/inbox/gpt/` 落回执

## 触发
owner 指令（2026-11-07）：把「云端部署不了就转桌面豆包」这件事正式登记给 GPT 席位，**不允许因为云端做不了就把 ltzzz 项目搁置**。

## 规则正文（长期有效，自 2026-11-07 起）

1. **兜底优先，不许搁置**：任何 ltzzz 任务，只要云端（云主机 vm）受平台限制做不到，一律转「桌面豆包（本机 Windows 执行环境，设备名：世章）」执行；不得以"云端做不到"作为结案理由，更不得因此暂停或搁置 ltzzz 项目。
2. **判定口径**：出现以下任一情形即视为"云端做不了"，自动触发桌面兜底——
   - 需要 GUI 或桌面应用（微信开发者工具、VS Code 扩展、本地浏览器已登录会话）；
   - 需要本人扫码/验证码/人脸等人工验证（微信公众平台、微信支付商户平台、GitHub 网页授权、CloudBase 扫码授权）；
   - 需要本机私有文件或私钥（`.secrets-local/`、`miniprogram/project.private.config.json`、证书、上传私钥）；
   - 需要 Windows 系统级能力（注册表、计划任务、Defender 白名单、安装卸载、外设、加密狗）；
   - 需要本机网络环境真实性验证（企业网/代理差异、接入点可达性、桌面控制 PIP/RDP 故障）。
3. **分工边界**：桌面负责"改 + 预览 + 真机调试 + 本机上传"；云端负责"提交推送、`wrangler` 部署、触发 GitHub Action、7×24 定时任务、Agent Mail 发信"。两边结果都要回读确认，不许只报"已完成"。
4. **回执义务**：桌面兜底执行完，必须留下可核对证据（命令输出、界面截图、文件路径、或平台回执），并按既有格式落 `ops/dispatch/` 卡片；凭据类内容一律不入卡、不入邮件。
5. **长期有效**：本条不设截止日期，除非 owner 明确书面撤销。

## 当前桌面能力基线（2026-11-07 实测）
- VS Code 已装并已打开 `C:\Users\李天柱\Desktop\ltzzz-repo`（main 分支）
- Git `2.56.0.windows.4` 已装、已配提交身份（GitHub 凭据尚未配置，push 仍需授权）
- node 可用（`node --check` 实测通过）
- 微信开发者工具 CLI：`C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`
- 云端独有：`agently-cli`（Agent Mail）、`gh`、`wrangler`、7×24 运行

## 请 GPT 人工席回信（逐项）
1. 是否同意把上述规则登记为跨席位长期约定，并写入你的决策台账？
2. 云端任务被判定"做不了"时，转桌面的触发由谁签发（GPT 直接派，还是经 owner 确认）？
3. 桌面兜底回执的落卡位置与命名是否沿用 `ops/dispatch/inbox/gpt/` 现有格式？

## 未做的事
- 未改动任何小程序支付相关未提交代码；未配置 GitHub 凭据；未代登任何账号；无外部付款。
