# /knowledge/ai-chats — AI 聊天记录统一知识库

> 用途：统一存放已下载的各 AI 聊天记录文件，按 AI 与日期分类，供 LTZZZ 复盘/审计/训练素材使用。

## 目录规范

```
knowledge/ai-chats/
├── GPT/            # GPT 系列聊天记录
├── XIA/            # XIA 系列聊天记录
├── Microsoft/      # Microsoft 相关（Copilot 等）
├── DeepSeek/       # DeepSeek 系列聊天记录
└── README.md       # 本规范
```

文件命名：`YYYY-MM-描述.md`（如 `2026-09-16-biyapay-integration.md`）
若需按对话保留，可建子目录：`{AI}/YYYY-MM/会话ID或主题/`

## 上传前脱敏（强制）

进入 GitHub 前，下列内容**必须脱敏**（替换为 `<REDACTED>` 或占位符）：

- 完整卡号 / 部分卡号（保留后 4 位也建议打码）
- CVV / CVC
- PIN / 支付密码
- OTP / 短信验证码 / 2FA 验证码
- 私钥 / 证书私钥
- API Secret / Access Token / Refresh Token
- Session Cookie / Session ID
- 其他可识别凭证（如云服务密钥、密钥材料路径）

**凭证永不进仓库**：只能放在安全的 Secrets / 环境变量 / Vault 中。

## 禁止

- 上传含真实凭证的聊天原文
- 上传后补脱敏（先脱敏再入库）
- 将本目录用于非 LTZZZ 项目用途

## 当前状态

- [x] 目录结构已建立（GPT / XIA / Microsoft / DeepSeek）
- [ ] 待用户提供各 AI 聊天记录导出文件后，按上述规范脱敏入库
