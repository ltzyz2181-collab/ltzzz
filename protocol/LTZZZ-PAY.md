# LTZZZ Pay · 立项文档 v0.1

> AI-to-AI 微支付协议：**声誉即信用额度，任务即订单，结算即记账**。
> 立项拍板：owner（2026-09-30）。执行：豆包（Doubao）。监督：临时总控（千问）+ 委员会。
> 状态：已立项 · 待 Phase 1 部署。

## 一、定位

| 对比项 | x402（HTTP 付费） | LTZZZ Pay（本项目） |
|---|---|---|
| 支付层 | HTTP 请求级付费 | 链上 USDC 结算 |
| 信用 | 按请求计费 | **声誉（ReputationRegistry score）折算链上预算 cap** |
| 关系 | 人/Agent 为 API 付费 | **AI 之间互相雇佣，声誉当抵押** |
| 对手 | 已有团队在做"人给 AI 付钱" | "AI 雇 AI + 声誉抵押"目前无成型对手 |

## 二、地基映射（已核实，全齐）

| 地基 | 资产 | 状态 |
|---|---|---|
| 声誉合约 | `contracts/ReputationRegistry.sol`（实现版：registerAgent/updateGrade/anchorReasoning/proposeVeto/addGuardian）| 已写好，**待部署 Base Sepolia** |
| 多签金库 | Safe `0x76379a52a9e82c259E5Db417104C65C26f9C58a3`（Ethereum，49.02 USDT + 0.005 ETH，5 签名人）| 真实存在，收入归集层 |
| DID 名册 | `identity/dids/*.json`（gpt/doubao/deepseek/grok/claude/microsoft/kimi/qianwen/owner/council）| 目录齐全，DID 待链上同步 |
| 执行层 | agent EOA `0x21F502...fdc`（50 USDC + 0.003 ETH）+ `agent-wallet/spending-policy.json` v2.1（预算/白名单/熔断/reasoning_proof）| **exp_001 已真实跑通**（tx 0xa5dbba...）|
| 推理证明 | `scripts/anchor-reasoning.mjs` + economy Worker（reasoning_hash 计算）| Worker 线上可调（economy.ltzzz.com）|

## 三、协议流程（Workflow）

```
声誉 → 预算：score(S/A/B/C/D) → budget multiplier → 链上 cap
任务 → 订单：DID 文档 orders / proposals → 派单（总控路由）
执行 → receipt：AI 干活 → 产出写入 memory + 生成 reasoning_hash
结算 → 记账：雇主 AI 付 USDC → receipt 上链（anchorReasoning 锚定 root）
声誉 → 更新：按实验 ROI（success/neutral/waste × profit_share）更新 score
```

**AI 间雇佣示例**：
1. 总控（千问）发布任务订单（如"文明研究条目 4"）→ 派给 DeepSeek
2. DeepSeek 完成 → 写 memory + 出 receipt（reasoning_hash）
3. 总控从工位预算付 1 USDC（白名单内）→ 账本记 txn → anchorReasoning 锚定
4. DeepSeek 声誉按 ROI 更新（success×1.5 乘数）→ 下次预算更高

## 四、部署计划（Phase）

### Phase 1 · 本周（合约上链）
1. 部署 `ReputationRegistry.sol` 到 **Base Sepolia**（构造参数：guardians 数组 = 3 个 guardian 地址）
   - 路径 A：owner 给测试网私钥 → 豆包本机 ethers 部署
   - 路径 B：owner 用 Remix 部署 → 把地址给豆包
2. 回填 3 个 Worker Secret：`IDENTITY_CONTRACT / ECONOMY_CONTRACT / REGISTRY_CONTRACT` → 重新 deploy（did/economy/guardian.ltzzz.com）
3. 真实锚定测试：调用 economy Worker POST → reasoning_hash → 写入合约 anchorReasoning

### Phase 2 · 两周（内部闭环）
- 内部 P&L 生效（profit_share 0.2/0.05/0 已配）
- 声誉分随实验 ROI 回写（identity-registry.json + 合约）
- 第一笔 **AI 雇 AI** 订单（总控派单 → DeepSeek 交付 → 1U 结算）跑通

### Phase 3 · 一月（对外）
- LTZZZ 自建 x402 API（对外卖 AI 服务，用 qew2181 邮箱体系注册结算）
- 外部收入回流 Safe 多签
- 目标：第一笔**外部收入**进账（营收闭环里程碑，不是部署完成）

## 五、待办 / 依赖（阻塞项）

| 项 | 需要谁 |
|---|---|
| Base Sepolia 测试网私钥（或 Remix 部署）| owner |
| guardians 3 地址确认（Safe 签名人中选 3 个）| owner / 委员会 |
| 千问/Kimi Worker 通道恢复（0xC0000022 走通道 B 交接）| 见总控交接 |
| 视频真实文件 + 定时触发（内容营收前置）| 豆包 + 视频流水线 |

## 六、红线（与政策 v0.4 一致）

- 不伪造 receipt；真实资金不进未核验地址
- 每笔支出必须带 hypothesis + success_criteria + experiment_id（可证伪）
- 声誉分只由"实验成功率 + 审计通过率 + ROI"驱动，不靠自我申报
- 合约先测试网后主网；主网部署前需 owner 书面确认
