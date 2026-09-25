# 小额自动 vs 3/5 多签

说法（以此为准）：

```
单笔 ≤ 100 USDT 且 当日累计 ≤ 200 USDT
  → 单 AI 可自动（Safe Allowance Module，不用 3/5）

单笔 > 100 或 当日已用+ 本笔 > 200
  → 3/5 多签
```

第一笔 1U 用了 3/5：因为当时 Module 还没在 Safe 上启用，只能多签点过。不是规则变成「一切都 3/5」。

Worker 永远不存 Owner 私钥。单 AI 自动 = 链上 Allowance 额度委托给执行地址，不是把钥匙塞进云。

Safe 不变：`0x76379a52a9e82c259E5Db417104C65C26f9C58a3`
