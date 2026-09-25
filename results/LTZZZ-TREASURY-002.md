# LTZZZ-TREASURY-002 · v1.1

基准真实 Tx：`0x3df2e54b7eed234a7556f54cc21695326bf62e50261d1557923d3da9198754da`（1 USDT，U卡已收）

| # | 项 | 状态 |
|---|-----|------|
| 1 | results/treasury/ 真实交易 JSON | ✅ |
| 2 | request_id / tx_hash 唯一索引 | ✅ KV idx:request / idx:tx |
| 3 | 链上 receipt 验证 | ✅ eth_getTransactionReceipt（RPC 可配） |
| 4 | ERC20 Transfer topic 检查 | ✅ |
| 5 | 单笔 ≤ 100 | ✅ 硬顶 |
| 6 | 日累计 ≤ 200 | ✅ 硬顶 |
| 7 | 并发/重复保护 | ✅ request_id + tx_hash + lock |
| 8 | 失败记原因 | ✅ fail: |
| 9 | 成功写 Ledger | ✅ ledger: |
|10 | 成功写 Memory | ✅ memory: |
|11 | Dashboard | ✅ treasury-dashboard.html |
|12 | 各 AI 今日额度 | ✅ /dashboard agents |
|13-16 | 无新账号/Key；Safe 不改；3/5 保留 | ✅ |
|17 | 回归测试 | ✅ GET /regression |

Worker: `ltzzz-treasury-v11`  
Dashboard: https://ltzzz.com/treasury-dashboard.html  
