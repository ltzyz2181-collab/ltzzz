# Claude 工作接入与五签退出分离

日期：2026-10-14 America/Tijuana。来源：owner 明确“退出五签，不证明不能为 LTZZZ 工作”。
状态：**on_demand_entry_verified_no_generation**。PR #57 已合并，原生 API 目录实测 HTTP 200。不是实际生成、不是恢复资金席位。

## 修正

- Claude 身份档案明确外部研究、工程审稿、六文件讨论可按需参与；`votingSeat=false`、`walletSigning=false`，历史资金子网撤席保持。未调用钱包或 Safe，也未更改链上 owner。
- 新增 `.github/workflows/claude-on-demand-review.yml`：没有 schedule。普通合并和默认 inspect 只查询原生 Anthropic 模型目录并生成公开资料包，生成次数 0。
- 仅 owner 显式手动选择 review 才可至多请求一次生成。读取固定公开材料，不接受任意文件路径；完整资料不静默截断；输入 32000 字符、输出 1600 tokens。默认实际目录中的 Haiku，其次 Sonnet，不猜型号、不自动选 Opus。
- 先持久提交任务 claim，再请求 API。同单号已有记录不再授权；缺 Key、余额拒绝、429、超时、异常终止、缺结束标记均阻断，不无限重试/换模型。
- 原生 API 输出由已有仓库执行器代存，Claude 不需要 GitHub 写权限，也不依赖云浏览器登录。结果只为 submitted_pending_review，不自动入长期记忆或触发部署。
- 修正旧费用文件里的未实装美元预算保证和过时 Key 名称；实际 API 账单未知时记 null，API 费用、内部积分、真钱工资分开。

## 验证

本地 17 项相关测试通过（新接入/原生API失败分类/原资金子网撤席）。Git diff 格式检查通过。测试中网络均为 mock；原生生成请求未执行。

历史证据：readiness-38332123544 的 Claude 目录 HTTP 200、Key 存在，不代表生成余额；最近已知真实生成阻塞为 insufficient_api_credits。新只读运行只能更新目录状态，不能用它宣称余额已恢复。

## 当前未完成

- 真实 Claude 生成交付与 API 当前余额未验证；本轮不请求生成，不自动充值。
- 原 Pulse zip 仍未取得，浏览器最后一次读取被 Cloudflare 真人验证阻塞。原生 API 是新任务通道，不能读取旧网页会话附件，不冒充找回原件。
- 本轮不恢复旧公开 proxy、不重装机器人、不新增付费日课、不恢复资金投票/签名。

入口与操作：docs/CLAUDE-WORK-WITHOUT-FIVE-SIGN.md。后续实际 Actions 回执单独记录，不把脚本存在当部署验收。

## 实际接入验收

- PR #57 合并源码：f4306880e8acabec24aca529850d29bad9d10e33。
- [Actions run 38662866522](https://github.com/ltzyz2181-collab/ltzzz/actions/runs/38662866522)：success，13 项入口/API 测试通过；付费生成步骤 skipped。
- [真实只读回执](../../../knowledge/results/claude-review/readiness-38662866522.json)：2026-10-15T00:56:36 UTC（owner 本地 10-14）；既有 Key 存在、官方模型目录 HTTP 200，含 Haiku/Sonnet。`model_generation_calls=0`、`generation_verified=false`、`credits_status=unknown`、`wallet_permissions=false`。
- 公开 ANS/Pulse 上下文包由执行器自动生成到 knowledge/results/claude-review/context-ans-pulse.md；后续 review 从仓库读取资料并代存结果，不依赖 owner 来回复制或 Claude 自己写仓库。
- 本轮不调用生成、不购买额度。API 当前是否可生成仍需未来一次明确授权的真实任务才能验证，不能把旧余额故障写成已解除。
- 浏览器取旧 zip 路线因 Cloudflare 验证阻塞暂停；未继续消耗浏览器额度重试。原生 API 不继承网页历史，旧 zip 仍为未取得。
