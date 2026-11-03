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
- **权限修复**：首次扫码授权失败根因=`/home/user/.local/share` 属 root，CLI 无法写入凭据（credential_store_unwritable）；已 `sudo chown user:user /home/user/.local/share` 并预建 `agently-cli` 目录。
- **授权完成（2026-11-03 10:0x CST）**：`agently-cli +me` 返回主地址 `qingqizhu6502@agent.qq.com`（is_primary），scopes=alias:read / mail:delete / mail:read / mail:send；Agent Mail 官方确认信已入 inbox（msg_GnJhu5cjQTdyn_PjSETqEVzjT078f7E5t9-NZw3qMJmorA、msg_ZUZNJJZ5KDC4i83Y6_6t8p_DjlwDpg4MTdM0WdlzxxE5eA，1:56/1:58Z）。
- **互派测试（豆包→WorkBuddy）**：测试邮件已真实发送并回读 sent（msg_d6_3BE5f_Sim07m1Bt-jZBmolZo1Mvm1TPKe8Ys7Nzx5ZA，2026-11-03T01:59:52Z，from=qingqizhu6502@agent.qq.com → to=sgii7122@agent.qq.com，subject=AGENT-MAIL-DISPATCH-20261103-TEST）。WorkBuddy 侧收到/回复待其席回执。
- 派单收件目录已存在：`ops/dispatch/inbox/doubao/`、`ops/dispatch/inbox/workbuddy/`、`ops/dispatch/inbox/gpt/`。

## 派单邮件目录映射（本单约定）

| 席位 | 邮箱地址 | 仓库派单收件目录 | 状态 |
|---|---|---|---|
| 豆包（本席） | qingqizhu6502@agent.qq.com | ops/dispatch/inbox/doubao/ | 已授权（+me 回读通过） |
| WorkBuddy（微信办公席） | sgii7122@agent.qq.com | ops/dispatch/inbox/workbuddy/ | owner 确认已绑定；豆包→WorkBuddy 测试信已发 |
| GPT | ltzyz2181@gmail.com | ops/dispatch/inbox/gpt/ | owner 确认即「gpt」；删邮件待 GPT 侧执行 |

规则：各席邮箱收到的派单邮件，处理回执落对应 inbox 目录；互派测试以真实发送+回读为准（health/送达页面不足以作为回执）。

## 动作清单

- [x] 重新生成 Agent Mail 授权链接（页面过期处理；先后生成 uc_OS1KO41…、uc_bgt7VYXn…，第二次扫码成功）。
- [x] 修复本机 CLI 凭据存储目录权限（root→user），扫码授权成功（+me 回读通过）。
- [x] 派单邮件目录确认就位 + 映射文档落库（本文件）。
- [x] 互派实测（豆包→WorkBuddy）：测试邮件已发送并回读 sent（msg_d6_3BE5f…）。
- [ ] WorkBuddy→豆包 方向互派：待 WorkBuddy 席发信回执。
- [ ] GPT 删除部分邮件：GPT 席侧执行（本席无 Gmail 登录态，不代操作；转 GPT 跟进）。

## 记账

- paid=false、tx_hash=null、income=0；无资金/密钥/钱包动作。
- 本轮仅授权链路与配置落库，无模型调用（provider=null、model=null）。
- 授权绑定完成与否以 `+me` 真实回读为准，不臆造。
