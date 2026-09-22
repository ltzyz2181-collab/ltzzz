# Status Board · 2026-09-22

| 模块 | 状态 | 说明 |
|------|------|------|
| GitHub Pages / creator-lab | 🟢 VERIFIED | https://ltzzz.com/creator-lab.html 可打开 |
| Result Center 闭环规范 | 🟡 DEPLOYED | 文档已在仓；各任务需自己套链 |
| Safe USDT 到账 | 🟢 VERIFIED | 46.02 USDT @ 0x7637… Etherscan |
| YouTube Upload Worker | 🟡 DEPLOYED | Worker 有；待 OAuth Secret+授权后真上传 |
| TikTok Post Worker | 🟠 **BLOCKED** | OAuth 报错 **client_key**（见下） |
| TikTok Content Posting | 🟠 BLOCKED | 依赖有效 client_key + 应用产品/回调配置 |
| Daily cron 分时 AI | 🟡 DEPLOYED | cron 有；dry_run/真调用分开证据 |
| Memory Gateway | 🟡/🟢 | 以现网 /health 为准 |

## TikTok BLOCKED 详情

**现象：** `Something went wrong` → developer 提示纠正 **client_key**。

**原因（按可能性）：**
1. Cloudflare Secret `TIKTOK_CLIENT_KEY` 与开发者后台 **Client Key** 不一致（多字、旧应用、或贴成了 Client Secret）
2. TikTok 应用未启用 Login Kit / Content Posting，或仍在审核
3. Redirect URI 与后台登记不一致

**你要做：**
1. [TikTok Developers](https://developers.tiktok.com/) → 你的应用 → 复制 **Client Key**（不是 Secret）
2. Cloudflare → `ltzzz-tiktok-post` → Secrets → 更新 `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`
3. 回调填：`https://ltzzz-tiktok-post.ltzyz2181.workers.dev/auth/callback`
4. 再从 creator-lab 点授权

**不要**把 client_key/密钥发到聊天里。
