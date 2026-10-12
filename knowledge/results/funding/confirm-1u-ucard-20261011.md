# 1U 分录升 confirmed · 确认记录（2026-10-11 豆包）

- 分录：TX-20260925-1U-UCARD（1 USDT → U 卡收款 0x1893A134aa6eA22E8C08518B559E1706f4Da0eF7）
- 结论：**确认升 confirmed**（证据链两家齐，owner 可改状态列）
- 证据链（独立可复核）：
  - tx hash：`0x3df2e54b…98754da`（TX-20260925-1U-UCARD）
  - block：26051851 · status=0x1 · blockHash `0x8d6fe5cc…3a6ad3`
  - 链/路径：Ethereum 主网，Safe 0x76379a…58a3 → 0x1893…0eF7（USDT Transfer，Safe 内部 call，value=0x0 属 execTransaction 特征）
  - 交叉验证：eth.drpc.org 等两家 RPC 一致（10-05 归档 wallet/evidence/）
- 边界（仍不标 full confirmed 的部分）：5.99U 去向维持 NEEDS_CHECK（无独立 receipt，不合并同笔）；"到账后是否仍持有"以链上实时余额为准
- 5U 链路（F）：只剩"真实提现发生"前置；提现网络确认后自动跑并记 receipt
