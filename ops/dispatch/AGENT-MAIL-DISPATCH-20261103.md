# 腾讯 Agent Mail 邮件派单接入（AGENT-MAIL-DISPATCH-20261103）

- 建单：owner 消息（2026-11-03，cron 触发执行段）
- 执行席：豆包（本云 VM 执行席）
- 关联：qingqizhu6502@agent.qq.com（绑豆包）、sgii7122@agent.qq.com（绑 WorkBuddy）、ltzyz2181@gmail.com（=GPT）

## 用户原始指令（拆解）

1. `sgii7122@agent.qq.com 已绑定 WorkBuddy—— 是发给它 就是发给他`：该邮箱已绑 WorkBuddy 席，邮件发往该地址即派单给 WorkBuddy。
2. `还发给gpt ltzyz21813gmail.com 叫gpt`：还发往 GPT 席（ltzyz2181@gmail.com，即「gpt」）。
3. `也可以用邮件给你和 WorkBuddy 派单`：owner 可经邮件向豆包席与 WorkBuddy 席派单。
4. `还有叫gpt 删除一些邮件`：GPT 侧删除部分邮件（GPT 席动作，豆包无 Gmail 登录态、不代操作）。
5. `设置你和WorkBuddy 派单 邮件目录`：设置豆包席与 WorkBuddy 席的派单邮件目录（收件落盘目录映射）。
6. `页面已过期，请在 Agent 对话中输入「重新获取登录链接」`：重新生成 Agent Mail 授权链接。

## 现状核实（2026-11-03 09:5x CST）

- 本机 agently-cli v1.0.18 已装（`/home/user/.npm-global/bin/agently-cli`）。
- `agently-cli +me` → `authorization required`：本机豆包邮箱尚未授权（上次链接未完成扫码或已过期）。
- 授权链接已重新生成（2026-11-03）：
  `https://agent.qq.com/page/oauth?oauth_type=device&user_code=uc_OS1KO41tTLKoPTbEj2SdpAAA`
  （等待 owner 微信扫码；扫码完成后 `auth login` 自动退出，再以 `+me` 验证。）
- 派单收件目录已存在：`ops/dispatch/inbox/doubao/`、`ops/dispatch/inbox/workbuddy/`、`ops/dispatch/inbox/gpt/`。

## 派单邮件目录映射（本单约定）

| 席位 | 邮箱地址 | 仓库派单收件目录 | 状态 |
|---|---|---|---|
| 豆包（本席） | qingqizhu6502@agent.qq.com | ops/dispatch/inbox/doubao/ | 本机待扫码授权 |
| WorkBuddy（微信办公席） | sgii7122@agent.qq.com | ops/dispatch/inbox/workbuddy/ | owner 确认已绑定 |
| GPT | ltzyz2181@gmail.com | ops/dispatch/inbox/gpt/ | owner 确认即「gpt」 |

规则：各席邮箱收到的派单邮件，处理回执落对应 inbox 目录；互派测试以真实发送+回读为准（health/送达页面不足以作为回执）。

## 动作清单

- [x] 重新生成 Agent Mail 授权链接（页面过期处理，链接见上）。
- [ ] owner 微信扫码 → `agently-cli +me` 验证本机豆包邮箱授权 → 实测两邮箱互派任务并回读（待扫码）。
- [x] 派单邮件目录确认就位 + 映射文档落库（本文件）。
- [ ] GPT 删除部分邮件：GPT 席侧执行（本席无 Gmail 登录态，不代操作；转 GPT 跟进）。

## 记账

- paid=false、tx_hash=null、income=0；无资金/密钥/钱包动作。
- 本轮仅授权链路与配置落库，无模型调用（provider=null、model=null）。
- 授权绑定完成与否以 `+me` 真实回读为准，不臆造。
