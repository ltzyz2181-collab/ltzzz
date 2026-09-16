# LTZZZ · 头条对话存档

存放从「今日头条」渠道调取的对话记录（包括今日头条 App 内「豆包 AI」对话、私信等），与 `knowledge/ai-chats/` 同一归档体系。

## 目录规则

- 每个对话一个文件：`YYYYMMDD-<简述>.md`（Markdown 原文存档）+ `YYYYMMDD-<简述>.html`（可浏览页面）
- 页面统一由 `dialogue-archive-template.html` 模板生成
- 源文件只进本目录，原始对话文本保留完整

## 强制脱敏（上传前必须执行）

以下信息一律替换为 `<REDACTED>`，**永不进入 GitHub**：

- 手机号（保留后 4 位可：`138****4321`）
- 邮箱
- 完整卡号 / CVV / PIN / OTP / 支付密码
- 私钥 / API Secret / Session Cookie / 验证码
- 身份证号 / 营业执照注册号
- 地址门牌号
- 支付平台账号 ID

## 操作流程

1. 手机端复制/导出对话内容 → 发给豆包
2. 豆包整理为 Markdown（含元信息：来源渠道、时间范围、对话主题）
3. 脱敏检查 → 写入本目录
4. 用模板生成 HTML 可浏览页
5. `git add + commit + push` → GitHub Pages 自动部署到 ltzzz.com

## 状态

- 2026-09-16：目录与模板建立（等待用户从手机端提供对话内容）
