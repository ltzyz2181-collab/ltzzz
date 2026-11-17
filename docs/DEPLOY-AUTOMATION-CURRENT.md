# 部署自动化当前口径（2026-11-17）

本文件是"合并/部署是否需人工"的唯一当前口径。历史上任何写"必须人工确认部署"的记录（含 `docs/2026-11-13-裁决回读与执行清单.md` 与 patchgate A0/A2 说明）**作为历史留痕保留不改**，但不再是当前生效规则。

授权来源：`config/deploy-automation-authority-20261117.json`（`authority_id=OWNER-AUTH-20261117-DEPLOY-AUTOMATION`，owner 2026-11-17 明确"自动部署吧"）。

## 1. 当前生效规则

| 动作 | 当前规则 | 依据 |
| --- | --- | --- |
| 合并 PR 到 main | 测试全绿 + CI pass 即自动合并，不再请示 | 既有 owner 偏好 + 本授权 `automatic_merge=true` |
| 生产部署（Workers / 流水线 / 文档与测试产物） | 合并后自动部署，不再请示 | 本授权 `automatic_deploy=true` |
| 部署验证 | 必须回读 health 并落盘回执；`model_calls=0` | 本授权 `preconditions` |
| 回滚 | 保留入口但不自动触发 | `automatic_rollback=false` |
| 资金 / 放款 / 退款终判 / 钱包 / Safe / 签名 / 凭据 | **仍然人工**，走 GPT 决策席（5 签 Safe 由人） | 本授权 `excluded_families` |

被排除的族是硬边界：即使代码已经写好、测试已经绿，也不得由本席自动执行。

## 2. 与旧配置的关系

`config/patch-policy.json`、`config/patchgate-a2.json`、`config/patchgate-a3.json`、`config/pi-cloud.json` 里的 `automatic_deploy=false` / `generic_production_deploy_enabled=false` **保持原值不动**。它们是阶段级"validation_only"结构性护栏（代码里有断言，例如 `A0_validation_only_policy_required`、`invalid_A2_docs_only_config`、`pi_capability_not_accepted`），翻转会直接破坏对应阶段的安全契约，而且它们并不控制真正的生产部署入口。

真正的部署入口是各服务自己的 workflow（push main 命中路径即部署）。本授权改变的是"要不要请示"，不是这些阶段的验证契约。

## 2.1 闸门的代码位置（不是只有文字）

- 判定函数：`scripts/lib/deploy-authority.mjs` → `decide({action:'merge'|'deploy'|'rollback', family})`
- 合并与部署是两个独立开关（`automatic_merge` / `automatic_deploy`），`excluded_families` 命中时**优先硬拒**，回滚默认拒，未知动作 fail-closed
- 回归：`node --test scripts/tests/deploy-authority-gate.test.mjs`

## 3. 审计读法

1. 先读本文件，再读 `config/deploy-automation-authority-20261117.json`。
2. 部署是否算完成，只看 `knowledge/results/**` 里的部署回执是否含 `source_commit`、`run_id`、health 快照。
3. 回执缺失或 health 未回读 → 记 `unknown`，不得写 `deployed`。
4. 见到历史文档说"必须人工部署"，按本文件判定为 superseded，不判 BLOCKED。
