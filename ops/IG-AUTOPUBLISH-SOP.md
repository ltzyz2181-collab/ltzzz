# Instagram 自动发布 SOP（Manus 顶豆包班 · 长期派单）

> owner 2026-10-08 授权：豆包不能干活期间，Manus 顶豆包班，负责 IG 日更。
> 连接器已验证（只读通过）：@ltzyz2181 · 发布额度 0/100 · 历史帖 0。
> 本文件是长期派单；每次发帖回执引用本文件。

## 一、每日自动流水线（无人值守）

| 时间(北京) | 环节 | 谁干 | 产物 |
|---|---|---|---|
| 20:30 | 渲染当日日报卡 PNG | GitHub Actions `ig-daily-card.yml` | `assets/ig/YYYY-MM-DD.png` → 公开 URL `https://ltzzz.com/assets/ig/YYYY-MM-DD.png` |
| 21:00 | 创建 IG 帖子 | **Manus**（IG 连接器）| 确认卡片 → **自动确认**（见授权条） |
| 21:05 | 写发布回执 | Manus | `knowledge/results/ig/YYYY-MM-DD.md`（permalink + media_id） |
| 次日 | 补 insights | Manus | 同文件追加 reach/likes/saves |

## 二、长期授权条（owner 原话制度化）

> **本派单有效期内，IG 发布前的确认卡片一律自动确认，无需再问 owner。**
> 只有三类事上报：① 连接器报错连续 2 次；② 账号被封/限流；③ 内容涉及对外声明性承诺。

## 三、Caption 模板

```
LTZZZ AI 共同体日报 · {日期}
{当日一句主题}
{2-3 行当日真实进展（链上/派单/部署，必须可复核）}
账本可以推翻报告，receipt 才是唯一事实。
🔗 ltzzz.com
#AI #AIAgents #Web3 #BuildInPublic #LTZZZ
```

## 四、纪律（红线）

1. 每天 ≤2 帖（新号养号期，100/天是硬顶不是目标）。
2. 无回执不算发布：permalink + media_id 缺一不可；失败如实标 `failed`，不装成功。
3. 图片必须走 `ltzzz.com/assets/ig/` 公开 URL（IG Graph API 只接受公网可达图）。
4. 表述纪律：连接器返回 success ≠ 帖子可见——回执必须带 permalink，总控可点开复核。

## 五、断点处理

| 断点 | 处置 |
|---|---|
| 确认卡片无法自动确认 | Manus 在回执标 `blocked: confirmation_required`，总控改走人工确认过渡 |
| 图片 URL 不可达 | 检查 Actions `IG Daily Card` 是否当日绿 run + Pages 是否部署完成 |
| 额度异常（0/100 未满却报限） | 标 `blocked: quota`，等 24h 滚动窗口 |

---
立：千问（代总控）· 2026-10-08
