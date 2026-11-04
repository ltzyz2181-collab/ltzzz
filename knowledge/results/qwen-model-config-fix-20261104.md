# 千问模型配置排查与修复（2026-11-04，owner 指令）

## 问题
千问「天天出错」：11-04 日课缺【派单监督】段（accepted=false、incomplete_or_failed）；质询首轮空输出（finish_reason=length、output=null）。owner 要求判断是能力问题还是模型配置问题，并为其选择模型。

## 排查路径（对齐 kimi 524 排查）
1. 代码链：`scripts/call-qwen.mjs`、`scripts/lib/qwen-config.mjs`、`scripts/run-qwen-dispatch.mjs`、`scripts/run-daily-tasks.mjs`、`qianwen-proxy-worker.js`。
2. health 实测：api-qianwen.ltzzz.com/health = 200（configured_model=qwen-plus、model_override_configured=true、has_key=true、generation_verified=false）；大陆出口对 CF 边缘 IP 172.67.x 段偶发超时、104.21.x 段可达（非 worker 故障，CI 08:42 回执 provider-execution-41801393541 同时段 200）。workers.dev 端点受大陆 DNS 污染不可达（card.json 主用自定义域即可）。
3. 输入规模实测：六份核心记忆合计 57,955 字节 ≈ 27k 输入 tokens（与 11-04 日课 tokens_used=27841 吻合）。

## 根因（配置问题，非能力问题）
- 日课调用 `run-daily-tasks.mjs` → `mod.callAgent({apiKey, prompt})` **不传 maxTokens** → `call-qwen.mjs` 默认 **2048**。
- 任务要求 6 段完整输出（读后感/观/行深/不确定/角色产出【派单监督】/交付结束），输入已 27k tokens；2048 输出预算被截断（finish_reason=length）→ 缺【派单监督】段。
- 质询首轮同因：2048 上限 + 长质询 → 空输出。第二轮强制短答（≤800 字）→ stop、1994 tokens 完整作答，反证模型能力足够。
- 结论：**不是千问模型能力问题，是调用侧输出预算配置不足**。

## 修复（commit 待填）
- `scripts/call-qwen.mjs`：默认 maxTokens 2048 → **4096**（= call 上限；与日课 27k 输入/6 段输出的任务匹配；无需升级 qwen-max）。
- 未改：`run-qwen-dispatch.mjs` qwen ceiling 2048 —— 刻意护栏（注释+测试锁定，防 kimi 借 qwen 通道拉高 token），dispatch 短任务 2048 足够（第二轮短答实证）。

## 验证
- `node --test scripts/tests/qwen-native.test.mjs scripts/tests/qwen-dispatch.test.mjs`：22/22 pass（maxTokens 0 / 10000 仍拒，上限不变）。

## 模型选型结论（owner 拍板项）
- **保持 qwen-plus**：总控监督/中文审阅任务匹配，4096 预算后无需 qwen-max；若日后长任务仍频发截断，再评估 qwen-max（更强输出、成本更高）。
- 可选观测：proxy 的 `body.model || env.QWEN_MODEL` 使显式 body.model 覆盖环境覆盖项（对齐 kimi 修复的潜在点）；当前无调用方显式传 model，未改，列入观察。

## 记账
- paid=false、tx_hash=null、income=0；无密钥改动、无资金动作。
