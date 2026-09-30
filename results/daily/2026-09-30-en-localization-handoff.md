# EN Localization Handoff → Doubao · 2026-09-30

- **From**: did:ltzzz:kimi-global（LTZZZ 境外任务工位 / Kimi）
- **To**: 豆包（doubao-daily，今日 patrol 显示 has_key: true）
- **Source material**: `results/daily/2026-09-24-script.md`（中文短视频销售脚本）
- **Rule**: 英文本地化各 1 条（X + YouTube），发布动作由豆包按各平台真实授权状态执行；不得伪造发布成功。

---

## 1. X (Twitter) — 1 post, EN

```
Tired of answering the same customer questions 30 times a day?

LTZZZ AI runs your customer service, data dashboards & weekly reports 24/7 — for the price of a lunch.

Your time is for growth, not grind. 🤖
https://ltzzz.com

#AIautomation #Solopreneur #SmallBusiness
```

- 字数：约 280 字符内，可直接发。
- 本地化说明：原文价格钩子（¥49/¥99/¥599/¥2999 人民币）改为 "for the price of a lunch"——境外收款通道尚未开通（见当日 Stripe Atlas 调研），不在英文内容中标注具体美元价格，避免无法履约的报价。

## 2. YouTube — 1 package, EN（Shorts 规格，约 40 秒）

**Title:**
```
Stop Doing Robot Work — Let AI Run the Boring 80% of Your Business
```

**Description:**
```
You didn't start a business to copy-paste data and answer the same DMs all day.

LTZZZ builds AI agents that handle the repetitive work:
• AI customer service that replies 24/7
• Dashboards that update themselves
• Weekly reports drafted in minutes

Built by a human + 6 AIs working together. See how it works → https://ltzzz.com

#AIautomation #SmallBusiness #Productivity #AIagents
```

**Tags:** AI automation, small business, AI agents, solopreneur, productivity, customer service bot, LTZZZ

**Script（口播稿，本地化自 2026-09-24 中文脚本）:**

```
[0–3s | HOOK — tired face at laptop, pile of spreadsheets]
"All this busywork? AI finishes it in half an hour."

[3–10s | PAIN — quick cuts: 99+ unread chats, endless Excel cells, rewritten report drafts]
"Sound familiar?
Customers ask the same questions — you answer them thirty times a day.
Weekly reports — same numbers, new formatting, every single week.
One social post — and you stare at a blank page for an hour.
That's robot work. You are not the robot."

[10–25s | SOLUTION — LTZZZ product UI quick cuts: auto-reply, live dashboard, one-click report]
"LTZZZ does the robot work for you.
An AI service bot that answers customers at 3 AM without coffee.
A dashboard that pulls your numbers by itself.
A weekly report drafted in ten minutes.
The hours you save? Spend them on clients, product, family — anything but copy-paste."

[25–35s | VALUE ANCHOR — price card, no exact figures]
"Entry tier costs less than a lunch and buys back two hours a day.
Full stack costs less than half a month's salary — for an AI team that never sleeps.
Do the math."

[35–40s | CTA — point to link]
"Link in the description. One day earlier with AI, one day earlier out of the grind."
```

**本地化说明：**
- 原脚本发布平台为抖音/视频号/小红书/朋友圈，本版改为 YouTube（Shorts 节奏，竖屏 40s）。
- "小黄车/评论区扣1" 改为 "Link in the description"（境外平台无小黄车机制）。
- 价格锚点保留对比逻辑，不含具体美元报价（原因同上：境外收款未开通）。

---

## next（豆包执行清单）
1. X：若 X Worker 凭证有效（注意：deployment-status.md 标注 X 凭证曾在聊天中暴露、需轮换；轮换完成前不得发布），发上面的 X 文案，记录 tweet URL。
2. YouTube：若 OAuth 可用（redirect URI 以 results/status-board.md 为准），用上面的 title/description/tags 上传今日 MP4，`privacyStatus=private` 先行，记录 video ID。
3. 两个平台任一凭证不可用 → 如实记录 blocked + 原因，不伪造成功。
4. 发布结果写入 `results/`，回链本文件。
