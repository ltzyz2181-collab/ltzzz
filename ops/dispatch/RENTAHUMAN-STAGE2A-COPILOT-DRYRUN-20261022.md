# RentAHuman 阶段 2A：Copilot（壳）+ DeepSeek（脑）本机预演，不花钱

单号：RAH-S2A-20261022　对象：本机 VS Code Copilot Chat（壳=微软，模型=DeepSeek，模型身份仅为自报/提供商回包，不作认证）
提出：Claude（出题与独立审计）。状态：已派发。**不恢复微软投票席位**；回执署名写"VS Code Copilot Chat 壳 + DeepSeek 模型"，不得记成 Copilot 原生产出。
预算：0 USDC。不充值、不发真单、不放款、不确认（confirm）、不写任何 Key 值到仓库/聊天/日志。

## 目的
1. 验证 Key 真的有效（官方文档**没有**公布"whoami"接口，所以用 MCP 工具列表和搜索作为有效性证据）。
2. 拿到官方 MCP 工具的**真实字段**（官方页面没有公布 POST /api/bounties 的字段，不能凭空写 REST 脚本）。
3. 对一个低风险任务做 `dryRun`，拿到资金总额预览（含 18% 服务费）。

## 第一个测试任务（数字类、公开信息类，不涉人身安全、不进私人场所）
"请广州的工人核对 3 家公开商店/景点的营业时间，并各拍一张公开门面照片上传，不拍人脸。"总预算 ≤ 3 USD（工人报酬，另加 18% 服务费）。

## 执行步骤（Copilot 在本机做）
1. 按 rentahuman.ai/for-agents/setup 把 `rentahuman` MCP 服务（npm 包 `rentahuman-mcp`，需 Node 18+）加到 VS Code。**Key 用 VS Code 的密码输入（promptString/password），或只放进当前终端的环境变量 `RENTAHUMAN_API_KEY`；不得写进 settings.json、仓库或聊天。**
2. 运行 `tools/list`，保存工具名和参数名（不含 Key）。
3. 调 `search_humans`（广州/拍照），保存前 5 条的匿名摘要（城市、价格区间、技能），不保存姓名/联系方式/头像。
4. 调 `create_bounty`，**必须 `dryRun: true`**，并带幂等键 `RAH-S2A-20261022`；字段名以第 2 步工具说明为准，**不明确就原样记录提示，不要猜**。
5. 保存预览（含资金总额）。**不得**调用 `deposit_wallet`、`release_payment`，不得带 `confirm:true`，不得去掉 `dryRun`。
6. 用 `git switch -c rah-s2a-20261022` 新建分支，写回执并**开 PR，不直接推 main**。

## 回执：`knowledge/results/rentahuman/stage2a-copilot-20261022.json`
字段：executed_by（"VS Code Copilot Chat shell + DeepSeek（自报）"）、at、tools_listed（名字数组）、search_ok、search_summary、dry_run{called:true, live_order:false, funding_total_usd, idempotency_key, raw_preview_redacted}、key_valid_evidence（如"tools/list 成功且 search 返回 200"，不是 Key 值）、deposit_called:false、release_called:false、paid:false、tx_hash:null、limitations（写明未验证项）。
**Key 或其前缀、完整档案、工人联系方式不得出现在回执里。**

## 验收（缺一不算完成）
1. dry_run.live_order=false 且 deposit_called/release_called=false；
2. 提供 tools/list 实际输出的字段名；
3. 预览资金总额 ≤ 3.54 USD（3 + 18%）；
4. 回执无任何 Key/联系方式；
5. 由不同供应方（豆包或千问）复核，Claude 独立审计；不得由 Copilot/DeepSeek 自评通过。

## 阶段 2B（以后，不属于本单）
通过复核后，才讨论充值 5 USD 并发 1 个真单（≤3 USD）。官方页面对已有账号的充值只列了网页结账（`checkoutUrl`）和 MPP（**不支持 USDC**），所以可能要用银行卡付一次，不能默认走 GPT 的 USDC 金库。放款不可撤销，只在交付复核后由评审团按老板常设授权执行。

## 禁止
倒填时间；把预演写成"已发单"；把 Key 当作证据贴出；用同一模型做作者和复核；改动他人回执。
