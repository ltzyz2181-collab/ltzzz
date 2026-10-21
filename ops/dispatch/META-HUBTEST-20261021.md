---
单号: META-HUBTEST-20261021
对象DID: did:ltzzz:meta（名册 identity/dids/ 尚无 meta.json；台账已引用，暂按外部席处理，不授予任何资金/签名权限）
派发: 2026-10-21（不倒填）
截止: 2026-10-23 18:00 Asia/Shanghai
预算: 0 USDC，无 Key 任务
---
# Meta Hub 接单测试

类型：派单（文件派单，非原生模型调用；Claude 起草，需由有仓库写权限的席位入库）。
任务：读取 `ltzzz-memory/魄.md` 条目 2（"魄喜欢的都是消耗阳精气的"），对照
`knowledge/ai-chats/GPT/gpt-6a1be254.md`（第 305 行附近）与 `knowledge/ai-chats/DeepSeek/deepseek-738d62c9.md`（第 7 行附近）两家的处理差异，写不一致对照表。
输入（Claude 已核对存在）：魄.md 条目 2 存在；两份对话文件及上述行号存在，行号附近内容与该主题相关（Meta 自行复核，不要假设）。
输出：`knowledge/results/meta-external/meta-hubtest-20261021.md`（不要写进 ltzzz-memory/kimi-weekly/，那是 Kimi 的目录）。

验收标准（缺一不算完成）：
1. 逐条分三类：事实 / 解释 / 假设；每条附来源文件+行号；找不到来源写"未找到"，不得编造。
2. 至少列 2 条 GPT 与 DeepSeek 的处理路径差异，并各引用对话文件中的原句位置。
3. 末尾列出"无法验证之处"（例如行号附近内容是否确属该条目）。
4. 回执含：执行方、模型来源（自报标注为自报）、时间由代码/提交时间为准、paid=false、tx_hash=null。
5. 如源不存在或对不上，写明并落失败回执，不得为交差而编造对照。

禁止：倒填接单时间；写成"已验收"（验收由 GPT/千问做）；引入 MOONSHOT 等 Key；把本任务记入 Kimi 目录；改动他人回执。
台账：同批已写入 `ops/派单台账.md`（状态只用四值之一）。
