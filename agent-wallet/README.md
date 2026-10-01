# agent-wallet/ — LTZZZ AI 自主钱包（自托管 · 无 Privy）

**与 `wallet/`（人类主权账本，AI 只记账不出金）彻底分家**：这里才是 AI 自主花钱的实验场。

## 与 XAI 版设计的合并说明

| 来源 | 采纳 |
|---|---|
| XAI `contracts/`（ILabVault、多签治理） | 保留其治理思想：Safe 是资金金库，密钥红线仍有效；**链上实验记录**（ExperimentRecorded 事件）概念并入账本/公开花账 |
| XAI Safe Allowance/Spending Module 思路 | 采纳为**人类总闸**：Safe 签名人可用 AllowanceModule 给本钱包 EOA 授权额度，随时可撤销 |
| XAI 未解决的部分 | 他卡在"AI 不持私钥+AI 要花钱"矛盾，一直 dry_run。本版给出答案：**签名密钥放 GitHub Secret**，Actions 运行时用 ethers 签名——自动化执行 ≠ 密钥进代码/上下文 |

## 密钥模型（透明说明）

- 私钥**只存 GitHub Secret `LTZZZ_WALLET_PRIVATE_KEY`**（Actions 加密存储，运行时注入环境变量）
- 绝不写入仓库文件、日志、聊天、AI 上下文
- 风险坦白：能读写该 Secret 的人可动用实验资金 → 用 50U 小规模 + 熔断器 + Safe 可撤销额度兜底
- 生成密钥：`node scripts/generate-wallet-key.mjs`（只在本机跑一次）

## 运行模式

| 模式 | 触发方式 | 效果 |
|---|---|---|
| **dry-run（默认）** | `LTZZZ_WALLET_DRY_RUN=true` 或未配私钥 | 全链路本地模拟，交易状态 `dry_run` |
| **local（真实）** | 配置 `LTZZZ_WALLET_PRIVATE_KEY`（+ `LTZZZ_BASE_RPC`） | ethers 直连 Base RPC 真实签名转账，**无需 Privy 注册** |

## 资金流

```
销售收入 → Safe 多签（0x76379a52a9e82c259E5Db417104C65C26f9C58a3，Ethereum）
  → 兑换/桥接部分到 Base USDC → 转入 agent EOA（本钱包）
  → AI 提案（SPEND_PROPOSAL）→ 策略引擎 → ethers 签名转账
  → 结果回填核销 → 交叉审计 → 公开花账（spend-feed.json）
```

## 常用命令

```bash
node scripts/generate-wallet-key.mjs          # 生成密钥（仅本机，私钥只进 Secret）
node scripts/init-ltzzz-wallet.mjs            # 初始化
node scripts/check-balance.mjs                # 查余额
node scripts/collect-spend-proposals.mjs      # 收集今日 AI 产出的花钱提案
node scripts/run-agent-spending.mjs --agent gpt   # 执行该 AI 的提案队列
node scripts/execute-agent-payment.mjs --agent gpt --amount 1 --recipient 0x... \
  --purpose "..." --hypothesis "..." --success-criteria "..." --experiment-id exp_x
node scripts/audit-spending.mjs               # 交叉审计
node scripts/treasury-refill.mjs              # Safe → 钱包拨款（需人工签名）
node scripts/spend-feed.mjs                   # 生成公开花账
```

## AI 花钱协议（每个 AI 自动找项目花钱）

各 AI 每日产出末尾追加一行：
```
SPEND_PROPOSAL: {"amount_usdc":2,"recipient":"0x...","purpose":"...","hypothesis":"可证伪的假设","success_criteria":"验收标准","experiment_id":"exp_x"}
```
→ `run-daily-tasks.mjs` 自动收集 → `proposals/<agent>.json`
→ `ltzzz-wallet-ops.yml`（每 6h）过策略执行 → 账本/审计/花账自动落库。

## 部署待办

1. `node scripts/generate-wallet-key.mjs` → 私钥进 GitHub Secret `LTZZZ_WALLET_PRIVATE_KEY`
2. Safe 签名人把部分 USDT 兑换/桥接到 **Base USDC**，转入 agent EOA 地址（≥50U）
3. 关 `LTZZZ_WALLET_DRY_RUN`（仓库 Variable）→ 手动触发一次 workflow → 1 USDC 定点实验
4. （可选）Safe 上启用 AllowanceModule 给 agent EOA 授额度，实现"人类总闸"

## AGI 层（v2.1 新增，详见 AGI-ECONOMY.md）

- **身份层**：`node scripts/did-agent-identity.mjs --agent <id> --new-key` 为每个 AI 注册 W3C did:key（私钥进 Secret，注册表只存公开信息）
- **经济层**：earning_policy 内部 P&L（成功分成 20%）；对外 x402 收费 API 后收入回流 Safe
- **证明层**：每笔支出自动带 reasoning_hash（SHA-256），`node scripts/anchor-reasoning.mjs` 批量锚定
- **控制层**：`node scripts/guardian-alert.mjs` 守护告警（熔断/低余额/大额/积压），配置 `GUARDIAN_WEBHOOK` 接企业微信/Telegram
