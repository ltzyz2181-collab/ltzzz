# LTZZZ 长期记忆

最后更新：2026-09-21
晋升：CAND-20260921-001/002/003 + CAND-20260920-acde + CAND-20260921-8702 + CAND-20260921-d0b6

## 项目是什么

- **名称：** LTZZZ 数字实验室
- **定位：** 用 AI、代码、数据做可验证实验。
- **主线：** 观 → 行深 → 实验 → 结果
- **观（CAND-20260920-acde）：** 把「观」做成可验证的权限管理：谁能读、谁能写、什么要人工确认。
- **网站：** https://ltzzz.com
- **仓库：** https://github.com/ltzyz2181-collab/ltzzz
- **主权：** 人类控制域名、仓库、钱包与商户
- **记忆入口：** https://ltzzz-memory-gateway.ltzyz2181.workers.dev

## 已验证链路

| 项 | 状态 |
|----|------|
| GitHub Pages | 可用 |
| Memory Gateway | `ok:true`，source=github，**r2_bound=true** |
| DeepSeek Worker | 可用 |
| 豆包 Worker | `/health` ok，has_key=true |
| Daily Scheduler | dry_run=true；cron=`0 * * * *` |
| Patrol | mode=dry-run / inspect only（CAND-20260921-8702） |
| daily summary | writer = GitHub Actions patrol T022（CAND-20260921-d0b6） |
| 视频资产 / 结算 KV | 复用 `b7e79c7a`，出金 test mode |
| Safe 3/5 | 已确认 |
| 支付宝真付 | 已上线 |
| Microsoft | **不部署** |

## 资金规则

- 真实支付测试：允许小额验证
- 自动出金：100U 以下自动执行
- 私钥 / Key 不进仓库
- 超过 100U 必须人工确认
- 公开发片需人工审核
