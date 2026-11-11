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
3. ~~**GPT 系（`gpt-5.5`）当下不可用**~~ → **已被 6.1 节推翻**：`gpt-5.5` 与 `gpt-6-astra` 确实不可用，但 `gpt-5.6-luna / gpt-5.6-sol / gpt-6-sol / gpt-6.1-sol` 实测 200 成功返回正文。
4. 修正结论：这个中转站**有可用的 GPT 与 Claude 口子，但不是全档可用**；能否给 GPT 席当"临时备选"取决于是否只用 6.1 节点出的那批可用模型。

### 6.1 第二批实测：Claude 全系 + GPT 旗舰（2026-11-11T03:1xZ）

统一 `POST /v1/chat/completions`，`messages=[{role:user,content:"ping"}]`，`max_tokens=16`，客户端超时 35 s。

| 模型 | 结果 | 耗时 | usage(in/out) |
|---|---|---|---|
| `claude-haiku-5-5` | **200**，正文正常（英文回复） | 18.46 s | 8 / 15 |
| `claude-opus-5` | **200**，回 `pong` | 10.36 s | 5 / 1 |
| `claude-sonnet-4-6` | **200**，回 `pong` | 12.85 s | 5 / 1 |
| `claude-opus-5-5` | **200**，回 `pong` | 3.82 s | 5 / 1 |
| `claude-sonnet-5` | 超时（35 s 无响应） | 35 s | — |
| `gpt-5.6-luna` | **200**，回 `pong` | 7.27 s | **4389 / 5** |
| `gpt-5.6-sol` | **200**，回 `pong` | 4.79 s | **4387 / 5** |
| `gpt-6-sol` | **200**，回 `pong` | 4.04 s | **4387 / 5** |
| `gpt-6.1-sol` | **200**，回 `pong` | 13.99 s | **1446 / 5** |
| `gpt-5.5` | 超时（35 s；此前一次为 503 `model_temporarily_unavailable`） | 35 s | — |
| `gpt-6-astra` | 超时（35 s） | 35 s | — |

**两点关键发现（请重点看）：**

1. **Claude 系可用面比 GPT 系宽**：opus-5 / opus-5-5 / sonnet-4-6 / haiku-5-5 四个都 200；只有 sonnet-5 超时。
2. **GPT 系存在"输入 token 膨胀"**：一句 `ping` 的输入被计成 **4387～4389 tokens**（`gpt-6.1-sol` 为 1446），而 Claude 系同句只计 5～8。按它自己的单价核算，`gpt-5.6-sol` 单次 `ping` 花 **$0.0132**，`gpt-6-sol` 花 **$0.0066**，而正常情况下这个量级应接近 $0.00003。**这说明中转侧附加了约 4.4k 的隐藏前缀并计入你的账单**，把"单价比官方低 20–25%"的便宜吃掉甚至反转。

### 6.2 计费对照（它自带 official 标价，非本席臆测）

该站 `/api/pricing`（免密钥）里每个模型都同时给 `price_input/price_output` 与 `official_input_usd/official_output_usd`。计算结果：

| 厂商 | 它的售价 / 官方价 |
|---|---|
| Anthropic 全系（fable-5、haiku-4-5、haiku-5-5、opus-4-6/4-7/4-8/5、opus-5-5、sonnet-4-6、sonnet-5/5-5） | 0.75～0.80 倍 |
| OpenAI（gpt-5.5、5.6-luna、5.6-sol、5.6-terra、6-sol、6.1-sol、6-astra） | 0.75～0.80 倍 |

即**名义单价便宜 20–25%**，但叠加第 2 点的输入膨胀后，只跑一两句短请求时实际更贵；只有长上下文批量调用才可能真的省。

本次全部实测调用（含失败）按它报价合计约 **$0.023**，相对 $13 余额可忽略，但足以证明计费在工作。

以下步骤保留供复核（若你要独立验证，不必重复全部，跑一次 `claude-opus-5` 或 `gpt-6-sol` 对照即可）：

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
