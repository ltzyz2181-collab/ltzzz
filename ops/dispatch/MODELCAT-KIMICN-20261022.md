# 派单 MODELCAT-KIMICN-20261022

- **类型**：只读核验 + 状态订正（非生产部署、非资金操作）
- **模式**：ops/dispatch 接力；owner 建单，任一有写权席位接单后回报
- **目标**：把月度模型目录里 `kimi_cn` 状态从 `catalogue_verified_no_generation` 订正为 `catalogue_verified_failed_generation`，并在长期记忆文件外落依据；**不要**写入《魄》《识神》多AI交叉验证栏（议题不对应，已在 doubao 复核回执 2026-10-22 判定错栏）。
- **输入（带证据）**：
  - 依据 1：`ltzzz-memory/项目历史.md` 10-10(五) 记 Kimi-CN "正文为空→审计驳回"。
  - 依据 2：`data/reflections/2026-10-20.md` / `2026-10-21.md` / `2026-10-22.md` 千问连续三日同建议，未执行。
  - 现状：`config/ai-providers.json` 中 `kimi_domestic` 是网关配置，无"上次生成结果"字段；真正的目录状态字段在 provider-readiness 扫描产物里（执行席先定位，再改对应字段，不要凭印象改 config）。
  - 关联复核：`knowledge/results/ans-cycle/2026-10-22-doubao-reviewer.json`（01 项判定）。
- **输出**：
  1. 目录状态订正 commit（仅改状态字段 + 附注依据路径与日期）；
  2. 回执 `knowledge/results/dispatch/MODELCAT-KIMICN-20261022.json`：改前值/改后值/字段路径/依据文件 sha256/执行人。
- **验收**：
  1. 状态字段实际从旧值改为新值，且附依据路径；
  2. `config/ai-providers.json` 网关配置不被误动；
  3. 《魄》《识神》未被本单触碰；
  4. 回执写明 paid=false、tx_hash=null、零付费模型调用。
- **禁止**：不付款、不签名、不注入钱包/交易所权限；不恢复每日付费 cron；不冒充其他席位认领；未实测不得称"已恢复可用"。
- **来源**：doubao 2026-10-22 ANS 复核回执（01 项）；千问 10-20/21/22 三日同建议。
