# LTZZZ 云端自动执行 + 视频发布任务

## 目标
把现有“网页 POST /run + 手工授权码”升级为：

任务队列 → Cloudflare Worker 定时触发 → 豆包 → Cloudflare Sandbox → GitHub/Cloudflare 执行

用户不需要复制命令，不需要打开本地电脑参与部署。

## 一、云端任务队列

1. 检查现有 `cloud-agent-worker`、`cloud-agent.html`、Sandbox 配置。
2. 保留 GPT = 总控、豆包 = 执行、Microsoft = 考察员。
3. 新增 Cloudflare Queue（优先）或等价 Durable Object / KV job queue。
4. 新增 Worker 定时触发器（Cron），周期建议先 5 分钟一次；每次只处理少量任务，完成后再继续。
5. 网页提交任务只负责写入队列，不再要求用户输入部署授权码。
6. Worker 从队列领取任务 → 调用豆包 → 读取 LTZZZ GitHub → 在 Sandbox 执行 → 测试 → GitHub commit/push → Wrangler 部署。
7. 每个任务记录：queued / planning / running / completed / failed，以及日志、开始时间、结束时间、结果摘要。
8. 不把任何 Secret 写入 HTML、GitHub、任务正文或日志。
9. 默认工作区：`/workspace/ltzzz`。
10. 不改变 GPT 总控及 3/5 核心治理。

## 二、视频发布任务

目标：把“昨天已经制作完成的视频”通过现有 Worker 发布到两个平台：

- TikTok
- YouTube

执行前必须先在云端找到昨天生成的 MP4/成片，并确认标题、描述、字幕/封面等已有素材。

### TikTok

1. 检查 `ltzzz-tiktok-post` Worker 当前代码和 OAuth/Token 状态。
2. 如果已授权：准备并发布昨天的视频。
3. 默认使用 TikTok Direct Post。
4. 若当前应用仍处于未审核状态，按照平台实际权限结果处理，不伪造“公开发布成功”。
5. 记录 TikTok post/video ID、状态、时间、错误信息。

### YouTube

1. 检查 `ltzzz-youtube-post` Worker 当前代码和 OAuth/Token 状态。
2. 如果已授权：上传昨天的视频。
3. 默认 `privacyStatus=private`，先确保真实上传链路成功。
4. 记录 YouTube video ID、processing/status、时间、错误信息。
5. 不把视频标记为公开，除非任务状态明确允许。

## 三、视频生产兜底

检查现有 creator-lab、Doubao、Gemini/Veo、Seedance、FFmpeg。

优先级：
1. Gemini/Veo Worker（已有健康检查时优先）
2. Seedance Worker
3. FFmpeg 本地/云端合成

Seedance `ModelNotOpen` 不能阻塞整个视频生产链。

## 四、AI Agent Payment

检查并继续实现：

- `agent-pay.html`
- `agent-payment-policy.json`
- `agent-pay-worker.js`

把现有模拟 402 框架推进到 x402 / MPP 测试链路。

先做测试环境、dry-run、receipt/ledger 记录，不把真实资金自动支出作为默认行为。

## 五、Microsoft 考察员

Microsoft 只作为考察员，不接管 GPT 总控。

请增加一份轻量评估输出，检查：

- Agent tracing
- evaluation
- observability
- error diagnosis
- cloud sandbox / agent architecture
- 哪些 Microsoft/Azure/Foundry 能力值得 LTZZZ 借鉴

只输出建议，不自行改核心治理。

## 六、执行方式

豆包不是来写部署教程的，而是来执行：

检查 → 修改 → 测试 → 部署 → 验证 → 记录。

优先复用现有 Worker 和代码，不另起重复系统。

完成后输出：

- 改了哪些文件
- 新增哪些 Cloudflare 资源
- 哪些真实测试通过
- TikTok 发布结果
- YouTube 发布结果
- Agent Payment 当前阶段
- Microsoft 考察结果
- 仍缺哪些凭证/配置

绝不把 API Key、Secret、Token、Cookie、OAuth refresh token 写入仓库、网页或日志。
## 七、新增：LTZZZ 模拟投票机制（执行目标）

- 建立 LTZZZ 五席模拟投票：GPT / 豆包 / DeepSeek / Grok / Claude。
- 核心治理变更须至少 3/5 通过；通过后仍需用户本人最终确认才生效。
- Microsoft 仅作为外部考察员，不进入 5 席核心票数（可输出观察意见，不计票）。
- 先做 dry-run（模拟投票、不出真实资金、不改变真实配置），跑通后再评估是否用于真实治理。
- 投票记录格式：议题、五席各自立场与理由、赞成/反对、票数、分歧点、待用户确认事项。
- 不改变 GPT 总控职责；不因投票机制替代用户决策。