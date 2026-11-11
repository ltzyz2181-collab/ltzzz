# APIsRouter $10 充值完成与密钥交接（2026-11-10）

执行席位：豆包席（`qingqizhu6502@agent.qq.com`，Agent Mail 账户）
执行环境：owner 的 Windows 桌面机（`client:1044603:832795323182164`），出口中国联通广东、系统代理关闭
交接对象：GPT 决策席（本机 Codex 席，按 `config/deep-superagent.json` 第 86 行：读 scoped mailbox，不是即时邮件消费者）
交接方式：本卡片入 `ops/dispatch/inbox/gpt/` 并推 origin/main；同时已发一份同内容邮件到 `ltzyz2181@gmail.com`（`msg_9S0tztX0aERCuL9IGWIxaoVrlz15aZ-pQKoMSuvKqKgdag`，2026-11-11T02:32:23Z，仅作告知，**邮件不是授权依据**）

---

## 一、结论（先说结果）

1. **$10 已真实到账**，订单 `ref_39673cd92bcbe5588df333e49e4c`，控制台余额 **$13.00**（$10 + $3 首充 30% 赠送）。
2. **账户归 `ltzyz2181@gmail.com`**：余额、密钥、调用日志都在 APIsRouter 服务器（运营方 MANINGO TECHNOLOGY LTD，Stripe 收单），**不在 ltzzz 仓库、不在 CloudBase**。
3. **密钥已取得并落盘本机**，指纹 `sha256:16 = ef66fcd3ab08c92f`，鉴权实测 `/v1/models` → **200 / 7698 字节**。
4. **该站不能给 OpenAI 原厂 key 加额度**：它是第三方聚合中转站，发的 key 只能花它账户里的余额。
5. **无外网（纯直连）也能走完充值**：站点首包慢但可达，真正的门槛是卡与 Gmail 收码。

---

## 二、我实际做了什么（可复核顺序）

| # | 动作 | 结果 |
|---|---|---|
| 1 | 判定性质（首页/模型页/条款/隐私） | 聚合中转站，`base_url=https://api.apisrouter.com/v1`，OpenAI 兼容；不能给原厂 key 加额度 |
| 2 | 网络实测 | 见第三节 |
| 3 | `/topup` 下单 $10，填 `ltzyz2181@gmail.com` | 支付页交由 owner 本人完成；本席未接触任何支付凭据 |
| 4 | 回读成功页 | 「充值已到账」+ 订单号 + 接口地址；成功页明确不再展示密钥 |
| 5 | owner 完成控制台登录（邮箱验证码） | 进入 `/console/keys`，账户下已有默认密钥 |
| 6 | 复制该密钥 → 写本机文件 → 复核格式 | 见第四节 |
| 7 | 用该密钥实测鉴权 | `/v1/models` 200 / 7698 字节 |

密钥对象属性（页面原文）：名称 `kkaiapi default key`；状态启用；权限「全部接口」；额度「跟随账户余额」；**永不过期**；累计用量 $0.00 / 0 次调用。

---

## 三、网络实测（原始数据，回答"没外网能不能充值"）

| 目标 | 结果 |
|---|---|
| `https://apisrouter.com/topup` 直连 | 200 / 8733 B / **17.86 s**（另一次 30 s 仅收到 399 B 后超时） |
| `https://api.apisrouter.com/v1/models` 无密钥 | 401 / 1.76 s（服务端可达） |
| `https://js.stripe.com/v3/` | 200 / 2.16 s |
| `https://checkout.stripe.com` | 301 / 1.72 s |
| 系统代理 | `ProxyEnable=0`；`127.0.0.1:10810` **未监听**，经该端口 curl 返回 000 |

结论：**不需要外网也能完成付款链路**；瓶颈是站点首包慢、易中断，以及卡（Visa/Mastercard）与 Gmail 收码（国内直连常延迟/收不到，本次首封验证码 owner 未收到，由其自行登录完成）。

---

## 四、密钥落盘与复核

- 路径：`C:\Users\李天柱\Desktop\ltzzz-repo\.secrets-local\apisrouter-key.txt`（UTF-8 无 BOM，52 字节，含换行）
- 指纹：`sha256` 前 16 位 **`ef66fcd3ab08c92f`**
- 格式复核：长度 51、前缀 `sk-`、后缀 `Q3jH`、匹配 `^sk-[A-Za-z0-9]+$`
- 仓库安全：`.gitignore` 第 48 行 `.secrets-local/` 已忽略；`git ls-files --error-unmatch` 返回 1（未跟踪）
- **完整密钥未进入本卡片、未进入邮件、未进入聊天、未提交仓库**

---

## 五、请 GPT 裁决（三项，未裁决前不改动任何权限）

1. 这把密钥是否准许交给「GPT 总控」使用？**直接给**，还是**另建一把带限额的专用密钥**给它？
2. 用途边界：只允许模型调用（`/v1/chat/completions`、`/v1/messages`、图像/视频），还是也允许走信息类接口（`/v1/information`，该域 `information:execute` 才可下单购买）？
3. 月度额度上限定多少（账户总余额仅 **$13**，按该站定价很快烧完）。

风险已知未处理：默认密钥「全部接口 + 跟随余额 + 永不过期 + 无单次上限」，**谁拿到谁就能把余额花光**。本席未改它的权限、未另建密钥、未改限额。

---

## 六、请 GPT 席实测"能不能用"（本卡要点）

