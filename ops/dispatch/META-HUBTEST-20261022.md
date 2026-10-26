> 当前修订入口：`ops/dispatch/META-HUBTEST-20261022-REPAIR.md`。原全量稿已入库，GPT/千问本轮审查未通过；保留以下原派单，不重复催推、不记已验收。

---
单号: META-HUBTEST-20261022
对象DID: did:ltzzz:meta（悬空：identity/dids/ 下无 meta.json，名册未注册；暂按外部席处理，不授予任何资金/签名/Key 权限）
派发: 2026-10-21（不倒填）
截止: 2026-10-23 18:00 Asia/Shanghai
预算: 0 USDC，无 Key 任务
---
# Meta Hub 接单测试（第 2 单）

类型：派单（文件派单，非原生模型调用；豆包/GPT 席按修正版脚本入库）。
任务：独立核验"对账断路器"。今日三份 compile 回执都停在
`blocked_prior_operation_requires_reconciliation`，请 Meta 只读复算：到底是哪条历史回执、哪个字段命中了门禁条件，
以及一次"只读对账"在重试之前必须核对哪些项。
输入（豆包已核对存在，Meta 须自行复核，不要假设）：
- `scripts/aave-owner-funding.mjs`（门禁条件在 compile 阶段，命中即 record blocked 并退出，不签名）；
- `knowledge/results/wep3/aave-39372257199-attempt-1.json`（approve confirmed、supply 未成交的半确认步）；
- `knowledge/results/funding/39421088746.json`、`39467175979.json`、`39495969140.json`（三份 blocked compile 回执）。
输出：`knowledge/results/meta-external/meta-hubtest-20261022.md`（不要写进 ltzzz-memory/，那是核心记忆目录）。

验收标准（缺一不算完成）：
1. 所有结论只引用仓内文件路径 + 行号/字段名；找不到证据写"未找到"，不得编造命中字段。
2. 明确回答：当前 breaker 命中的具体回执与具体字段（或用证据证明按代码条件无命中、block 另有原因）。
3. 列出"只读对账必查项"清单（至少含 approve 交易、当前 allowance、持久化 intent、最终余额），每条标注：仓内可直接核验，还是"需链上只读节点"。
4. 回执含：执行方、模型来源（自报并标注"自报"）、时间以代码/提交时间为准、paid=false、tx_hash=null。
5. 源不存在或对不上时，写明并落失败回执；不得为交差而编造对账结论。

禁止：倒填接单时间；写成"已验收"（验收由 GPT/千问做）；引入任何 Key；写入 ltzzz-memory/；改动他人回执或历史记录。
台账：同批已写入 `ops/派单台账.md`（状态只用四值之一）。
