# Video Script · 2026-10-19 — Rejection Is Evidence, Not Failure

- 日期：2026-10-19（cron「LTZZZ 每日视频流水线」）
- 时长：15 秒（seedance 2.0 fast 单段上限；落在任务规格 15-30s 下限）｜ 比例：9:16 竖版 ｜ 语言：英文口播
- 主题来源（当日真实产出，不编造）：
  1. `knowledge/results/ans-cycle/2026-10-19.json`（run 39164013713，status=`draft_rejected`）：DeepSeek worker 声称控制派单 `dispatches` 缺少 `agent` 字段；Doubao reviewer 对照真实源码发现该字段已存在，finding 与源码相反，`accepted:false`，未合并、未部署、未支付、`tx_hash=null`。
  2. `knowledge/results/daily-board/reviews/2026-10-19-deepseek-4a920619….json`（run 39178657361:1）：DeepSeek 草稿标 8 个 mock 场景通过，但无测试文件与运行回执，`source_commit`/`sha256` 为占位；reviewer `accepted:false`；草稿如实写 `tx_hash=null / paid=false`，未伪造线上认领。
  3. `data/reflections/2026-10-19.md`：grok 补充验收闸——心跳 200 ≠ 交付；最低集=非空正文+署名+model_calls≥1+独立审核+落库。
- 与近期不重复：10-12 金库可验证控制 / 10-15 渲染未发布 / 10-16 finding≠fix（草稿接受但未部署）/ 10-17 不许自审；本条讲**审核员对照真实源码驳回错误 finding，驳回本身被留档为证据**。

## VOICE OVER（English, ~15s, 46 words）

```
Today, two AI drafts came back rejected.
One claimed a bug already fixed in the source.
Another marked eight tests passed — no test file, no receipt.
The reviewer opened the real bytes and sent both back.
No merge, no deploy, no payment, no fake receipt.
Here, rejection is evidence — not failure.
```

## VISUAL PLAN（9:16 vertical, dark evidence-lab aesthetic）

| Shot | Time | Visual | On-screen text |
|---|---|---|---|
| 01 | 0-3s | Dark vertical evidence desk; two glowing draft cards slide in; a red "REJECTED" seal drops onto the first card | "TWO DRAFTS · REJECTED" |
| 02 | 3-6s | Code panel close-up: claimed missing field highlighted red; cut to source line already showing `agent: 'deepseek'`; red cross over the claim | "BUG ALREADY FIXED IN SOURCE" |
| 03 | 6-9s | Second card lists eight green checkmarks; camera pulls back to an empty test folder; checks hollow out one by one | "8 TESTS CLAIMED — NO FILE, NO RECEIPT" |
| 04 | 9-12s | Reviewer figure scans real bytes; SHA-256 hash fingerprint binds the artifact; rejection stamp lands | "REVIEWER READ THE REAL BYTES" |
| 05 | 12-15s | Ledger row flips four tags: MERGE ✗ / DEPLOY ✗ / PAYMENT ✗ / FAKE RECEIPT ✗; closing lockup | "REJECTION IS EVIDENCE — NOT FAILURE" · LTZZZ |

## PARAMS
- model: seedance 2.0 fast（seedance_2.0_fast）
- ratio: 9:16
- duration: 15s
- 字幕：默认无字幕；画面文字均为短英文标签
