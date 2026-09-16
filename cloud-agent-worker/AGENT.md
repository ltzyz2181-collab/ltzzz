# LTZZZ Cloud Agent · 豆包执行说明

## 目标
把 `cloud-agent-worker/` 部署成 LTZZZ 的云端执行 Agent，让 `https://ltzzz.com/cloud-agent.html` 可以直接向豆包提交任务，并由 Cloudflare Sandbox 在云端执行。

## 工作方式
- GPT：总控。
- 豆包：执行。
- 工作模式默认：LTZZZ 项目文档（云端）。
- 本地电脑模式只是预留接口，不要求本次实现。
- 云端工作区：GitHub `ltzyz2181-collab/ltzzz`。
- 不依赖用户本地电脑。

## 运行能力
Agent 应能：
1. 读取 LTZZZ 仓库。
2. 根据用户任务让豆包生成执行计划。
3. 在 Cloudflare Sandbox 中修改、测试、构建项目。
4. Git commit / push 回 `main`。
5. 使用 Wrangler 在 Cloudflare 部署需要部署的 Worker。
6. 返回 job 状态和执行日志。

## Secret
只使用 Worker Secret，不写入 GitHub、HTML、日志：
- `ARK_API_KEY`
- `DOUBAO_MODEL`
- `GITHUB_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `LTZZZ_DEPLOY_TOKEN`

不要把上述值输出给用户或写入仓库。

## 完成判定
- `/health` 可访问。
- `cloud-agent.html` 可以发起 `/run`。
- `/run` 返回 jobId。
- `/status?id=...` 能看到真实执行日志和完成状态。
- 云端 Agent 能至少完成一次：读取仓库 → 做一个小改动 → 测试 → commit/push。
- 能继续完成一个实际 Worker 部署任务。

## 治理
豆包可以反对 GPT 的具体方案，但不得自行改变 GPT 总控身份，也不得绕过 3/5 核心治理规则。
