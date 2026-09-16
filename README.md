# LTZZZ 数字实验室

**海韵天城 · LTZZZ Digital Lab**

一个用 AI、代码、数据和自动化持续做实验的数字实验室。

## 当前状态

- 纯静态网站（HTML + CSS + JS）
- 已准备部署到 GitHub Pages
- 自定义域名：`ltzzz.com`（CNAME 已配置）

## 多 Agent 编排（agents.html）

`agents.html` 提供「总控 → 专家」多 Agent 编排：

- **前端**：输入问题 → 显示任务计划 → 并行显示 豆包 / DeepSeek / Grok / Claude 四个专家席状态与回复 → 显示总控汇总。网页不保存任何 API Key。
- **后端**：`agent-orchestrator-worker.js`（Cloudflare Worker）。总控默认内置确定性路由；配置 `OPENAI_API_KEY` 后由 ChatGPT 规划与汇总。豆包走 Agent Plan 专属 Key（Anthropic 兼容端点），DeepSeek 走真实 API；Grok / Claude 未配置 Key 时保留接口位。

### 部署编排 Worker（一次性）

```bash
npx wrangler deploy agent-orchestrator-worker.js --name ltzzz-agent-orchestrator
npx wrangler secret put DEEPSEEK_API_KEY          # DeepSeek 真实 Key
npx wrangler secret put DOUBAO_AGENT_PLAN_API_KEY # 豆包 Agent Plan 专属 Key（不是普通方舟 Key）
# 可选：总控与其余专家席
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put XAI_API_KEY
```

豆包 Agent Plan 默认配置：Base URL `https://ark.cn-beijing.volces.com/api/plan`、模型 `doubao-seed-evolving`，可用 Worker 环境变量 `DOUBAO_BASE_URL` / `DOUBAO_MODEL` 覆盖。部署后把 Worker 地址填进 `agents.html` 的「编排 Worker 地址」。

本地验证（无需真实 Key，验证编排结构）：`node --check agent-orchestrator-worker.js`；或 `node test-orchestrator.mjs`。

## 部署到 GitHub Pages（只需做一次）

1. 打开仓库：https://github.com/ltzyz2181-collab/-
2. 点击 **Settings** → 左侧 **Pages**
3. Source 选择 **Deploy from a branch**
4. Branch 选择 **main**，Folder 选择 **/ (root)**
5. 点击 **Save**
6. 等待 1-2 分钟即可访问：
   - https://ltzyz2181-collab.github.io/-/
   - 或绑定后的 https://ltzzz.com

## 项目理念（前端已体现）

- **观**：观察链上世界与自身状态
- **行深**：深度践行与实验
- **改变习气**：通过反馈循环修正行为
- **魄**：底层躁动与植物神经层面的觉察
- **识神**：大脑与自主神经系统的协同

后续将逐步接入钱包、后端、数据库与交易功能。

---

© 2026 LTZZZ Digital Lab

## 视频引擎 fallback 部署状态（2026-09-16）
- **本地 FFmpeg 合成链路已真实验证**：python tools/ltzzz_video_server.py（127.0.0.1:8788，CORS 全开仅本机）→ GET /health、POST /generate。实测合成 ltzzz-20260916-135952.mp4：1080×1920 · 9:16 · 30fps · H.264 · AAC，下载链路 HTTP 200 video/mp4。creator-lab.html 引擎选择（auto/gemini/seedance/ffmpeg）+ 状态徽章 + 下载 MP4 按钮已就绪。
- **ltzzz-gemini-video-proxy**：已部署（/health ok），缺 Cloudflare Secret GEMINI_API_KEY（Google AI Studio Key）。
- **ltzzz-youtube-post**：已部署（OAuth + videos.insert，默认 privacy=private），缺 Cloudflare Secret GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET 及首次 OAuth 授权。
- **定时监控**：每 2 小时检查支付宝应用审核状态，通过后自动发起 0.1 元转账测试到白名单收款方。