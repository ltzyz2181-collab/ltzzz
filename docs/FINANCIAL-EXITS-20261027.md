# 事实与修订：PR268 资金出口、守卫及旧调用方

原任务 `PLAN-PATCHGATE-ESCROW-20261023`。本文件承接 #268 R1/R4，不授予新付款权限。配置、代码都是 #267 待审候选；没有部署、删除远端 Secret、读取密钥文件、交易或充值。不能称“全项目唯一资金出口”或“链上资产全部冻结”。

## R1：完整的仓内扫描与处置

唯一清单是 `config/financial-exit-inventory.json`：逐文件原字节 SHA256、处置、守卫路径、具体范围。当前登记31个文件；扫描扩展覆盖 JS/MJS/CJS/TS/TSX/Solidity/Python/Shell/PowerShell/BAT/HTML。扫描所有仓内生产源码（含 HTML 内显示示例）；合成测试目录单列，不将测试 Wallet 当真钱出口。新源码不能因文件名含 secret 而免检：这类可执行文件不读其内容并直接拒绝准入。

| 类别 | 文件 | 本候选的处理 |
|---|---|---|
| 历史私钥发现/付款/部署CLI | `scripts/settle-agent-payment.mjs`、`anchor-onchain.mjs`、`settle-order-j1.mjs`、`deploy-registry.mjs`、`aave-owner-funding.mjs`、`treasury-migration.mjs`；`invest-channel/scripts/deploy-vault.mjs`、`invest-channel/adapters/AaveAdapter.mjs` | 替换成无凭据、无网络的失败桩，不能从文档/磁盘找私钥；历史实现留在 Git。不因设置 EXECUTE 或传参数而重新启用。 |
| 新小额USDC转账和签名器工厂 | `scripts/wallet-lib.mjs` | 转账需一次性运行时 permit；直接导出的 localWallet 也需不可伪造的内部 signer capability，不能由只调用工厂绕过。默认支付未启用。 |
| Worker 生产入口与上下文 | `wep3-market.js` | 构造、请求上下文更新均剥离资金私钥，Worker 转发上下文也不再读取/携带 treasury key。secret getter 和 `__proto__` 注入有反例测试。不是删除平台原始 Secret。 |
| Worker 签名/广播库 | `wep3-aave.js`、`wep3-anchor.js`、`wep3-procurement.js`、`wep3-okx-funding.js` | 生产调用经过无资金私钥的 Market；实际 Aave RPC 仅允许只读方法，拒绝 send/sign；签过但未确认的字节不再广播。库中合成 m.env、签名器、fetcher/mock 不能当生产权限。 |
| raw中继 | `scripts/lib/wep3-signed-relay.mjs` | 保留回读和对账，发送 raw RPC 被拒绝。 |
| 外部AI已付请求中继 | `scripts/lib/external-ai-relay.mjs` | 默认真实 relay 提前拒绝，paid_request_attempted_this_run=false；不把守卫拒绝写成已尝试付款。测试显式注入的 fake fetcher 不是公开API输入。 |
| 欧易写客户端 | `scripts/lib/okx-capital-funding.mjs`、`okx-funded-spot.mjs`；调用方 `scripts/fund-okx-owner-round.mjs` | 实际客户端对 POST/写操作在读凭据/HMAC/fetch 之前拒绝；GET查询保留。已完成历史投资不回退、不重下单。 |
| 只读及身份 | `scripts/inspect-funded-round.mjs`、`check-balance.mjs`、`init-ltzzz-wallet.mjs`、`wep3-agents.js` | 查询/地址派生/固定身份挑战不是付款；源文件摘要锁定，增加写能力必须重新审。Market 不再带 treasury key，不能继续对外声称签名控制已启用。 |
| 用户自持钱包交互 | `wallet-lab.html`、`wep3-external-entry.js` | 访客钱包弹窗/客户向LTZZZ入款，是独立外部钱包控制，不是总控豁免支付或本项目托管私钥，不获得20U自主权限。 |
| 外部链上权限 | `invest-channel/contracts/LTZZZVault.sol`、`OwnerAaveFunding.sol` | 新仓内部署入口已退役，但已部署合约受链上权限约束；本轮没有发链上 pause/revoke，也不能用 JS 守卫声称已冻结它们。 |
| 展示代码 | `agi-console.html` | 历史 React 内容字符串内的示例，不是已接通后端 signer。保留检测、摘要与范围记录，不当成上线服务。 |

`financial-exit-inventory.mjs` + `financial-exit-guard.test.mjs` 在每张PR扫描：新 `Wallet/sendTransaction/transfer/signTransaction/broadcast/支付RPC/CEX写端点` 等出现在清单外即失败；既有登记源码摘要变化、守卫消失、目录/状态不明均拒绝，测试含真实反例。只读查询有正例，不靠删除失败用例放行。

这是源码变更审查/已知IO门禁，不能证明任意混淆代码绝无资金副作用。清单和守卫自己变更也是受保护L3审计范围，不是给AI一个可自行签准的白名单。云宿主若可绕过源码直接取得钱包钥匙，或用户在仓外工具签名，必须由实际权限隔离治理，不能由本清单阻止。

## R4：两个旧付款脚本的实际现状

实际读取 GitHub runner：Wallet Operations `run 40446747355`，`job 121999738510`，attempt1，事件 `schedule`，source_commit `31ca14fd22d63a61626a7003c060f689aa42afe4`，2026-10-27 03:54:18 UTC 开始。日志包含 `LTZZZ_WALLET_DRY_RUN: true`、“余额（dry-run模拟）50USDC”，六席均“无待执行提案”。这是实际定时运行，但不是API充值、云续费或真实转账证据。

- `run-agent-spending.mjs`：仓内唯一自动入口是 `.github/workflows/ltzzz-wallet-ops.yml` 的每六小时调用。候选已固定 `LTZZZ_WALLET_DRY_RUN: 'true'` 并移除该工作流的 wallet private-key Secret 传递，不能仅改仓库变量就恢复真付款；脚本本身真实模式也提前拒绝，不写失败账本冒充花款。
- `execute-agent-payment.mjs`：全工作流检索没有调用；是手动CLI，仓外电脑/终端的历史调用未验证，不能称从未用过。候选真实模式提前拒绝；明确模拟才沿原路径模拟。

最近工作流成功不能证明发生付款，更不能证明两条脚本曾承担过“AI API充值/云续费”。未来替代路径是登记预算/收款与用途、千问豆包原生双签、公开24h冷却、阶梯额度、串行持久预留的 `createSmallPaymentService`，接真实结算/审计/alarm适配后另审；它目前没有上线，不能把旧CLI换个名字就宣称替代可用。

## 原基线回归问题（保留）

扩大回归在未修改 head `90b0c06b…` 的隔离 worktree 复现：`wep3-worker.js:138` 使用未定义 `path`，影响swarm和Kimi署名路由；另有旧 `wep3-runner` 用例与当前关停行为不一致。此源文件不是本修订改动，未顺手重写 Worker 路由。完整 baseline/current 结果在 `knowledge/results/patchgate/post268/`。这些问题不能算本修订修复，也不能称WEP3全量CI绿灯；资金开关继续关闭。

#271决定的本次修订已删除owner密钥激活确认；详见SMALL-PAYMENT-AUTONOMY-20261027.md。旧post268清单与#268/#270审计只适用于48f03b92，不能据此称新head通过。
