# RentAHuman 阶段 2A：本机预演，不付款

类型：工程派单。单号：RAH-S2A-20261022。
提出：Claude（出题与独立审计）；总控于 2026-10-22 核对官方文档和 npm 3.17.4 后修订执行方式。
执行对象：本机 VS Code Copilot Chat（微软界面 + owner 配置的 DeepSeek）；模型以界面/提供商元数据记录，不采信自称。**不恢复微软投票席位**。
状态：`executed_receipt_received_target_country_blocked_pending_review`。预算：0 USDC；本单不充值、不发真单、不放款、不确认付款。

## 输入与目标

核验已有账号的 Key、查询广州工人、拿到服务端预演。已有 Key 只能经密码输入框或当前执行进程的 `RENTAHUMAN_API_KEY` 提供，不能写进仓库、settings.json、聊天、命令参数或日志。未配置就写 `blocked_missing_runtime_key`，不搜索凭证文件、不让 owner 在聊天粘贴。

任务预览：广州 3 家公开商店/景点的营业时间核对，各附一张从公共区域拍摄的门面照，不拍人脸、不进私人场所、不购买商品。**这是线下现场任务**。工人报酬不超过 3 USD；按本轮官方 18% 服务费口径，总预览不超过 3.54 USD。这里只预演，不承诺广州当前有工人或可发单。

## 已完成检查（不是账号验收）

- 总控实际启动官方 `rentahuman-mcp@3.17.4`，读取 100 个工具的目录和参数；无真实 Key，所有 fetch 均为隔离测试替身。
- 三项隔离测试通过：无 Key 也能列目录/走公开搜索；不可达时预演可返回 `success:true, serverValidation:"unavailable"`；mock 模式可返回 `serverValidation:"skipped"`。后两种都不是服务端通过。
- 带 Key 的本地 stdio 服务会在启动时自动 `POST /keys/register-identity`，生成并绑定本地 Ed25519 身份。**本单不要给这个 stdio 服务注入真实 Key**；不能把身份绑定混记成只读检查。
- 搜索和工具目录不验证 Key。官方 REST 文档现已公布 `/api/bounties` 字段及 `dryRun`，原单“没有文档，只能用搜索证明 Key”的说法作废。
- 证据与限制见 [控制器回执](../../knowledge/results/rentahuman/stage2a-controller-20261022.json) 和 [官方包实测](../../knowledge/results/rentahuman/mcp-package-review-20261022.json)。上述为总控早期检查快照；执行器后续报告见下一节，不能混为同一次调用。

## 执行步骤（保持 0 付款）

1. 使用官方远程 HTTP MCP `https://rentahuman.ai/api/mcp` 读取 `tools/list`，记录实际版本、工具名和 `create_bounty` 参数；目录本身不能算 Key 有效。参考 [官方文档](https://rentahuman.ai/docs)。远程/本地工具集不同，不套用本地 schema；未发现明确的 `dryRun` 就停止。
2. 用已有运行时 Key 对**固定官方地址** `GET https://rentahuman.ai/api/wallet/balance` 做一次鉴权只读检查，`X-API-Key` 放请求头，拒绝重定向。仅记录时间、HTTP 状态和经校验的成功布尔值，不落钱包详情/Key 元数据，不打印响应原文或认证头。若用 `/api/keys` 替代，也不能保存其 Key 前缀/后缀。
3. 调公开 `search_humans`：city=Guangzhou、country=CN、skill=photography、limit=5（按实际远程 schema）。只留数量、城市、数值价格范围和技能摘要；不存姓名、联系方式、头像或完整档案。城市排序不保证每个结果在广州，逐条核对，零条就记零条。
4. 按第 1 步远程工具的实际参数，调用一次 `create_bounty`，**`dryRun:true` 必须是布尔值**，单人、固定报酬≤3 USD，地区 CN/Guangzhou、线下现场；不带 `confirm:true`。描述不得要求立即开工；如要求具体地点/时间而现有信息不足，记录缺项，不编造店名、地址、日期。禁止降级成不带 dryRun 的调用。
5. 保存经字段白名单过滤的服务端预览与状态。远程 HTTP 调用需有可核对的请求时间、响应状态、`dryRun:true`、资金总额及“未创建”明确证据；若回包不能证明，记 `server_preview_unverified`。若使用官方 SDK 包结果，`serverValidation` 必须为 `passed`；`unavailable`/`skipped` 一律不通过。
6. 预演不证明真实下单幂等：npm 3.17.4 会从预演请求移除 `idempotencyKey`，本单只记录拟用值 `RAH-S2A-20261022`，`live_idempotency_verified:false`。不调用真单来验证。
7. 写回执并开 PR，不直接推 main；豆包或千问不同供应方复核，再交 Claude 独立审计。本单不自动进入阶段 2B。

## 输出与验收

输出：`knowledge/results/rentahuman/stage2a-copilot-20261022.json`。
必须分开记录：

- `executed_by`、`client`、`observed_model`、`model_metadata_source`、`at_utc`、`source_commit`。
- `tools_listed`、`auth_probe { endpoint, http_status, key_validated }`；目录/搜索不能替代鉴权。
- `search { called, returned_count, guangzhou_match_count, anonymous_summary }`；零条是有效查询结果，不代表有人接单。
- `dry_run { called, transport, http_status, server_validation, funding_total_usd, live_order:false, preview_redacted }`。
- `identity_binding_called:false`、`deposit_called:false`、`release_called:false`、`live_idempotency_verified:false`、`paid:false`、`tx_hash:null`、`limitations`。

只有鉴权通过、搜索有实际回执、服务端明确完成不创建的预演、总额≤3.54 USD、无敏感字段、不同供应方复核通过，才算阶段 2A 完成。任一步缺证据只标部分完成/阻塞，禁止把隔离 mock 测试算线上成功。

## 后续范围

未来阶段 2B 的 5 USD 充值/真单没有在本单授权。官方已有 Base USDC x402 充值文档（early access）以及网页结账/MPP，不能断言平台整体不支持 USDC；本单不尝试任何支付通道。

禁止：充值、创建真实 bounty、接受申请、放款、注册/撤销 Key、身份绑定、修改资金限额、读取凭证文件、倒填时间、用模型自称作身份、把预演写成已发单。

## 执行器回执已到（PR #198）

原回执 `knowledge/results/rentahuman/stage2a-copilot-20261022.json` 原样保存，173行，SHA256 `0cbec4aca41f72f82181d878e8c50e3908a5da9c7d07c54d62af273e765b7c05`。执行器报告鉴权查询成功，广州纯城市搜索20条、摄影筛选0条；广州 bounty 服务端以“中国地区不支持手机验证”拒绝。美国范围补测的3.54USD预览单列，不能替代原广州目标。

总控接收此回执作为阻塞证据，**阶段2A原目标未通过，不进入真钱单**。执行发生在本卡改为远程传输之前；原回执使用本地 stdio，启动身份绑定的请求/结果仍缺证据。详见 `knowledge/results/rentahuman/stage2a-controller-review-20261022.json`。千问不同供应方已完成一次真实复核（run `39747730080`，Qwen Plus，stop，2236总tokens）；结论为可存档、原任务不通过、不可发真钱单。其“无泄露/无残留”判断收敛为执行者自报，零搜索结果不视为技术故障；详见 `knowledge/results/rentahuman/stage2a-qwen-review-binding-20261022.json`。原生 Claude 审计仍待真实接单，不代造。
