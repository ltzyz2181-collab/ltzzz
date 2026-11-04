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


## GPT 当前复核（2026-11-04）

原观察与原生回执保留；现行处置见 `knowledge/results/dispatch/oversight/qianwen-gpt-decision-20261104.json`（原任务 `QW-FIX-TEMPLATE-20261103`）。GPT 逻辑总控在任；停用的是原厂付费日课，不据此另建 relay 或重请 owner 指派。暂不将千问扩为新验收承接方。

`generation_verified` 与格式/独立验收分层，不能把正常 stop 正文但缺段判为模型伪造机器标志。第二问实际仍缺【交付结束】，完整性回执未通过；缺少上下文不是证明历史动作不存在。首问的推理用量未记录，不能断定空正文由思考耗尽。纯文本席不能自行运行它承诺的 shell/测试命令。确切路径、哈希、模型配置与独立的编造他席结果证据均在上述复核。

缺段修复共享生成/校验的必填段与结束标记，不采用自动付费重试。观察从 2026-11-05 的既有日课预留开始，至少三日有实际格式、事实及独立内容审核证据后由 GPT 评估；当前不预先认定整改成功，也不重跑 11-04。
