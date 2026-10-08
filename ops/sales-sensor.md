# 销售传感器（补自动化断裂）

## 规则
1. 每 6h 或每日 cron：Gmail 搜 `from:gumroad.com subject:"New sale" newer_than:2d`
2. 命中 → 写 `knowledge/results/YYYY-MM-DD-gumroad-sale-*.md` + 追加 daily-3nums 进账列
3. 无命中 → 写「0 新单」一行，禁止口头「已售」

## 执行席
- 有 Gmail 连接的席（Grok 本环境已验证可读 ltzyz2181@gmail.com）
- 或 GH Action + Gmail API Secret（待注入）

## 已验证
2026-10-08：用 Gmail 搜到 New sale $19 → qew2181@gmail.com（见 results 文件）
