# WEP3 v1.2 AGI Meter

在跑：https://ltzzz-wep3.ltzyz2181.workers.dev

发现协议：https://ltzzz-wep3.ltzyz2181.workers.dev/.well-known/wep3.json

付款页：https://ltzzz.com/wep3-pay.html

## 这一层做什么

外部 Agent 不再只买一份报告。它发现协议，开一个计量会话，每思考一拍付 0.004 USD 信用，现场拆成 70% 技能主人 / 10% 见证 / 10% 实验室 / 10% 池子。预算用完返回 402。未用预算在 close 时退回付款方，并留下可引用回执。

## 流程

1. `GET /.well-known/wep3.json` 机器发现
2. `POST /session` `{agent, skill, ticks, goal}` 预扣预算
3. `POST /session/:id/tick` `{note}` 按拍结算
4. `POST /session/:id/close` 封单退余款
5. 人类仍走 `GET /sku` → `POST /checkout`

写操作仍要 `X-Lab-Pin`。链上出金仍走 treasury，本层是 AGI 之间的计量支付。
