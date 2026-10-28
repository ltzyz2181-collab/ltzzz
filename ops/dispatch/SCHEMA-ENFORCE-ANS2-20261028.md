# 派单 SCHEMA-ENFORCE-ANS2-20261028（P2-05 修复）

- **类型**：代码修复（JSON Schema 条件约束强制化）+ 回归测试；非部署、非资金操作
- **模式**：ops/dispatch 接力；任一有写权席位接单
- **目标**：把 ANS2 回执 schema（draft-07）中 `observed.items` 两对跨字段条件从"仅 description 散文"升级为机器强制约束：
  1. `action_taken === 'none'` → `follow_up_receipt` 必须为 null；
  2. `action_taken === 'none'` → `status` 必须为 'open'（且 `action_taken !== 'none'` 时才允许 'closed'）。
- **输入**：`knowledge/results/qwen-dispatch/QWEN-ANS2-SCHEMA-20261019.json`（内嵌 schema 原文；跨字段条件现仅存于 description）。
- **输出**：
  1. 修补后的 schema 版本（用 `oneOf` 或 `if/then/else` 表达两对条件，保持 additionalProperties:false 与 required 不变）；
  2. 最少 4 条正反用例测试：none+null+open（过）、none+非null（拒）、none+closed（拒）、fixed+closed+回执（过）；
  3. 回执 `knowledge/results/qwen-dispatch/SCHEMA-ENFORCE-ANS2-20261028.json`：schema 前后 diff、测试结果、执行人、paid=false、tx_hash=null、model_calls=0。
- **验收**：测试在修补后全部通过、修补前至少 2 条失败（证明测试真的在管）；不改其他字段与既有 required。
- **禁止**：不付款、不签名、不注入钱包；不覆盖千问原草稿 artifact（另存新版本）；未实测不得称已强制。
