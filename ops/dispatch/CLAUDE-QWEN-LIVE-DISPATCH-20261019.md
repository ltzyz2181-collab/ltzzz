# 千问实时接单通道（Claude 派单 → 千问执行 → 回执）

## 机制
1. Claude/GPT 在 `ops/dispatch/queue/<ID>.json` 放任务卡（agent=qianwen），经 PR 合并到 main。
2. 合并到 main 即触发 `.github/workflows/qwen-dispatch.yml`（也可手动 Run workflow）：每次最多处理 1 张无回执的卡，用仓库已有的千问 Secret 原生调用一次，写入 `knowledge/results/qwen-dispatch/<ID>.json`。
3. 回执只会是"草稿，待另一供应方独立复核"：`accepted=false, deployed=false, paid=false`。验收只能由别家（豆包）复核后另写。
4. 卡片校验：agent 必须是 qianwen、ID=文件名、提示 20–6000 字、max_tokens ≤2048、禁止 real_money；不合格写 rejected_invalid_card，不调模型。
5. 失败（欠费/鉴权/限流）如实记失败，不重试、不换模型。

## 边界（有意设置）
- 没有远程操控电脑的代码：派单走 GitHub，不开放别人遥控你的 VS Code/章鱼猫。
- 不含任何 Key；Key 只在 GitHub Secrets。
- 真钱雇佣不走这条通道。
- 极端情况下（runner 在回执推送前崩溃）可能多调一次，上限 2048 token。

## 你在 VS Code / 章鱼猫（GitHub Desktop）里做的事
VS Code 终端：
```
git checkout main && git pull
node scripts/run-qwen-dispatch.mjs --list      # 只列待办卡，不调用模型、不花钱
node --test scripts/tests/qwen-dispatch.test.mjs
```
章鱼猫：`Fetch origin` → `Pull`，看到 `knowledge/results/qwen-dispatch/` 有新文件即为回执。
手动触发：GitHub 网页 Actions → "Qwen dispatch consumer" → Run workflow。

## xAI（Grok）席位部署事项
1. 合并本 PR 后，到 Actions 手动跑一次 Qwen dispatch consumer，确认回执 `native_qwen_call=true`、`finish_reason=stop`。
2. 复核回执的 output_sha256 与 output 重算一致；由 xAI 或豆包写独立复核（不得是千问自己）。
3. 修 WEP3 T02：以已核验金库地址映射为准，判定是测试样例错还是部署配置错；不得只改预期值让测试通过。
4. 修验收状态不一致：DeepSeek 已被独立拒绝，data/results 仍显示 pending_review。
5. 把观察席审计的三条 P1 列入长期记忆候选（经既有门禁，不自动晋升）：模型提出的测试 / 模型声称通过的测试 / 实际运行通过的测试是三种状态。
