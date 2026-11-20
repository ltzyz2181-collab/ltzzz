# 中转席位（relay-gpt / relay-claude）当前分工

更新时间：2026-11-19
裁决依据：`config/owner-authority-20261119-open-execution.json`

## 权限

| 席位 | 读取 | 写入 | 裁决 | 资金类 |
|---|---|---|---|---|
| relay-gpt | 全仓 | 决策记录、Issue 评论 | 普通事项具约束力 | 不接触 |
| relay-claude | 全仓 | 代码/文档 PR（限卡上 `paths:`） | 只复核，不裁决 | 不接触 |

中转调用的档位在 `config/relay-seat-policy.json` 的 `profiles` 里：
`adjudication`（≤900 输出 token，单次 ≤$0.05）与 `code`（≤2000 输出 token，单次 ≤$0.05）。
余额底线仍是 $3，低于底线自动关席。

## 在 Deep 团队里的分工

- **relay-gpt：日常裁决席。** Deep 团队每天产出的卡，凡不涉及资金/退款终态/签名/密钥/钱包/凭据，
  由它直接给 verdict（approve | reject | needs_more_evidence），回执写回原卡。
  它不再只出「建议」，除非卡片本身属于保留事项——那类卡在进 relay 前就被拦下转 GPT。
- **relay-claude：代码与证据席。** 更适合做这四件事：
  1. 补测试与回归用例（最擅长，风险最低）；
  2. 整理交付回执、把散落的证据写成结构化记录；
  3. 复核 PR diff，指出缺测试、命名不一致、边界漏判；
  4. 在卡上声明的小范围路径内改文档/注释/死代码清理。
  不适合：跨模块重构、涉及生产配置的改动、任何资金语义。

## 怎么用

- 裁决：卡片打 `autoloop:adjudicate`（默认 relay-gpt）或 `autoloop:adjudicate:claude`。
- 写代码：卡片打 `autoloop:exec:relay-patch`，并在正文写
  `paths: docs/a.md, scripts/tests/b.test.mjs`，`---` 之后写任务。
  relay-claude 只能改这些路径；钱包、`.env`、密钥、凭据路径即使在 `paths:` 里也会被拒绝。
  写完后由 `node scripts/relay-patch.mjs --verify-only` 自检，再走正常 PR/合并。
- 邮件：卡片打 `mail:send`，见 `docs/AUTOLOOP-CURRENT.md`。

## 边界

- 保留事项（资金、付款、放款、转账、退款终态、签名、私钥、助记词、钱包、五签 Safe、凭据与密钥）
  永远不送进中转席。
- 中转裁决产生的是「做不做、按什么范围做」，不等于执行结果；执行结果以仓库回执为准。
- 中转模型是第三方聚合站，提示词会经过其服务器；不得把凭据、客户敏感资料放进 prompt。
