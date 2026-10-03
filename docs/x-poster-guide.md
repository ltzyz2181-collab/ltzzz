# LTZZZ X 发布通道指南（给 Manus / XAI / 各席）

> 2026-10-02 豆包部署 · 通道：`x.ltzzz.com` → `ltzzz-x-poster` worker
> 状态：**路由 + DNS + 5 个 Secret 已就绪；X OAuth1 凭证被拒（401），待 owner 处理凭证后即通**

## 一、端点（唯一真相源）

| 动作 | 方法 | 地址 |
|---|---|---|
| 发推 | POST | `https://x.ltzzz.com/tweet` |
| 健康检查 | GET | `https://x.ltzzz.com/health` |

**鉴权**：`Authorization: Bearer <LTZZZ_AGENT_TOKEN>`

**请求体**（JSON）：
```json
{ "text": "推文内容，≤280 字符" }
```

**返回**：`{"ok":true,"data":{...X 返回...,"id":"推文 ID"},"http":200}`

## 二、Agent Token 从哪拿

本地文件（**永不入库**）：
`C:\Users\李天柱\Desktop\ltzzz-repo\agent-wallet\ltzzz-video-scheduler-token.txt`
格式：`AGENT_TOKEN=ltzzz_agent__...`（等号后整串就是值）

## 三、调用示例（任一席可用）

```bash
# 发推
curl -X POST https://x.ltzzz.com/tweet \
  -H "Authorization: Bearer ltzzz_agent__<...>" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from LTZZZ bot channel"}'

# 查状态
curl https://x.ltzzz.com/health
# → {"ok":true,"service":"ltzzz-x-poster","configured":{"consumer":true,"access":true,"tokenSecret":true}}
```

## 四、当前阻塞（诚实报告）

- `x.ltzzz.com/health` → **通**（configured 三项全 true，5 个 Secret 已注入 worker）
- 真实发推 → **401 Unauthorized**（X API 拒绝 OAuth1 签名）
- 已在本地用标准 OAuth1 实现直连 `api.twitter.com/2/tweets` 复测 → **同样 401**
  → 结论：**不是 worker 代码问题，是 X 凭证本身无效/无写权限/已失效**

## 五、待 owner 动作（解除阻塞，只需一次）

1. 打开 X 开发者后台（`https://developer.x.com/en/portal` 或旧版 `developers.twitter.com`）
2. 找到 LTZZZ 应用 → 检查 **User Access Token** 权限是否 **Read + Write**（只读则发不了推）
3. 若无效：**Regenerate / Revoke 后重新生成** Access Token + Secret
4. 把新四件套发给豆包 → 豆包重注入 4 个 Secret → 立即恢复发推

## 六、红线

- Token/Secret **只进 Cloudflare Secret**，不进对话、不进仓库、不进回执
- `?debug=true` 参数会回显签名与 Secrets，**禁止在公开/外网环境使用**（仅本地排查）
- 发推前先经委员会批准文案；未经批准不自动外发

status: routes_live · credentials_401 · awaiting_owner_x_token
