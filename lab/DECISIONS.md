# LTZZZ 决策日志

新决策在顶部。

---

## 2026-09-21 · 确认 CAND-20260921-001/002/003

- Daily 现网 cron = `0 * * * *`，不是六家分时。
- R2 未绑定；禁止写 r2_bound=true。
- 结算/资产复用 KV `63c6bb670cfc42b18b4d232605d5bcad`；出金仍 test mode。
- 微软不部署。

## 2026-09-21 · T022 摘要仍 dry-run

- Patrol 只读 Gateway + Daily `/health`。
- 不塞六把 Key、不宣称六 AI 真在写稿。
- 支付 / 私钥 / 自动发片：仍禁。

## 2026-09-21 · Memory Gateway 现网 + Daily 先巡查

- Gateway 只读：source=github。
- 支付 / 私钥 / 自动发片：仍禁。

## 2026-09-19 · 支付四层 + 凭证云端化

- 人持钥。近期禁止真实支付测试、自动转账。
