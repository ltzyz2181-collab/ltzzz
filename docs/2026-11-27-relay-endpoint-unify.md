# Relay 出口地址统一（2026-11-27）

对应任务：`LTZZZ-EXEC-BLOCKERS-20261127-01`（B1 附条：5 个 relay-* 工作流仍指旧域名）

## 问题

`relay.ltzzz.com` 已上线（deploy run 45926276950，无令牌 POST 返回 401 `proxy_unauthorized`），
`config/deep-superagent.json`、`config/relay-seat-policy.json`、`scripts/relay-budget-close.mjs`、
`workers/deep-superagent` 均已切到新域名，但 5 个工作流仍硬编码旧地址
`https://ltzzz-relay-proxy.ltzyz2181.workers.dev/v1`。

后果：CI 看着绿，实际两套地址并存，记账口径与线上不一致；旧 workers.dev 在境内不可达。

## 改动

将以下工作流的 `LTZZZ_RELAY_PROXY_URL` 统一为 `https://relay.ltzzz.com/v1`：

- `.github/workflows/daily-autoloop.yml`（默认值）
- `.github/workflows/relay-acceptance.yml`
- `.github/workflows/relay-budget-reopen.yml`
- `.github/workflows/relay-ruling-request.yml`
- `.github/workflows/relay-budget-close.yml`

`relay-acceptance.yml` 中的 `https://relay-proxy-unreachable.invalid/v1` 是负向用例，保留不动。

新增回归测试 `scripts/tests/relay-endpoint-unify.test.mjs`：扫描全部工作流，出现旧域名即失败。

## 验证

- 本地 `node --test scripts/tests/relay-endpoint-unify.test.mjs`：2 passed / 0 failed
- 状态口径：代码已改并测试通过；合并后为 deployed（工作流文件生效），不等于线上验收通过