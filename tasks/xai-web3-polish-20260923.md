# XAI / Grok 今日打磨任务：LTZZZ Web3 Agent Treasury

状态：READY_FOR_XAI

## Memory Gate
执行前必须先读取：
- `ltzzz-memory/README.md`
- `ltzzz-memory/装备论.md`
- `ltzzz-memory/重要事件.md`
- `docs/web3-agent-treasury-design.md`
- `agent-pay-policy.json`
- `agent-pay-worker.js`
- `auto-withdraw-worker.js`
- `wallet/`
- `finance/`

第一步必须是“观”：先确认哪些是真实部署、哪些只是 dry-run、哪些 API/钱包动作尚未接通；不得凭代码存在推断真实转账已经可用。

## 任务
1. 审查 `agent-pay-worker.js`：保持默认 `human-confirm`，完善 Payment Proposal、额度、白名单、chain/token 校验和 receipt verification 的接口设计。
2. 审查 `auto-withdraw-worker.js`：不得把 `TODO` 或 `AUTO_TEST_MODE` 当作真实出金；如果建议改动，必须明确 real settlement adapter 尚未接入。
3. 对比 Safe Smart Account + Allowance Module 的官方方案，给出 LTZZZ testnet 实验所需最小实现。
4. 研究 x402 / MPP / AgentKit 的边界：分别属于支付协议、支付/结算入口还是 Agent 钱包能力，不得混为公共金库。
5. 设计 `request → proposal → approval → Safe execution → receipt → ledger → Memory` 的闭环。
6. 不修改生产资金额度、不启用主网自动出金、不新增真实支付凭证。
7. 把真实发现写入 `knowledge/daily/xia/`，并在 Result Center 记录执行结果。

## 验收标准
- 有明确的 VERIFIED / DEPLOYED / BLOCKED / FAILED 状态。
- 任何真实资金动作仍需用户最终确认。
- 不声称已经接通真实链上自动提款，除非有 tx_hash + receipt 证据。
