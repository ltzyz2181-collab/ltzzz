# 执行门槛更正回执（2026-11-22）

Task ID: LTZZZ-DEEP-EXECUTOR-BOOTSTRAP-20261119-01（#464）
decision_id: OWNER-DIRECT-20261119-DEEP-EXECUTOR-DELEGATION
依据: GPT 2026-11-22 12:56/12:58（-0800）修正通知，回复原线程，不新建任务。

## 改了什么

1. 保留家族从六个收敛为五个：资金动作、退款终态、签名、私钥/助记词/根密钥、钱包操作。
   凭据配置与轮换改为普通工程；Secret 值仍不得打印、提交或写入日志。
2. `scripts/deep-autonomy.mjs`
   - `FIDUCIARY_RE` 移除 `凭据`、`密钥`、credential 泛化词，保留私钥/助记词/根密钥等真实资金域。
   - `deniedWritePath` 放开 `.github/workflows/` 与 `config/deep-autonomy-*.json`；
     `config/owner-authority-*.json`、钱包/资金目录、`.env`/secrets 文件、发信与收信脚本仍拒绝自动改写。
   - 新增 `RESERVED_FAMILIES` 与内容校验：自动写入 `config/deep-autonomy-*.json` 时，
     若五个保留家族缺失则拒绝（`reserved_family_removed:*`），防止模型自授权。
3. `scripts/autoloop.mjs` 同步移除 `凭据`、`密钥`、`Secrets?` 保留词；退款/签名/私钥等仍升级。
4. `config/deep-autonomy-20261119.json` 升到 v3：删掉 credentials 家族，
   写明普通 workflow/config/凭据轮换无需 GPT PASS，Secret 值保护不变。
5. `config/deep-superagent.json`、`config/relay-adjudication-scopes.json`：
   裁决规则改为五类；relay 禁区改为 `private_keys_or_mnemonics`，
   authority_sources 纳入 `config/owner-authority-20261120.json`。
6. 邮箱路由更正：Deep 使用 `qingqizhu6502@agent.qq.com`（与豆包共用）；
   千问无已核实独立邮箱，标 `unavailable`；`306122054@qq.com` 只登记为桌面 GPT/Claude 的项目通信地址。
7. 文档同步：`ops/deep-superagent/DAILY-RECEIPT-CONTRACT.md`、`docs/TASK-HUB-CURRENT.md`。

## 实际测试（本地，2026-11-22）

- `node --test scripts/tests/seat-mail-registry.test.mjs scripts/tests/autoloop.test.mjs scripts/tests/deep-superagent-autonomy.test.mjs` → 65 pass / 0 fail
- `node --test scripts/tests/deep-superagent-queue.test.mjs scripts/tests/dispatch-seat-policy.test.mjs scripts/tests/dispatch-daily-card.test.mjs scripts/tests/check-card-contract.test.mjs scripts/tests/seat-mail.test.mjs scripts/tests/mail-thread.test.mjs` → 71 pass / 0 fail

## 未完成 / 未验证

- 本回执只证明本地单测通过；PR 的 required CI、合并 SHA、部署与线上 smoke 需在 PR/工作流回读后另行记录。
- 未改生产 Worker、未部署、未触碰资金/签名/钱包。
- 本地快照里 `scripts/tests/relay-seat-acceptance.test.mjs` 与 `mail-workflow-policy.test.mjs` 的一项在未改动的 main 上也失败（前者模型白名单断言，后者依赖中文文件名文档在本机解包失败），不是本次改动引入，未在本 PR 修复。
