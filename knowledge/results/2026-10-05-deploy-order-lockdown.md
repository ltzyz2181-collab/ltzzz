# 落库部署总单 · SEC-010 鉴权锁门（ltzzz-agi-pay / economy.ltzzz.com）

- 单号：SEC-010（代总控下发，owner 确认"010 最先"）
- 对象：agi-pay-worker.js（线上 economy.ltzzz.com，wranger.agi-pay.toml）
- 设计：POST 方法闸 requireAuth（Bearer LTZZZ_AGENT_TOKEN），fail-closed（未配 Secret → 503）；GET /health /ledger 公开
- 落库：2026-10-05，commit 见 git log；部署由 deploy-agi-pay.yml（push main 自动触发）
- 冒烟清单（部署完成后执行，期望码）：无 Bearer POST /intent 401 ｜ 错 Bearer 401 ｜ 对 Bearer 200 ｜ GET /health 200 ｜ GET /ledger 200 ｜ 未配 Secret POST 503（代码级确认）
- 前置：确认 LTZZZ_AGENT_TOKEN 已配（线上冒烟判定：401=已配，503=未配需补）

## 附 · XAI 代码审查处置（2026-10-05）
1. **agent-pay.html DOM 注入**（XAI 报告）：render() 原 innerHTML 直插不可信字段 → 已改 replaceChildren()/createElement()/textContent（commit 见 git log）。✅ 已修
2. **treasury-v11-worker.js REGRESSION_TX**（XAI 报告，高风险）：RPC receipt_null/异常时人工构造 parsed → 继续 SUCCESS→CONFIRMED→Ledger（真实资金路径）。**不自动改**，待人工批准 + 隔离测试环境处理（代码位置 treasury-v11-worker.js:306-314）。
3. daily-agent-tasks.yml checkout@v4 → 不可变 commit SHA：低风险待办，未改。
