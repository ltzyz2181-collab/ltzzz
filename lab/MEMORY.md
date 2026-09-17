# LTZZZ 长期记忆

最后更新：2026-09-17（由 Grok 根据协作史整理初稿，主人可改）

## 项目是什么

- **名称：** LTZZZ 数字实验室（海韵天城）
- **定位：** 用 AI、代码、数据做可验证实验；不是单纯短视频号。
- **主线：** 观 → 行深 → 实验 → 结果
- **网站：** https://ltzzz.com （GitHub Pages，CNAME 已配置）
- **仓库：** https://github.com/ltzyz2181-collab/ltzzz
- **主体控制人：** 仓库与域名所有者（人类主权者）

## 已验证可用的链路

| 项 | 状态 | 备注 |
|----|------|------|
| GitHub Pages 部署 | 可用 | push main 自动发布 |
| MetaMask / OKX 连接（只读地址与余额） | 可用 | 手机需用钱包 App 内置浏览器 |
| DeepSeek 经 Cloudflare Worker | **已打通** | `https://ltzzz-deepseek-proxy.ltzyz2181.workers.dev`；Key 仅在 Worker Secret |
| 模拟捐赠 / 模拟交易 | 可用 | localStorage，非真收款 |
| 公益页展示收款地址 | 有 | 地址由人类控制；非 AI 持钥 |
| 多 Agent 页骨架 | 有 | DeepSeek 可测；豆包需自建 Worker |
| AGI 共管协议文档 | 有 | `protocol/AGI-CO-MANAGEMENT.md` |

## 明确失败或未完成（避免重复交学费）

| 事件 | 教训 |
|------|------|
| 豆包 TikTok OAuth → `api.doubao-dev.com` callback **502** | 授权前半段成功，字节侧 callback 故障；与「方舟 API + Worker 调模型」是两条线 |
| OKX 提 USDT 误选 **X Layer**，收款方不支持该网 | 链上可能已到地址但平台不入账；只能官方客服 + TXID，勿信代找回 |
| 静态站无法安全接支付宝/微信真收款、无法把 Key 写进前端 | 真收款要后端+商户；Key 只放服务器/Worker Secret |
| 「转 USDT 开通 Claude/GPT 会员」 | 非官方路径，不做 |

## 禁区（对所有 AI）

- 索要或接收私钥、助记词、短信验证码
- 把 API Key 写入前端或公开仓库
- 宣称 AI 已接管服务器/资金
- 诱导向「AI 钱包」转账表忠心
- 未获人类批准的主网大额或自动扣款逻辑

## 视频与内容（立项中，未量产）

- GPT 为总控组织评审；暂缓正式成片与最终 Logo 定稿
- 候选方向侧重「数字实验日志」类，保留观→行深→实验→结果
- 详见 `DECISIONS.md`

## 技术栈快照

- 前端：静态 HTML/CSS/JS
- 部署：GitHub Actions → Pages
- 合约：仅接口骨架，未主网部署资金合约
- 后端示例：`backend-node/`、`backend-python/`、Worker 代理脚本
