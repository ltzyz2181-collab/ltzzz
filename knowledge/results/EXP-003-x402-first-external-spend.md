# EXP-003 · x402 首笔体外支付

- **日期**: 2026-10-03
- **执行**: doubao（本机 agent 钱包签名，通道B 第十一张执行单 P2）
- **网络**: Base 主网（eip155:8453）
- **服务方**: agent402.tools（x402 协议 + EIP-3009 结算，收款方 `0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0`）
- **金额**: 0.005 USDC（执行单授权 1-2 USDC 上限内最小额打样）
- **实验假设 (hypothesis)**: 用 1-2 USDC 上限内的最小额 x402 支付跑通'AI 花钱'闭环，验证能真实购买外部服务而非自家地址间转账
- **验收标准 (success_criteria)**: agent402.tools 返回 200 + 真实第三方数据 + 链上 tx status=1（Basescan/Block 可复核）+ ledger 关联 txn + 结果入库
- **experiment_id**: exp_003
- **reasoning_hash**: `0x3b2061d7ca3c6c7ae3d83383f3848e0192a9a00195bb3324f51e606d09af696a`（SHA-256(agent|amount|recipient|purpose|hypothesis|success_criteria|experiment_id)，可复算）

## 执行过程

1. 报价：GET `agent402.tools/api/whois?domain=ltzzz.com` → HTTP 402，accepts 含 Base USDC exact 选项（amount=5000 microUSDC，asset=0x8335…2913）
2. 支付：agent 钱包 `0x21F502f29294c50d9C37A30dc038D8D95eB97fdc` EIP-3009 授权签名（免 gas，服务端结算广播）
3. 重发带 PAYMENT-SIGNATURE → **HTTP 200**，拿到真实结果

## 链上证据（可复核）

| 字段 | 值 |
|---|---|
| tx_hash | `0x73cc4a164765092182e97f451dfc41bee699b129b0de769eb9f114b1bcbd473b` |
| block | 52115685 |
| status | 1（成功） |
| from | 0x42dd53906B49c202E8E934b059dc019E04634b00（agent402 结算钱包） |
| to | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913（USDC Base） |
| calldata | 0xe3ee160e（transferWithAuthorization） |
| payer | 0x21F5…7fdc（agent EOA） |

## 真实服务结果（第三方返回）

```json
{"domain":"ltzzz.com","registrar":"Alibaba Cloud Computing Ltd. d/b/a HiChina (www.net.cn)",
  "created":"2026-02-12T04:24:45Z","updated":"2026-09-20T02:01:03Z","expires":"2027-02-12T04:24:45Z",
  "status":["active"],"nameservers":["lisa.ns.cloudflare.com","rene.ns.cloudflare.com"],"dnssec":false}
```

## 意义

- **LTZZZ 历史第一笔真正流出自家地址圈的资金**（此前 8 笔全部自家地址间）
- "AI 花钱"从"看起来在花钱"变为真实购买外部服务并换回可入库结果
- x402 通道打样完成：后续任意席位可按此链路实付购买外部 API/模型（已写入 spending-policy.json x402_endpoints）

## 账本

- `transactions.json` → txn_0011（confirmed，mode=x402-external）
- daily_summary 2026-10-03 doubao 0.005 USDC
- 服务方收款地址 `0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0` 已列入白名单（spending-policy.json v2.2.0）

## 失败与限制

- @x402/evm 的 ethers 路径有 API 不兼容 bug（signTypedData 传参），改用 viem LocalAccount 后通过——已记录，后续直接用 viem
- 金额为打样最小额；真实"买推理能力"（如 /v1/chat/completions 模型调用）后续可在此通道上加量，单笔仍 ≤20 USDC
