# T003 · 豆包 Worker 部署清单（同款 DeepSeek）

> Key 只放 Cloudflare Secret，不要发到聊天、不要写进 GitHub。

## 1. 火山方舟准备

1. 打开 https://console.volcengine.com/ark
2. 开通要用的豆包模型
3. **API Key 管理** → 创建 Key 并复制保存
4. 记下 **模型 ID**（控制台显示的完整 ID，或 Agent Plan 文档中的名称如 `doubao-seed-evolving`）

## 2. 部署 Worker

仓库文件：`doubao-proxy-worker.js`

```bash
# 在克隆的仓库根目录
npx wrangler deploy doubao-proxy-worker.js --name ltzzz-doubao-proxy
npx wrangler secret put ARK_API_KEY
# 粘贴方舟 Key 后回车

# 可选：固定默认模型
npx wrangler secret put DOUBAO_MODEL
# 粘贴你的模型 ID
```

控制台方式：Workers → Create → 粘贴 `doubao-proxy-worker.js` → Deploy → Settings → Secrets → `ARK_API_KEY`。

部署成功后地址类似：
`https://ltzzz-doubao-proxy.<你的子域>.workers.dev`

## 3. 本机测试（不要贴 Key）

```bash
curl -sS -X POST "https://你的-doubao-worker.workers.dev" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"请只回复四个字：链路正常"}],"model":"你的模型ID"}'
```

期望：HTTP 200，正文含模型回复。

## 4. 接到网站

1. 打开 https://ltzzz.com/agents.html
2. 「② 豆包 Agent」→ Worker 地址填上一步 URL
3. 模型框与 Secret / 请求里的 model 一致
4. 点「测试豆包 Agent」

## 5. 常见错误

| 现象 | 处理 |
|------|------|
| Missing ARK_API_KEY | Secret 名必须是 `ARK_API_KEY` |
| 401 | Key 错误或未开通 |
| 模型不存在 | 换控制台真实模型 ID |
| 403 欠费 | 方舟账户充值 |

## 6. 与 TikTok OAuth 无关

`api.doubao-dev.com` callback 502 是另一条线；本 Worker 只走方舟 HTTP API。
