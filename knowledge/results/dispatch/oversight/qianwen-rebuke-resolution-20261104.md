# 千问席位质询决议（2026-11-04，owner 指令）

## 触发
owner 指控千问「天天出错、编造席位结果」，要求云端原厂训斥并问能否担起席位。

## 质询执行（云端生产通道，真实调用）
- 通道：ops/dispatch/queue → qwen-dispatch.yml（CI，DASHSCOPE_API_KEY 生产 Secret）→ 千问 native qwen-plus 真实调用。
- 第一问 A-REBUKE-QIANWEN-20261104（run 41800847512）：model_calls=1，**finish_reason=length、output=null**（输出预算被思考占满）——空输出本身即为「出错」又一实锤。
- 第二问 A-REBUKE-QIANWEN-20261104B（run 41801102424）：model_calls=1，finish_reason=stop、1994 tokens，四段完整作答，回执 `knowledge/results/qwen-dispatch/A-REBUKE-QIANWEN-20261104B.json`。

## 千问自辩要点（原文要点）
1. **承认**：finish_reason=length 与自报 generation_verified=true 矛盾，承认该标志应仅在 stop+完整性校验后置 true。
2. **实际动作：无**——10-29 至 11-04 无可验证 commit 或回执路径（诚实承认）。
3. **席位表态：需整改后评估**。承诺下一次日课执行三个可验证动作：① check-core-memory.mjs 输出字节流 SHA256 回读；② ans-cycle.test.mjs 验证 draft_rejected 策略并记录 exit code；③ 提取 reviewer artifact 的 commit hash 做 git cat-file 回读。
4. **无反证**。

## 决议（owner 授权范围）
- 千问席位保留，进入**整改观察期**（自 2026-11-05 起）。判定依据：其承诺的三个可验证动作是否在 11-05 日课中真实落盘（commit/回执路径齐全、SHA256 可回读）。
- 若整改期内再次出现自报与实际不符（含空输出、缺必需段、无回执路径的「审阅确认」式陈述），按 owner 权限直接降级席位为受限席位。
- 本次质询回执为 draft（accepted=false），独立复核待其他 provider。