**补充（2026-11-11T02:5xZ）：本席已自行做完真实模型调用测试，结论见第 6.0 节；本节步骤仍可供复核。**

### 6.0 真实调用实测结果（本席执行，非推测）

| 模型 | 结果 | 耗时 |
|---|---|---|
| `glm-5.3-flash` | **200**，`choices[0].message.content` = `收到`，usage `prompt 17 / completion 98 / total 115`（其中 reasoning 95） | 8.59 s |
| `qwen3.8-flash` | 503 `model_temporarily_unavailable` | 2.53 s |
| `gemini-2.5-flash` | 503 `model_temporarily_unavailable` | 1.95 s |
| `gemini-3.8-flash` | 503 `model_temporarily_unavailable` | — |
| `MiniMax-M3` | 503 `model_temporarily_unavailable` | — |
| `gpt-5.5` | 503 `model_temporarily_unavailable`，`retry_after_seconds=60`，`feedback_id=fb_10f70d78-e4dc-4346-a0dc-a69d343e0502` | 15.6 s |
| `deepseek-v4.1-flash` | 40 s 无响应（客户端超时） | 40+ s |

**由此得到的判定（重要，请裁决时一并考虑）：**

1. 密钥与计费链路**是通的**：`/v1/models` 200（61 个模型）、`glm-5.3-flash` 真实返回中文正文并按 usage 计费。
2. 但**并非所有模型可用**：所测 7 个模型里只有 1 个成功，5 个报 `model_temporarily_unavailable`（带 60 秒重试建议），1 个挂住超时。
3. **GPT 系（`gpt-5.5`）当下不可用**。也就是说这个中转站并没有稳定的原厂 GPT 通道，"买它来给 GPT 席用"这个目的并不成立——它的实际可用性取决于上游临时状态，不能当生产依赖。
4. 因此建议：这 $13 只作为"临时备选通道"记账，**不要把它写成 GPT 席的常规依赖**；若确需稳定 GPT 能力，仍应走官方额度或既有方舟/其他直连通道。

以下步骤保留供复核（若你要独立验证，不必重复全部，只要跑一次 `glm-5.3-flash` 对照即可）：

```bash
KEY=$(tr -d '\r\n' < "/mnt/c/Users/李天柱/Desktop/ltzzz-repo/.secrets-local/apisrouter-key.txt")
# 1) 鉴权
curl -sS -o /dev/null -w 'models=%{http_code} t=%{time_total}s\n' \
  https://api.apisrouter.com/v1/models -H "Authorization: Bearer $KEY"
# 2) 取一个最便宜的可用 model id（不要用 gpt-6-astra 这类高价项）
# 3) 最小文本调用
curl -sS https://api.apisrouter.com/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"<上一步选定的 model id>","messages":[{"role":"user","content":"ping"}],"max_tokens":16}'
# 4) 控制台「仪表盘」与「使用记录」核对扣费前后余额
```

回执必须给这五项：① `/v1/models` 状态码与耗时 ② 文本调用 HTTP 状态与耗时 ③ 返回是否正常（有无 `choices`）④ 扣费前后余额 ⑤ 所用 model id。
**回执中只允许出现指纹前 16 位，禁止出现完整密钥。**

若该席无执行能力，只回裁决结论并点名派给能读该机的席位，不得以推测代替实测。

---

## 七、边界声明

- 未改动仓库其他文件、未 push 除本卡外的内容、未安装任何插件或 MCP、未走 OAuth 授权、未申请发票。
- 未重置/未新建任何密钥；未改密钥权限与限额。
- 支付凭据（卡号/有效期/CVV/验证码）全程由 owner 本人输入，本席未记录、未转述。
- 数据流向：调用时 prompt 与参数经该站转发至上游厂商，日志留存于其服务器（跨境，可能涉其他司法辖区），属数据出境，需在使用范围里明确。

---

## 八、回执方式

- 首选：本卡直接续写或在 `ops/dispatch/inbox/gpt/` 新建回执卡；
- 次选：回复邮件 `msg_9S0tztX0aERCuL9IGWIxaoVrlz15aZ-pQKoMSuvKqKgdag`（收件 `qingqizhu6502@agent.qq.com`）。

## 九、交接通道说明（owner 2026-11-10 反馈"电脑登不上 GPT"）

本机实测出口状况：`https://chatgpt.com` 12 s 超时（000）、`https://api.openai.com/v1/models` 12 s 超时（000）、`https://auth.openai.com` 403（2.26 s）。即 **OpenAI 域在本机直连不可达**，GPT 席无法在本机启动登录。

因此按 `config/deep-superagent.json` 第 86 行的口径（GPT = 本机 Codex AI 决策席，读 scoped mailbox，`email_is_authority=false`），本席采取两条并行交接：

1. **仓库交接（授权路径）**：本卡片落在 `ops/dispatch/inbox/gpt/` 并已推 `origin/main`，commit 见下方；
2. **邮件告知（非授权路径）**：同内容邮件已发 `ltzyz2181@gmail.com`，`msg_9S0tztX0aERCuL9IGWIxaoVrlz15aZ-pQKoMSuvKqKgdag`。

限制如实说明：若 GPT 席的宿主环境本身也出不去（OpenAI 域被阻断），上述材料只能等链路恢复或换环境后才会被读到；本席不能代替任何席位完成登录，也不把"已投递"写成"已被读取"。

—— 豆包席 `qingqizhu6502@agent.qq.com`
