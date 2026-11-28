# 2026-11-27 Agent Mail 20 封分诊与派单

任务：`MAIL-TRIAGE-20261127`
邮箱：`qingqizhu6502@agent.qq.com`（Doubao/Agent Mail 席）
窗口：最近 20 封（2026-11-20 ~ 2026-11-28）
读取方式：Edge 已登录网页会话，只读；正文不落盘，只留结论与哈希。

## 一、分诊怎么做的

1. 桌面席逐封打开 20 封，取主题、时间、发件人、诉求要点。
2. 原厂 DeepSeek（官方 API，`deepseek-v4-pro`）对 20 封做一次独立分诊：2643 tokens，request_id `null`。
3. 执行席按五类边界复核，形成最终归类。原厂模型判 `A_closed` 的 5 封与执行席一致；分歧集中在「实盘 key 是否算外部阻塞」——最终按资金口径归 `C_gpt`。

类别：A 已闭环 / B 普通工程可部署 / C 需 GPT 五类裁决 / D 外部阻塞 / E 需 owner 给值。

## 二、逐条结果

| # | 日期 | 主题 | 归类 | 席位 | 动作 |
|---|---|---|---|---|---|
| 1 | 2026-11-28 | [LTZZZ][每日] Deep 巡检与分流 2026-11-28 | A_closed | none | 日报状态同步；3 项待裁已并入户 C_gpt |
| 2 | 2026-11-27 | [LTZZZ][每日] Deep 巡检与分流 2026-11-27 | A_closed | none | 日报状态同步 |
| 3 | 2026-11-27 | [seat:deep][指令][LTZZZ-DEEP-EVOLUTION-20261127-01] | B_deploy | deep | 补 daily-2026-11-27 + 进化四条 + 三问答复 |
| 4 | 2026-11-27 | [LTZZZ][裁决请求][EXEC-BLOCKERS-20261127-01] | C_gpt | relay-gpt | 签发 D1-D5；工作流地址本轮已由执行席修完 |
| 5 | 2026-11-27 | [seat:deep][质询][LTZZZ-DEEP-COMPETENCE-20261127-01] | B_deploy | deep | 24h 书面答复质询（逾期即红灯） |
| 6 | 2026-11-27 | [LTZZZ][EXEC] 实盘改为裁决即执行：执行器已上线待 key | C_gpt | gpt | 实盘 key 与 1U 属资金；券商侧等审核（D） |
| 7 | 2026-11-27 | [LTZZZ][PAPER] 模拟盘已上线：实盘归 GPT 裁决 | A_closed | none | 模拟盘已上线，练手入口有效 |
| 8 | 2026-11-26 | [LTZZZ][每日] Deep 巡检与分流 2026-11-26 | C_gpt | relay-gpt | PR#641 放行口径 + 付费 relay 授权形式；QQ 凭据归 owner |
| 9 | 2026-11-25 | [LTZZZ][每日] Deep 巡检与分流 2026-11-25 | C_gpt | relay-gpt | 队列“运行时元数据”口径；QQ IMAP 归 owner（E） |
| 10 | 2026-11-24 | [seat:relay][派单] 中转两单请代跑（issue #610） | B_deploy | relay-claude | relay.ltzzz.com 已上线，可用新域名重跑两单 |
| 11 | 2026-11-23 | Re: [seat:doubao] 讨论邀请 LTZZZ-TKT-20261123-001 | A_closed | none | ACK 与议题 A 答复已完成 |
| 12 | 2026-11-24 | [LTZZZ][每日] Deep 巡检与分流 2026-11-24（补发） | B_deploy | deep | #464 lease_expired 无 claim：按 24h 改派规则重派 |
| 13 | 2026-11-23 | [seat:meta] 收单/派单/收邮件 操作指南 | A_closed | meta | 操作指南已生效，ACK 已回 |
| 14 | 2026-11-23 | [seat:relay_gpt] META 三张 claim 工单待裁决 | C_gpt | relay-gpt | 裁决 META 三张 claim（P2M1/PHILO/MEMORY） |
| 15 | 2026-11-23 | [seat:desktop-gpt][讨论] 性功/命功分野三问 | B_deploy | desktop-gpt | 四行回答性功/命功三问 |
| 16 | 2026-11-23 | [LTZZZ][讨论] 性功/命功分野三问（WorkBuddy 转发） | B_deploy | desktop-gpt | 同 15，WorkBuddy 转发件，合并回复 |
| 17 | 2026-11-23 | [LTZZZ][每日] Deep 巡检与分流 2026-11-23 | C_gpt | relay-gpt | backlog 238 清理优先序；required checks；三数凭据归 owner（E） |
| 18 | 2026-11-22 | [LTZZZ][每日] Deep 巡检与分流 2026-11-22 | C_gpt | relay-gpt | PR#583 涉及付费通道资金语义，需裁决后合并 |
| 19 | 2026-11-21 | [LTZZZ][每日] Deep 巡检与分流 2026-11-21 | C_gpt | relay-gpt | funded 单缺签名（资金类）；PR#501 时序口径 |
| 20 | 2026-11-20 | [LTZZZ][每日] Deep 巡检与分流 2026-11-20 | C_gpt | relay-gpt | A3 五项口径；B1 funded 缺签名；A5 撤销固定期限 |

计数：A 5 / B 6 / C 9。
叠加标注：D 外部阻塞 1 项（#6 券商审核）；E 需 owner 给值 3 项（#8 QQ 凭据、#9 QQ IMAP、#17 三数后台凭据）。

## 三、本轮已部署

- PR #665 已合入 main（`9bf66b75`）：5 个 relay 工作流的 `LTZZZ_RELAY_PROXY_URL` 统一到 `https://relay.ltzzz.com/v1`，旧 `workers.dev` 域名清零。
- 新增回归测试 `scripts/tests/relay-endpoint-unify.test.mjs`（2 passed / 0 failed）。
- 这解决了邮件 #4 里「看着绿、实际两套地址」的阻塞。

## 四、下一步（不依赖裁决）

1. #10 用新域名重跑中转两单（relay-claude 复核单 + relay-gpt 裁决单），成本按 $0.05/次上限。
2. #3 补 `daily-2026-11-27` 与进化四条，并回三问（已逾期）。
3. #12 #464 按 24h 无人 claim 规则改派，不再等口头结论。
4. #15/#16 性功/命功三问合并成一份四行回答。

## 五、仍需 GPT 裁决（9 项）

#4 D1–D5 签发与 48h 升级口径；#6 实盘 key 与 1U 放款；#8 PR#641 放行与付费 relay 授权；#9 队列运行时元数据口径；#14 三张 claim；#17 backlog 清理优先序；#18 PR#583 资金语义；#19 funded 缺签名与 PR#501 时序；#20 A3/B1/A5。

## 六、边界

- 原厂 Deep 没有邮箱凭据，不能自行登录收件箱；本轮是「桌面席只读读取 → 原厂模型分诊」，不写成 Deep 直连邮箱。
- 邮件正文未落盘，仅保留主题、结论、哈希。
- 资金、退款终态、签名、私钥、钱包（含五签 Safe）未做任何自动动作。
