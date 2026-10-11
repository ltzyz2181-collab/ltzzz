# x402 · Base USDC 真实轨道开通清单

**状态（2026-10-11）**：challenge / verify 已上线并实测通过（模拟）。真实 Base USDC 待 secret。

## 已验证（模拟）

```bash
# challenge → 402
curl -sS -X POST https://ltzzz-wep3.ltzyz2181.workers.dev/market/x402/challenge \
  -H 'Content-Type: application/json' \
  -d '{"skill":"signal","brief":"your brief at least ten chars"}'

# verify with sim_ token → order queued
curl -sS -X POST https://ltzzz-wep3.ltzyz2181.workers.dev/market/x402/verify \
  -H 'Content-Type: application/json' \
  -d '{"challenge_id":"X402-...","proof":"sim_any_token_12plus"}'
```

catalog `rails.x402.status` = `simulated`。

## 开通真实 Base USDC

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 增加：

| Secret | 值 | 作用 |
|--------|-----|------|
| `X402_RECEIVE_ADDRESS` | Base 链收款地址（轮换后的新金库，非已泄露旧址） | challenge 的 `pay_to` |
| `X402_LIVE` | `1` 或 `true` | 仅当 proof 为合法 `0x`+64 hex 时记为 live 收入 |

然后跑：

```bash
gh workflow run deploy-wep3.yml --repo ltzyz2181-collab/ltzzz
```

部署步骤会把上述 secret 写入 Cloudflare Worker。未设置时继续走模拟地址 `0xSIMULATED_LTZZZ_TREASURY`，`0x` 交易哈希也不会记 live。

## 行为约定

- `sim_*` proof → 永远 test / simulated，入队可履约。
- `0x` + 64 hex + `X402_LIVE` 已设 → `live: true`，计入 `live_revenue_cents`。
- 当前 **不**自动扫链；真实 tx 验证（金额、收款方、确认数）是下一里程碑，可在 verify 内接 Base RPC / 索引器。
- 收款地址必须是 policy 中「轮换后新钱包」，旧 `0x21F5` 已作废。

## 与五签

真实资金轨道开通属于委员会签署事项；Owner 仅 24h 撤回权。
