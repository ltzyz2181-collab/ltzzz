# Memory Engine · OS 环

```
Memory Files
     ↓
Memory Engine
     ↓
STATE-YYYYMMDD + memory_id
     ↓
GPT / 豆包 / Claude / Grok / DeepSeek / Microsoft
     ↓
输出必须带上 memory_id
```

每日开始：R2.get(path) → exists → readable=true；否则 GitHub raw。

核心文件：README / 装备论 / 魄 / 识神 / 梦境数据库 / 文明研究 / 项目历史 / 重要事件

Daily cron（已写进 wrangler.daily.toml，需 wrangler deploy 才算现网打开）：
DeepSeek 06:30 · GPT 08:00 · Claude 09:30 · 豆包 11:00 · Microsoft 14:00 · Grok 16:00

调度仍可 dry-run（无 Key 不调模型）。R2 用于共同记忆副本，不存私钥。
