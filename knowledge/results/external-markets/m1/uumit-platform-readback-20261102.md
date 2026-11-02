# UUMit 平台回读回执 — 2026-11-02（豆包执行端）

- Task: PLAN-EXTERNAL-MARKETS-20261024 / UUMIT-FREE-PRACTICE-20261101
- 执行席：doubao｜执行端：世章桌面 `.workbuddy/skills/uumit-agent` v2.8.0（6 扩展全 2.8.0，validate_skill ok=21 文件/380 路由/6 扩展，auth 文件存在，未读凭证内容）
- 回读时间（UTC）：2026-11-02 08:12–08:52Z
- 回读方式：本地执行端 `scripts/rest_request.js` 只读 API（非浏览器登录墙通道；浏览器登录墙在世章被 `/login?redirect=...` 拦截，request_action 交接超时未接管，如实记录）

## 1. 技能详情（GET /api/v1/skills/20167d5a-5d3b-45e7-8521-e8cf7e58cd09）— 属实项

| 字段 | 平台现值 | owner 报告 | 结论 |
|---|---|---|---|
| id | 20167d5a-5d3b-45e7-8521-e8cf7e58cd09 | 同 | 一致 |
| name | LTZZZ来源核对清单 | — | 回读确认 |
| status | active | active | 一致 |
| is_public | true | public | 一致 |
| audit_status | approved | approved | 一致 |
| ut_price | 99.00 | 99.00 | **一致（99 UT 属实）** |
| currency | UT（平台计价单位） | — | 官方文档+字段语义核实：**UT≠人民币** |
| pricing_model | fixed | — | 收费档 |
| order_count | 0 | 0 | 一致 |
| auto_accept | true | — | **已开（min 10 UT / max 3 并发）** |
| created_at | 2026-11-02T01:26:52Z | — | 今日创建 |

## 2. 99 UT 与『原有免费定价』冲突判定

- 平台实况：`ut_price=99.00`、`pricing_model=fixed`、`paid` 语义为收费档（官方 API_REFERENCE：`payable_amount>0` 即收费，不得默认标"免费"）。
- 『原有免费定价』依据：派单卡第 9 行"不更改原有免费定价"（owner 转述，无独立变更记录可查）。
- 判定口径：UT 为平台计价单位、非人民币；`price_ut=99.00` 若属实即表示该技能当前收费档，与"原有免费定价"表述矛盾。**未查证变更记录前**：不对外称免费、不擅自调价、不把 UT 当人民币。变更记录需 owner 登录后台回读或提供。

## 3. 执行端/真实生成/产物回传验通状态

- 宿主执行端：世章桌面已装 uumit-agent v2.8.0 全套（国际版，auth 已授权），`validate_skill` 通过；本地 `discover` 只读自测 ok（返回真实候选能力，未 invoke、未扣费）。
- 真实生成：尚无一笔平台订单（orders=0, seller_pending=0）可供真实生成+产物回传验收；不虚构交付、不伪造回执。
- LLM 模型列表（GET /api/v1/llm/models）：返回空数组（平台侧当前无可用模型列表），真实生成能力待有订单后按实际执行器响应记录 actual_provider/model。

## 4. 首轮接单

- auto_accept=true 已在平台侧开启（非本轮所为），min 10 UT、max 3 并发；当前平台 0 单可接。
- 未重复注册、未重复上架、未新开注册/广告/外部联络；未触碰支付/钱包（wallet 只读：cash=0、UT=300 可用、可提现 150）。

## 5. 未决/blocked

1. 变更记录（99 UT 与旧免费定价的演进）需 owner 后台回读或提供 → 浏览器登录墙未过（request_action 超时）。
2. 真实生成+产物回传待平台出现订单后按最小端到端验收推进。
3. 首轮接单在验通前不盲开；有单即按 1 并发/最多 3 单推进。

## 6. 合规数字

- 新注册 0 / 新上架 0 / 接单 0 / 转出 0 / 付款 0；paid=false、tx_hash=null、income=0。
- 本轮模型 API 调用 0 次（全部为只读 REST 自测，无原生模型生成）。
