# 派单 MODELCAT-KIMICN-20261022（修订版 v2 · 2026-10-28 拆维度）

> 原卡 v1 目标"把 kimi_cn 状态 catalogue_verified_no_generation → catalogue_verified_failed_generation"经 P2-06 复核判为**维度混淆**（目录登记可用性 ≠ 生成结果），作废该目标，按本修订执行。

- **类型**：只读核验 + 目录字段拆分（非生产部署、非资金操作）
- **模式**：ops/dispatch 接力；owner 建单，任一有写权席位接单后回报
- **目标**：把 `kimi_cn` 的两个独立维度分字段记录，**不得**把目录登记状态改写为失败状态。
  - 维度 A（目录登记/可用性）：`catalogue_verified_no_generation` 原值**保持不变**（含义：已登记、已校验、无生成记录，不是失败）。
  - 维度 B（最近生成结果）：在 provider-readiness 扫描产物对应字段旁**新增独立字段** `last_generation_outcome: "failed_20261010_empty_response"`，附依据路径 `ltzzz-memory/项目历史.md` 10-10(五)。
- **输入（带证据）**：依据同原卡（项目历史 10-10(五)；千问 10-20/21/22 三日建议；config/ai-providers.json 为网关配置勿动；真正的目录状态字段由执行席先定位再改）。
- **输出**：
  1. 目录字段拆分 commit（A 不动 + B 新增，各记字段路径）；
  2. 回执 `knowledge/results/dispatch/MODELCAT-KIMICN-20261022.json`：A 字段路径与旧值、B 字段路径与新值、依据 sha256、执行人。
- **验收**：
  1. A 字段未被改为 failed_generation（必须仍是 catalogue_verified_no_generation）；
  2. B 字段存在且值为 failed_20261010_empty_response；
  3. config/ai-providers.json 未被误动；《魄》《识神》未被触碰；
  4. 回执 paid=false、tx_hash=null、零付费模型调用。
- **禁止**：不付款、不签名、不注入钱包/交易所权限；不恢复每日付费 cron；不冒充其他席位认领；未实测不得称"已恢复可用"。
