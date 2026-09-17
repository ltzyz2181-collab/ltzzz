# LTZZZ 长期记忆

最后更新：2026-09-17

## 项目是什么

- **名称：** LTZZZ 数字实验室（海韵天城）
- **定位：** 用 AI、代码、数据做可验证实验；不是单纯短视频号。
- **主线：** 观 → 行深 → 实验 → 结果
- **网站：** https://ltzzz.com
- **仓库：** https://github.com/ltzyz2181-collab/ltzzz
- **主体控制人：** 仓库与域名所有者（人类主权者）

## 资金与金库（独立池）

详见 `finance/TREASURY_ARCHITECTURE.md`。

| 池 | 地址/系统 | 规则 |
|----|-----------|------|
| A 运营金库 | Safe `0x3cb1b0963A27Fa8D40ee606bc596C79FE3B1866a`（**Ethereum**） | **3/5** 多签；真收款归 LTZZZ |
| B 热钱包 | `0xb99C6751f443842F4987bb2017580405572Df905` | gas/中转；勿长期堆大额 |
| C 支付代理 | `ltzzz-pay-proxy` + KV | 账本可用；支付宝风控约 7 天重签，真付暂停 |
| D 模型预付 | DeepSeek/方舟官网 | 与链上池独立 |

阈值变更成功 tx：`0x413fb5e5d85a3a13d6d2fabb82136f3048fe0e285bc28d714bb5ac5a06b605a2`

**AI 不持有金库私钥；不列入 Safe owner。**

## 已验证可用的链路

| 项 | 状态 | 备注 |
|----|------|------|
| GitHub Pages | 可用 | push main 自动发布 |
| MetaMask/OKX 连接 | 可用 | 手机用钱包内置浏览器 |
| DeepSeek Worker | 已打通 | ltzzz-deepseek-proxy |
| 豆包 Worker | 已打通 | ltzzz-doubao-proxy；health +「链路正常」 |
| pay-proxy 记录/预算 | 已上线 | health/ledger/balance；真付受支付宝风控限制 |
| Safe 3/5 | 已生效 | 以太坊主网 |
| lab/ 内核页 | 可用 | https://ltzzz.com/lab.html |

## 明确失败或未完成

| 事件 | 教训 |
|------|------|
| 豆包 TikTok OAuth 502 | 与方舟 API+Worker 无关 |
| USDT 误提 X Layer | 网络必须与收款方一致 |
| 支付宝风控需约 7 天电话重签 | 暂停自动付款；勿反复硬测 |
| Safe 曾建在 ETH 而非 Base | 链要选对；Base 需另建 |

## 禁区（对所有 AI）

- 索要或接收私钥、助记词、短信验证码
- API Key 写入前端或公开仓库
- 宣称 AI 已接管资金或服务器
- 未满多签或未经主人确认的出款
- 非官方「转 U 开通会员」
