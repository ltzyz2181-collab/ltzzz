# Claude：A1 只读观察适配器上线前独立审计

类型：工程派单。原 Task ID `PLAN-PATCHGATE-ESCROW-20261023`，阶段 A1，沿同一业务单，不新增雇佣或付款。

前置：PR #224 的 A0 条件已落实，#221 合并为 f624bd61aedccd8f5724dcd0ad1a2ee47c195ef0；主线54项通过。千问已给 N1/N2/配置 approve，原 revise 均保留。本卡不是把 A0 结论外推到 A1。

请读本实施 PR 固定 head 的以下文件：

- `.github/workflows/patchgate-a1.yml`
- `scripts/patchgate-observe.mjs`
- `scripts/patchgate-a1-acceptance.mjs`（仅开关关闭时显式手动验收）
- `scripts/patchgate.mjs`（新增 diffBase 参数，main 策略不随候选变更）
- `scripts/tests/patchgate-a1.test.mjs`
- `docs/PATCHGATE-A1-OBSERVATION.md`

审查重点：main 固定来源/PR数据边界、不能执行候选代码、API写入仅隔离观察分支、Git ref原子预留与422/未知结果、只读观察不得被误写成签名通过/自动合并/部署、fork/head移动/基线移动的实际影响。

PR #228 的原 revise 保留。请在新head重点复审 H5 workflow及运行时受信作者门禁、H6方法/端点/body白名单、M3常态开关与手动验收互斥、M4预留失败受控回执及未知写入不重发。验收脚本的两张测试PR只能是docs限定路径，head移动必须重新限定。L4/L5明确保留为后续事项。

输出：新路径 `knowledge/results/patchgate/a1-claude-rereview-pr228.md`，不要覆盖原审计，分支+PR，注明实际审计作者/客户端、读取完整head、上述原字节哈希、approve/revise及复现。原生 Claude 免费 PR 通道；不触发付费 Anthropic API，不用国内代执行冒充。`author_provider`请区分审计者自身与被审实现者，不沿用派单作者字段替自己署名。完整 head 由总控在 PR #228 和实施 PR 评论提供。

必须区分：单元测试、API夹具、真实Github runner运行/幂等验收。只读观察还没上线前不得声明上线。A2签名准入、自动合并、资金、Escrow均不属于本期。未收到你的本期审计，不进行A1生产激活。
