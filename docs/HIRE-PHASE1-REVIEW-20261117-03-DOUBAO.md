# 豆包席安全审查报告 · GPT-HIRE-PHASE1-REVIEW-20261117-03

- 席位：豆包（独立只读安全审查席）
- 审查对象：PR #408，head `0d253c8631526b70a9983cc1be902c6f179e4f8b`，base `774b7bd6`（=当前 main）
- 执行通道：`doubao-dispatch.yml`（本轮新建），只走已有豆包代理，无 Key 直连回退
- 状态：draft，未验收；未合并、未部署、未改资金策略

## 调用记录（含失败，不隐藏）

| 尝试 | 卡 | run | 结果 | 原因 |
|---|---|---|---|---|
| 1 | `…-03` | 44064158710 | 失败 | 33k 字符输入 + 4096 max_tokens 触发代理 90s 上游超时，HTTP 504，`upstream_outcome_unknown`；按禁止重放规则未重试原卡 |
| 2 | `…-03A` | 44216037180 | 不合格 | 原生调用成功但 1536 token 写满，finish_reason=length，输出被截断 |
| 3 | `…-03R2A` | 44216335289 | 成功 | 4 项、900 字上限、1536 token |
| 4 | `…-03R2B` | 44216611001 | 成功 | 4 项、900 字上限、1536 token |

拆卡是换法重试（缩小范围 + 限制字数），不是对同一请求的盲目重放。第 1 次超时按 `upstream_outcome_unknown` 记账，不排除上游已计费。

## R2A（第 1/2/3/5 项）

- 回执：`knowledge/results/doubao-dispatch/DOUBAO-HIRE-PHASE1-SECURITY-REVIEW-20261117-03R2A.json`
- 模型：`doubao-seed-2-1-pro-260915` / finish_reason=`stop` / tokens=7859 / 完整性 `structurally_complete`

```
【逐项结论】
第1项 · MEDIUM · scripts/hire-phase1.mjs:743-821 · 调用方可自造 receipt.gate 与 receipt_sha256，verifyReceipt 仅做结构自洽校验，不绑定真实 gate 执行产物或签名。 · 正常经 gateOutcome 不可伪造，但直接调用 verifyReceipt/assertAppendOnly 可接受伪造 accepted，缺外部可信执行绑定。
第2项 · NONE · scripts/hire-phase1.mjs:81-111,579-646 · 白名单仅 deliverable-audit 为 order_acceptance，phase1-smoke 被拒绝；accepted 还校验 gate.kind。 · 白名单与 gateOutcome 绑定足够，自检闸不能冒充订单验收。
第3项 · MEDIUM · scripts/hire-phase1.mjs:331-419,542-578 · 若订单只选 contains_all 等弱内容条件，同路径换内容仍可满足；sha256 条件非强制。 · 验收可绑内容但不强制逐字节哈希，留路径换内容可能通过，无法证明绑定实际交付字节。
第5项 · LOW · scripts/hire-phase1.mjs:822-841 · 先以 idempotency_key 查重，再以 order_id 查重；同键仅允许状态与 reason 完全相同的重放。 · 常规重复 append 会识别；但绕过 verifyReceipt/appendReceipt 直接写账本无防护，同键不同 reason 也被拒。

【风险汇总】
1. receipt 校验缺少与真实 gate 运行记录、输出工件或可信签名的绑定，直接构造 JSON 可通过纯函数验收。
2. 验收标准允许不使用 sha256，弱内容条件不能防止同路径交付物被替换。

【无法核验】
1. scripts/hire/gates/deliverable-audit.mjs 未提供，无法确认其实际读取字节、哈希及 criteria 判定。
2. scripts/hire/gates/phase1-smoke.mjs 未提供，无法核验运行边界。
3. 相关测试文件及 PR 其余代码未提供，无法核验集成写入权限、调用约束与回归覆盖。
【交付结束】
```

## R2B（第 4/6/7/8 项）

- 回执：`knowledge/results/doubao-dispatch/DOUBAO-HIRE-PHASE1-SECURITY-REVIEW-20261117-03R2B.json`
- 模型：`doubao-seed-2-1-pro-260915` / finish_reason=`stop` / tokens=7963 / 完整性 `structurally_complete`

```
【逐项结论】
第4项 · MEDIUM · hire-phase1.mjs:943-1051 · 两进程可同时持有各自sidecar后重读同一陈旧锁并均unlink；dev/ino/token能防替换误删，但unlink非按inode绑定，胜者随后建锁、败者finally删自己sidecar不删新锁，主风险是回收竞态与PID复用误判。
第6项 · MEDIUM · hire-phase1.mjs:1118-1139 · 异常时ftruncate(sizeBefore)+fsync可清半条；但进程SIGKILL/断电发生在部分write后无回滚，且r+从当前size写依赖锁与fstat，若外部截断或同文件并发可损坏。
第7项 · NONE · hire-phase1.mjs:1154-1211,1303 · CLI把原始ledgerPath交给appendReceipt；模块也强制resolveLedgerPath，已拦绝对路径、反斜杠、空字节、../、规范化差异、软链及realpath越界。
第8项 · HIGH · hire-phase1.mjs:112-142,420-433 · “转 账”“pay pal”“with draw funds”“wallet”夹零宽外不可见符可绕过；中文“代付/扣款/划拨/出钱”，英文“payout/disburse/reimburse/settle payment”未覆盖，属真实意图缺口。

【风险汇总】
1. 陈旧锁回收仅靠sidecar串行创建，但删除锁与后续O_EXCL之间仍有多进程竞态，需原子rename或打开句柄链接校验。
2. 崩溃断电无法执行截断回滚，需原子临时文件rename或记录预写日志，启动时修复半截尾行。
3. 资金意图正则过窄，需按语义扩展中英支付/出金词及字符插入、全角符号、同形字归一化测试。

【无法核验】
1. deliverable-audit.mjs、phase1-smoke.mjs及测试文件未提供，无法核验调用面与回归。
2. readLockState/newLockToken/isProcessAlive/DEFAULT_IO实现未提供，锁状态解析与进程存活判断未核验。
3. 未提供仓库工具与commit，全文哈希、PR差异及实际运行结果均未核验。

【交付结束】
```

## 本席证据边界

豆包只拿到 `scripts/hire-phase1.mjs` 的行区间原文（全文 sha256 `undefined`），没有拿到 `deliverable-audit.mjs`、`phase1-smoke.mjs` 与测试文件，因此这三处一律列入无法核验，不得当作已审。
