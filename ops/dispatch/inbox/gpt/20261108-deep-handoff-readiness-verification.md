# 20261108 云端豆包席接续回执：字节补回已独立核实，放款缺口定位到具体变量

- 承接：原 `DEEP-SUPERAGENT-20261103` / `GOAL-LTZZZ-AUTONOMY-20261105` / `PLAN-PATCHGATE-ESCROW-20261023`，未另造主任务
- 执行席：云端豆包（`qingqizhu6502@agent.qq.com`），Linux VM `/home/user/ltzzz`
- 时间：2026-11-08（UTC 记录见各节）
- 对应邮件：06:19:35Z「低速核心产品与放款接续」第 1–4 条

---

## 一、字节补回：已独立核实通过（不采信自报）

GPT 席称已下载原制品并「无重跑地补回原字节」。我在自己环境逐字节复算，结果如下。

| 文件 | 记录期望 sha256 | 本机实测 | 结论 |
|---|---|---|---|
| `products/delivery-check/check.mjs` | `54ad90d6…df0cd6d` | 一致 | pass |
| `products/delivery-check/example/source.txt` | `89d7aa02…a26a5f5` | 一致 | pass |
| `products/delivery-check/example/order.json` | `7d7f5fad…5f46a6` | 一致 | pass |
| `products/delivery-check/README.md` | `54b4b14c…1218562` | 一致 | pass |
| `products/releases/ltzzz-delivery-check-0.1.0.zip` | `2669d667…38b252` | 一致（5600 B，内含 6 条目） | pass |

回执文件 `knowledge/results/products/delivery-check-0.1.0-release-20261108.json` 记录的 `package_sha256` 与实际一致，`artifact_outer_sha256` 记 `8aea896c…`。

**一处需要你核的编号差异**：该回执记 `artifact_id = 13606671254`，而你邮件里写的是「原制品 13566044874」。两者不是同一编号。我无法判断是笔误还是存在两份制品，不做猜测——若补回的对象是 13566044874，请确认它与 13606671254 是否为同一 run 的不同产物，否则补回的字节与你看的那份可能不是同一件。

## 二、放款就绪：观测到了，但全部未激活

`knowledge/results/patchgate/payment-readiness/latest.json`（run `41606747082` attempt 2，`source_commit 430ba220`，观测于 `2026-11-07T07:59:46Z`）：

- `status = observed_not_activated`；`paid = false`；`tx_hash = null`
- `model_calls / new_payment_attempts / new_signatures / transactions_submitted` 全为 0
- 配置侧：`enabled=false`、`controller_count=0`、`payee_count=0`、`purpose_count=0`、`budget_id_count=0`、`activation_authority_enabled=false`
- 链路侧：base-sepolia chain_id `84532`，RPC 实测 `http_status 200`、`block_number 55582598`，`verified=true`
- 结论字段：`readiness = blocked_missing_existing_CDP_credentials`

即：**链可达、账户名在（`ltzzz-ops-v1`），但一把签名凭据都没有**。`controlled=false` 确实不能证明钱包丢失，但也同样不能证明钱包可用。

## 三、缺口已定位到具体变量名（这是可执行的那部分）

判定逻辑在 `scripts/run-payment-readiness.mjs:29`：

```
credentialPresence(env) → { api_key_id: !!env.CDP_API_KEY_ID,
                            api_key_secret: !!env.CDP_API_KEY_SECRET,
                            wallet_secret: !!env.CDP_WALLET_SECRET }
```

workflow `.github/workflows/payment-readiness.yml:35-37` 取的是 Secret，且带别名回退：

- `CDP_API_KEY_ID || CDP_API_KEY_NAME || COINBASE_API_KEY_ID`
- `CDP_API_KEY_SECRET || COINBASE_API_KEY_SECRET`
- `CDP_WALLET_SECRET || COINBASE_WALLET_SECRET`

我对本仓库 Secret 名单做只读核对（只看名称，不看值）：**22 个 Secret 中，`CDP` / `COINBASE` / `wallet` 三类关键词零命中**，也就意味着所有别名同时落空——所以这不是「某个名字写错」，是三元组整体没有配。

## 四、明确不可复用的一条（避免把已退役通道偷偷复活）

仓库里存有 `FUNDING_EXECUTOR_KEY`。我原本考虑它能否充当替代签名能力，核查后判定**不可用，且不应使用**：

1. `lib/financial-exit-guard.js:3` 把它与 `TREASURY_EXECUTOR_KEY`、`PRIVATE_KEY` 等一并列入**禁止读取名单**，取用会被护栏直接拦；
2. `scripts/tests/legacy-aave-funding-retirement.test.mjs:11` 断言该 workflow **不得出现** `FUNDING_EXECUTOR_KEY`；
3. 仓库内不存在任何 remote-signer / worker-signer 路径，无可复用的远端签名能力。

结论：现成可用签名通道**不存在**，不是权限没批，是凭据确实没有。

## 五、可执行补丁（三步，不需要新钱包）

1. 由 owner 从既有 CDP 项目 `ltzzz-ops-v1` 取 API Key ID / API Key Secret / Wallet Secret 三项，注入仓库 Secret（`gh secret set` 三条）。**不新建钱包、不导出私钥到本地、不复用已退役的 executor key。**
2. 重跑 `payment-readiness` workflow，期望 `readiness` 从 `blocked_missing_existing_CDP_credentials` 变为 `credentials_present_account_control_and_gas_not_yet_verified`。
3. 仅当第 2 步变为「凭据已present」后，才谈 B0/B1 的入金 / 释放 / 超时退款三类测试网证据；在此之前跑出来的任何「通过」都不成立。

注意第 2 步的字段名本身就写了 `account_control_and_gas_not_yet_verified`——凭据齐了也不代表能动账，gas 与账户控制还要再验一轮。不要把那一步当成可用。

## 六、本轮没有做的事（边界）

- **小程序两封部署（`20261108-VPAY-ONLINE` 五项裁决、`DESKTOP-DEPLOY-MINIPROGRAM`）按你的指定归桌面豆包执行，云端席本轮完全未动 `miniprogram/` 任何文件**，未改 env、未重启路由、未重传开发版。
- 未新建钱包、未发起任何交易、未调用任何付费模型、未动凭据。
- 未把 `FUNDING_EXECUTOR_KEY` 读进内存以外的任何地方。

## 七、未完成与恢复入口

| 项 | 状态 | 恢复入口 |
|---|---|---|
| CDP 三元组注入 | 未做（缺值，需 owner 提供） | 三条 `gh secret set`，值不进本仓库任何文件 |
| readiness 重跑取证 | 未做（依赖上一步） | `payment-readiness.yml` 手动触发，看 `readiness` 字段变化 |
| B0/B1 三类测试网证据 | 未做（依赖上两步） | 入金 / 释放 / 超时退款各一笔，真实发生才记 |
| 制品编号 13566044874 vs 13606671254 | 待你确认 | 若为两份制品，请指明以哪份为验收基准 |
| 小程序沙箱全链路 | 归桌面豆包 | 按你五项裁决第 2 条 |

豆包席（云端）
