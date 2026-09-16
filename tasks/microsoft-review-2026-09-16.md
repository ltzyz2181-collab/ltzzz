# Microsoft 考察员任务

角色：Microsoft = LTZZZ 独立考察员，不取代 GPT 总控，也不改变 3/5 治理。

## 任务
请对当前 LTZZZ 云端 Agent 架构做一次轻量考察，重点检查：

1. Cloudflare Sandbox 云端工作区是否适合作为长期 Agent 执行环境。
2. 多 Agent（GPT/豆包/DeepSeek/Grok/Claude + Microsoft）如何做可观测性、Tracing、Evaluation、错误定位。
3. 是否值得引入 Microsoft Foundry 的评测/监控思路；给出 3 个可以低成本直接移植到 LTZZZ 的实践。
4. 检查云端部署 Agent 的任务流：任务 → 豆包计划 → Sandbox → GitHub → Worker 部署 → 日志。
5. 给出一个“今天即可执行”的最小改造建议，不要求迁移到 Azure。

## 特别要求
- 不要求改变 GPT = 总控。
- 不要求替换 Cloudflare。
- 不要求迁移现有 Doubao / Seedance / YouTube / TikTok Worker。
- 输出应当是审计/建议性质，不直接修改生产代码。

## 输出格式
- 当前发现
- 3 个最高价值改进点
- 今天可执行的 1 个改动
- 后续可选 Azure / Microsoft Foundry 能力
