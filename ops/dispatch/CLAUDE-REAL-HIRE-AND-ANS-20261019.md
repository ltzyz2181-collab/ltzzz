# Claude 规划席：每日外部雇佣与 ANS 一级任务

类型：实施说明（原规划由 Claude 提出；代码与部署验收由 GPT/Codex 执行，不代签 Claude）。依据 owner 最新授权：ANS 为现阶段一级任务；AI 雇佣 AI 为长期一级任务；每天派一单，无需每日人工触发。代码合并不等于已部署或已付款；实际结果见后述运行回执。

## 每日唯一派单与真钱采购

- 入口：`.github/workflows/daily-external-hire.yml`，每天 UTC 08:50（当前 America/Tijuana 为01:50），以及 WEP3 成功部署后的幂等接续；仓库订单日期沿用 Asia/Shanghai。GitHub 调度可能延迟。
- 每日固定 ID：`REAL-HIRE-YYYYMMDD-CLAUDE-01`。先将派单及输入哈希提交，再调用支付执行器；固定模板代表 Claude 规划角色，不是原生 Claude 客户端定时调用。总控/千问授权执行器均可触发，无需给聊天模型持有私钥。
- 已新增可运行的 `/market/procurement/daily*` 路径，旧 `EXT-AI-20261017-001` 保持原收据和状态，旧采购接口只用于原单复用。不得用旧路径声称创建了新订单。
- 使用现有 Worker 控制的金库，固定第三方、Base 原生 USDC、每笔最多0.05 USDC、每天最多一单。已有客户负债和在途供给仍须保留现金。付款结果不明时只对账，不再次发送带付款签名的请求；不同日期也不能绕过未结清的在途订单。已验收相同 API 输入的交付直接复用，不为了每日次数重复花钱。
- 外部模型请求为 `deepseek/deepseek-chat`，实际模型身份仅有第三方报告。交付后由豆包进行一次实际、异提供商、哈希绑定的工程审核；未配豆包 Key 或缺新鲜健康证据时先不买单。审核请求先在 DO 中登记，未知/失败请求不自动重复计费。
- 直接与 relay 接收共用语义检查：数字 issue ID 可归一化且记录 warning；同时检查 POST、精确 preview 路径、16–100字符 intent ID、supply/withdraw、正十进制字符串金额、有效/错误 `X-Lab-Pin` 占位符、200/401 与测试ID唯一性。结构/语义通过仍不是独立验收，工程审核通过也不是线上 preview 或部署通过。
- 回执：`knowledge/results/claude-team/real-hire-YYYYMMDD.json`，派单：`ops/dispatch/REAL-HIRE-YYYYMMDD-CLAUDE-01.md`。分别记录派单、付费请求尝试、链上付款证据、交付原文/hash、语义结果、实际豆包模型/结束原因/用量、独立审核与最终订单回读。采购付款、豆包 API 用量与内部积分分开记；验收不触发第二次付款。

原单0.003 USDC不再发退款请求，不覆盖 `refund_status=not_verified`。本次 owner 的新派单授权是新增受限采购的依据，不把原单回执改为新单。

## ANS：复用已完成核验，补实际行动证据

早期固定 `ans-closeout.json` 不是最新状态。`knowledge/results/claude-team/deployment-39183352199.json` 已有真实 Actions 运行号、干净源工作区及核验器哈希；其中 DeepSeek 是 `rejected_draft_review`，不是三席都待审。固定核验器无模型调用，不能替代新的豆包复核。无需再次派单“修复已完成的干净核验”。

本次实装：

1. `workers/pulse-worker/feedback.js`：独立 HTTP 连续失败触发实际停派后，记录 `action_taken`；后续独立复测与恢复派单记录 `follow_up_receipt`。同一故障只一个案例；控制器手动暂停不自动清除；共因传感器不可达不伪造多个 AI 故障或扣款。
2. ANS 工程循环的草稿与审核分别记录行动/后续回执，明确 `engineering_draft_only`，仍需来源提供商不同、交付哈希和真实模型完成证据。没有实际补丁执行/测试/部署证明时不升级为上线。
3. 原行动奖惩继续按可重算的独立哈希证据计分，+2/-4/明确接单后逾期等规则不变；网络/余额/缺 Key 不作真钱处罚。新健康反射案例不是模型声誉奖分依据。
4. Claude 可读运行回执、规划和独审；原厂 Claude 无 Key/定时能力时，由规则派单和现有执行器保持运行，明确非原生 Claude 调用。任意模型补丁自动合并部署的通用机制仍未实现，本次部署的是可测试的明确修复。

验收需同时具备 Actions 运行号、部署版本与实际状态回读；涉及模型审核须另外具有作者/复核实际提供商、结束原因、用量、被审交付哈希及审稿实物。运行号加哈希本身不代表模型复核。

## 账户隔离

owner 指定 `0x21F5…7fdc` 为 Claude 团队钱包，`0xd4c3…fd91` 为 ltzzzwep3ops1 的 USDC/Base 欧易子账户地址；这是本人提供的信息，尚无交易所账户绑定回读或签名控制证明。两者分开登记，均不加入本次签名执行器。欧易充值地址不是可导入私钥的 EOA。公开 UID 和 Key 均不入库；无需上传私钥来运行上述流程。

已有真实运行证据：ANS历史核验见 `deployment-39183352199.json`。本次新版本部署、每日采购付款和独审只能根据对应最新 Actions/订单 JSON 判定，不能从本文件推导成功。
