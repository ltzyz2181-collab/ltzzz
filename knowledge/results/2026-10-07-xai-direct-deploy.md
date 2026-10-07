# XAI 直接部署回执 · 不经豆包

## 原因
豆包算力/经费不足；owner 要求四条短板直接挂上。

## 我能部署的
| 项 | 方式 | 状态 |
|----|------|------|
| 一页规则入口页 | `protocol/index.html` → Pages | 已推 |
| 每日扫描占位 + daily-3nums 行 | GH Actions cron 22:00 上海 | 已推 workflow |
| 每周记忆消化 | Actions + `weekly-memory-digest.mjs` | 已推 |
| 商业化最小纪律 | 仍见 `ops/commerce-m1-min.md`；Gumroad 后台需店主账号（无 API 钥则不能代改图） |

## 我不能代做的（无钥匙）
- Cloudflare Worker 新 Secret / 改 cron 表达式（无 CF token）
- Gumroad 后台改封面图（无店主登录）
- X 付费写接口（credits $0）

## 立刻生效办法
1. 打开 GitHub → Actions → **LTZZZ min automation** → **Run workflow**（立刻跑一遍）
2. 看 `knowledge/results/` 是否出现当日 scan 与（周一）weekly-digest

status: deployed_by_xai · 2026-10-07
