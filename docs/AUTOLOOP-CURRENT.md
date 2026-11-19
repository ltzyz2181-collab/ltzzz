# 每日自动循环（autoloop）当前状态

更新时间：2026-11-19
任务：`TASK-HUB-AUTOCLAIM`

## 它做什么

`.github/workflows/daily-autoloop.yml` 每天 01:10Z / 13:10Z（另可手动触发）跑一次：

过期租约 reap → 领取派单卡 → 跑登记过的执行器 → 自动开 PR → 判定能否合并 → 写回执
→ 读项目邮件头部 → 发汇总邮件。

回执落在 `knowledge/results/autoloop/run-<run_id>.json` 和 `digest.txt`。

## 为什么它不会乱跑

1. **Issue 正文永不执行。** 正文只是不可信输入，不参与命令构造。
2. **必须显式打标。** 卡片要带 `autoloop:exec:<executor-id>`，且该 id 必须在
   `ops/autoloop/executors.json` 登记；否则一律跳过。
3. **高风险一律人工。** 出现资金、退款、签名、私钥、五签、生产部署、Secrets、凭据、
   助记词的句子直接 `human_only` 跳过。带否定词的句子（如「本卡不涉及资金、签名」）
   在扫描前剔除，不会被自己的免责声明拦下。
4. **合并有双闸。** 只有 `auto_merge: true` 的执行器才谈合并；改动路径必须全部落在
   `docs/`、`ops/`、`knowledge/results/`、`scripts/tests/`。CI 任一检查失败即拒绝。
5. **检查静默的替代。** 分支上根本没有 check_runs 时，允许用执行器自带的 `verify`
   命令通过来替代；`verify` 失败则 blocked 并转 GPT。
6. **中转只出建议。** `autoloop:adjudicate` 走 relay 席，回执固定标注
   `verdict_is_not_approval=true`，不得声称已合并/已部署/已被平台接受。
7. **邮件不是门禁。** 发信失败只记录状态，不阻断任务。

## 现有标签

| 标签 | 作用 |
|---|---|
| `dispatch` | 派单卡的识别标签（沿用 task-hub 约定） |
| `autoloop:exec:task-hub-status` | 执行 `task-hub status` 快照，不自动合并 |
| `autoloop:exec:oversight-merge` | 重算 warning 归并快照，可自动合并 |
| `autoloop:adjudicate` | 转中转 GPT 出建议，不构成批准 |
| `no-autoloop` / `human-only` | 显式排除 |
| `seat:<seat>` | 席位归属；无人指派时 autoloop 会先补自己的席位标签再领取 |

## 新增执行器的步骤

1. 在 `ops/autoloop/executors.json` 增加条目：`id`、`match.label`、`command`（首项限
   `node|python3|python|bash`）、可选 `verify`、`auto_merge`、`risk`、`produces`。
2. 补 `scripts/tests/autoloop.test.mjs` 覆盖新执行器的分类与校验。
3. `node --test scripts/tests/autoloop.test.mjs` 全绿后再让卡片带新标签。

## 已验证到哪一步

- run 44450688124：领取 #448 → PR #449 `merged_on_verify_no_checks` → 回执落 main →
  邮件 read=ok / send=sent。
- run 44450088196：PR #446 自动合并。
- **未验证**：schedule 触发的定时跑（push/workflow_dispatch 已实测，cron 首次生效待观察）。
- **未做**：生产部署自动化仍关闭；资金、退款、签名、五签 Safe 一律人工。

## 已知边界

- 分支上多数工作流会停在 `action_required`，所以 `check_runs` 经常为 0；这不是绿灯，
  只是静默，已按第 5 条处理。
- 邮箱读取是 Gmail 全箱头部（`BODY.PEEK`，只读、不标记已读），按项目规则过滤后才计入
  回执；非项目邮件不取正文、不写项目记录。
