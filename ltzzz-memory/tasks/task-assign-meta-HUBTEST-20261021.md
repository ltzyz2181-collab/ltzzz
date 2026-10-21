# task-assign: META-HUBTEST-20261021

- 类型：文件派单（非原生模型调用；千问沙箱无写权限，由豆包代录入库）
- 模式：外部席只读复算 + 回执（零资金、零 Key、零链上动作）
- 目标：读取 `ltzzz-memory/魄.md` 条目 2（"魄喜欢的都是消耗阳精气的"），对照 GPT 与 DeepSeek 两家在各自对话文件中的处理差异，写一份不一致对照表；核对 source commit 与行号，不得编造。
- 对象说明：`did:ltzzz:meta` 在 `identity/dids/` 下无建档文件（无 meta.json），属台账内事实存在的外部席；不授予任何资金/签名/Key 权限。
- 输入（带 SHA-256，Meta 须自行复核，不假设行号）：
  - `ltzzz-memory/魄.md` — sha256 `d21038b5672e80c779e11546dc7377ee529e492bd3790431fe96b0a817527b8a`（条目 2）
  - `knowledge/ai-chats/GPT/gpt-6a1be254.md` — sha256 `4df235421019a70567253b31faf580fddd639c5564c62504dd97fe915907ae2a`（约第 305 行附近）
  - `knowledge/ai-chats/DeepSeek/deepseek-738d62c9.md` — sha256 `14eb0331d1dffea5d127cc598694f88776048dc61e8782bf6028124f8ea2ad42`（约第 7 行附近）
- 输出：`knowledge/results/meta-external/meta-hubtest-20261021.md`（回执目录写这里，**不要**写进 `ltzzz-memory/kimi-weekly/`，那是 Kimi 的目录）
- 验收（缺一不算完成）：
  1. 逐条分三类：事实 / 解释 / 假设；每条附来源文件 + 行号；找不到写"未找到"，不得编造。
  2. 至少列 2 条 GPT 与 DeepSeek 的处理路径差异，各引用对话文件中的原句位置。
  3. 末尾列出"无法验证之处"（例如行号附近内容是否确属该条目）。
  4. 回执含：执行方、模型来源（自报并标注"自报"）、时间以代码/提交时间为准、paid=false、tx_hash=null。
  5. 源不存在或对不上时，写明并落失败回执，不得为交差编造对照。
- 截止：接单后 24 小时（不写 2026-10-02，那是已过期倒填）。
- 禁止：倒填接单时间；写成"已验收"（验收由 GPT/千问做）；引入 MOONSHOT 等任何 Key；写入 `ltzzz-memory/kimi-weekly/`；改动他人回执或历史记录。
- 来源：千问 13:01 修正版派单卡（八字段版）；对应简版任务卡 `ops/dispatch/META-HUBTEST-20261021.md`；台账制度第 2 条要求同批登记。
