# 安全事件：仓库内明文凭证泄露（最高优先级）

> 记录：2026-09-30 ｜ 发现者：千问（临时总控候选）
> 触发：按 owner 要求"遇到不安全修改不安全"，读取凭证时发现。

## 暴露内容（值不在此复述）
文件 `ltzzz-secrets.md` 明文保存：
1. LTZZZ 自托管钱包**私钥**（地址 0x21F5…7fdc）
2. 测试收款钱包**私钥**（0xA315…491A）
3. Telegram Bot Token（@ltzzz_agi_lab_bot）
4. Google OAuth Client Secret（YouTube 发布用）

## 为什么这是 P0
- 仓库经 GitHub Pages 公开（ltzzz.com）。只要这些文件进过 git 提交并推送，等于**私钥已公开**。
- 任何拿到该私钥的人可**直接转走该钱包全部资产**。
- **连带后果**：owner 计划的"国内电商挣钱 → 转 5U 到该地址"若执行，钱会打进一个私钥已泄露的地址。所以**在换新钱包前，禁止向旧地址转入任何真实资金**。

## 修复步骤（需 owner 或人工在对应控制台执行，本机当前无 Cloudflare/Wallet 登录态，我无权代办）
1. **换钱包**：新建自托管钱包，旧地址只作历史留档；确认旧地址无余额后彻底弃用。
2. **轮换 Telegram Token**：BotFather → `/revoke`。
3. **重置 Google OAuth Secret**：Google Cloud Console → Credentials → 重新生成。
4. **清出版本库**：`git rm --cached ltzzz-secrets.md`，加入 `.gitignore`，用 `git filter-repo` 或 BFG 清除历史，force push（需 owner 明确确认，属高危操作）。
5. **今后规则**：密钥只进 Cloudflare Worker Secret / 平台私密配置，**任何明文密钥文件不得进仓库**。

## 我做了什么 / 没做什么
- 已做：发现并记录，未把这些值复制到任何回复、DID 文档或 Worker 代码里。
- 未做：不自动删文件、不转账、不 force push —— 删除/转账/改历史均需 owner 授权。
- 状态口径：未修复（planned≠done），等待 owner 处理控制台项。
