# 钱包类代码审查：判据、探针矩阵与已知缺口

针对 `scripts/wallet/` 这类"只读钱包骨架"的审查经验（P0 提交 `3bf64dbfa`，21 项测试）。适用于任何账本/余额/订阅/适配器代码。

## 1. 独立复跑优先

- 不采信面板或对方自述，自己在 WSL 与云主机各跑一次：`node --test scripts/wallet/__tests__`、`node scripts/wallet/selftest.mjs`。
- 记录 pass/fail 数与耗时；real ledger 检查应因账本不存在而 SKIP，不要为了让测试变绿去造账本。
- 通过 ≠ 安全：测试覆盖的是作者想到的用例。

## 2. 探针矩阵（自写脚本，不用框架）

| 探针 | 期望 |
| --- | --- |
| 数字类型金额（`0.1`） | 拒（只收字符串） |
| 科学计数（`"1e-3"`） | 拒或规范化，不得静默取整 |
| `0.1 + 0.2` 与 `0.3` 的 units | 完全相等（十进制精确，不走浮点） |
| 超额 debit（余额不足） | 拒 |
| 未知 record 字段 | 拒 |
| 写型 RPC：`eth_sendRawTransaction` / `eth_sendTransaction` / 含 send 的批量体 | 拒 |
| 只读 RPC：`eth_getBalance` | 放行 |
| 无 RPC / 非法地址 | `unavailable`，`wei` 为 `undefined`（不是 0） |
| 未适配 rail 出款 | `not_adapted`，不得假成功 |
| 事件注入：`subscription.updated` 带 `changes:{status:'active'}` | 拒（见下） |

## 3. 本次真漏洞与补法

- 洞：`normalizeEvent` 只校验 `changes` 是"非空 plain object"，不校验键名 → 直连 `appendEvent` 可注入 `status`/`amount`/`next_charge`，把已 `canceled` 的订阅翻回 `active`。
- 补法：在 `core.mjs` 加深 `SUBSCRIPTION_CHANGE_FIELDS` 白名单（amount/asset/rail/interval/anchorAt/plan/providerRef/meta），逐键按类型校验；非法键抛 `invalid_event: unsupported subscription change field`；`amount` 还要走 `normalizeAmountString` 且 >0。
- 回归：`__tests__/subscriptions.test.mjs` 加"直接 append 的 changes 不能夹带 status、不能绕过白名单"一条，断言注入被拒、合法 `{amount:'0.01',plan:null}` 通过。
- 经验：白名单型事件的漏洞在**入口校验**，不在业务调用点；调用点白名单挡不住绕过路径。

## 4. 审计项（照单核对）

1. 金额一律字符串 → units，任何环节出现 float 都算洞。
2. 事件类型与字段双白名单，未知类型/字段抛错而不是忽略。
3. 所有 RPC 走 `assertReadOnlyRpc` / `assertReadOnlyRpcBody`（`lib/financial-exit-guard.js`），不新开资金出口；`denyLegacyFinancialExecution()` 保持无条件抛。
4. 只读余额接口失败时返回 `unavailable` + 无值，不得回落为 0（0 会被下游当成"没钱"做决策）。
5. 哈希链只有 hash 无签名 → 整段重写可自洽，只能靠 `expectedHead` 外部锚定缓解；报告要写明这是已知局限，不是 bugfix。
6. `appendEvent` 每次全量读 + 全量校验，事件量大是 O(n²)；分页/增量是性能项，不是正确性项。
7. 红线自检：`find agent-wallet -name '*.jsonl'` 为空、未创建账本、钱包 json 只读 `address`。

## 5. 本次留下的待办（原样记录，供下次核对是否已做）

- P1：`readOnchainBalance` 用 `eth_getBalance` 读的是原生币（ETH），不是 Base USDC；要 USDC 需 `eth_call` + `balanceOf` + `decimals`。会改 `rpc.mjs`。
- P1：哈希链无签名（需密钥 → 属资金/签名边界，不能派给模型席自行加）。
- P2：`appendEvent` 全量校验 O(n²)。
