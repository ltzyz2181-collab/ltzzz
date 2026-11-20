# HIRE-SAMPLE-20261116-01 复核报告

本报告是样例雇佣单 HIRE-SAMPLE-20261116-01 的交付物，对应任务「核对 Phase1 规格文档与实现是否一致，输出差异清单，只报告不改动」。报告只做核对，不修改任何被核对文件。

## 复核范围

- 规格文档：`docs/HIRE-AI-PHASE1-SPEC-20261116.md`（v1.1 修订后）
- 实现：`scripts/hire-phase1.mjs`、`scripts/hire/gates/phase1-smoke.mjs`、`scripts/hire/gates/deliverable-audit.mjs`
- 样例单：`ops/hire/orders/HIRE-SAMPLE-20261116-01.json`、`ops/hire/orders/HIRE-SAMPLE-20261116-02-forbidden.json`

## 检查项

1. 验收闸是否分得清「harness 自检」与「订单验收」。
2. 订单验收是否对应可机器判定的 `acceptance_criteria`。
3. 验收是否读取真实交付物字节，而不是源码里的字符串标记。
4. 回执是否绑定 `order_sha256`、`receipt_sha256` 与逐条判据结果。
5. 回执账的零资金不变量：每条记录必须 `paid=false`、`financial_execution=false`、`amount_usd=0`。
6. 拒绝权是否覆盖中英文资金、签名与生产操作表达。
7. CLI 账本路径是否被限制在 `knowledge/results/hire/` 内。

## 差异清单

| 编号 | v1 状态 | v1.1 状态 | 判定 |
|---|---|---|---|
| D-01 | 只有 `phase1-smoke` 一个闸，检查三个源码字符串 | 拆为 `phase1-smoke`（harness 自检）与 `deliverable-audit`（订单验收） | 已修复 |
| D-02 | 订单无判据字段，无法说明「怎样算完成」 | 新增必填 `acceptance_criteria`，且必须含内容型判据 | 已修复 |
| D-03 | 验收不读交付物内容 | 闸重新读取字节并重算 SHA-256，空交付物与未完成标记直接不通过 | 已修复 |
| D-04 | 回执不含闸输出，模型可自行声明 accepted | accepted 必须携带闸输出的哈希与全部判据通过结果，harness 再核一遍 | 已修复 |
| D-05 | 旧锁按过期观察直接删除，可能删掉新锁 | 回收前比对 dev/inode/token，持 reclaim 锁后重新校验身份 | 已修复 |
| D-06 | 写入不检查实际字节数，失败可能留半行 | 循环写满、核对字节数、失败回滚到写入前长度 | 已修复 |
| D-07 | 英文只覆盖少量单词 | 增加 `transfer money`、`withdraw funds`、`send payment`、`sign transaction`、`deploy to production`、`modify production configuration` 等短语规则 | 已修复 |
| D-08 | CLI 可指定任意账本路径 | 只接受 `knowledge/results/hire/<name>.jsonl`，拒绝绝对路径、穿越、反斜杠与符号链接 | 已修复 |

## 结论

规格文档与 v1.1 实现在上述八项上一致。订单验收已经绑定真实交付物与明确判据，回执不再依赖模型自述；零资金不变量 `amount_usd=0` 在构建、追加、读账三个阶段都被强制校验。样例单 01 使用 `deliverable-audit` 并引用本报告作为唯一交付物；样例单 02 为对抗样例，命中资金与签名表达，应在闸执行前进入 `needs_owner_decision`。
