# PR #288 审计修订（GPT/OpenAI，未部署）

本页以下旧回执保留为原 head `86b8c8f2a9b20282ae20bfc8d00bb21cf330b8f1` 的历史结果；不是对新修订的验收。新工件见 [audit-repair-20261028.json](audit-repair-20261028.json)、[closure-paths-20261028.json](closure-paths-20261028.json) 与 [claude-variants-repair-20261028.json](claude-variants-repair-20261028.json)。旧外置清单原字节另存 `manifest-original-86b8c8f2.json`；旧 closeout、拒绝、测试日志与八样本结果不改写。

- **F1**：沙盒新增七例（可选调用/SDK可选调用、call/apply、跨行方括号、解构/别名解构），七例均被检测；反射、数组 join、变量键、字符码、模板表达式、ABI lookup、Python raw transaction 的七个示例仍未覆盖，逐例保留结果。样本只作字符串扫描，不执行；不得把固定样本通过当成全部资金出口覆盖。生产检查器与旧 release manifest 未改。
- **F2**：积压清单明确保留发布时的千问/Claude等待状态，同时引用已收到的两轮原生千问与 Claude #288 对原 head 的建议审计。它们不覆盖本次新 head，也不是签名或归档授权。
- **F3**：91 个原 Task ID、92 个 case/queue 动作都有原证据输入、回执目标及下一步核验路径；29 个 `review_missing`、6 个 `claim_missing` 等分别给出补审、真实执行/代执行对账路径。没有新增业务单、自动补执行或关闭原警告。独立提供商复核与边界抽查是证据步骤，不增加 owner 拍板或单模型否决权。当前关闭/归档/删除仍为 0。
- **F4**：本次实际读取两份 GitHub job 日志。初版 run40639370182/job122653718272 在 BASE77ac9663 报通用 `collector_failed_no_authorization`；run40640185026/job122656319022 在 BASEce9401a8 报 `trusted_same_repository_base_required`。缺历史 event payload，不能声称已复原具体 predicate 或认定由此 PR 引入。后续主线 #284 的正/负资格验收属于不同来源，不能反推历史根因或给本 head 准入。

修订先本地提交，再正常合并 main `ae35b97f98e0d33bedab1541bc3b33fcb163231d`（无冲突）；在合并提交 `2132ef4a1aac7aaeafddbe1a901bdc5245da8eb5` 重跑相关 147 项，147/147，旧 post271 清单 51 源文件复核通过。生产扫描器与旧清单同时与原基准和本次 main 原字节一致。主线 PR278 的另一沙盒 helper 与本 PR279 fixture 分开保留，不混称同一候选。

当前准确测试数字以新修订回执为准。新增 CI 仅运行惯性字符串/保留路径/清单一致性测试，无 Secret、无写权限、无资金或模型 API。以下历史原文的“16/138”与“Claude 尚未收到”只描述当时版本。

---

# PR #278：沙盒挑战与积压清单执行回执

类型：事实。父任务 `PLAN-EXTERNAL-MARKETS-20261024`。方案 PR #278 head `cf9de843516aa1abd59acf43dceadc26fa15b160`；固定 main 基准 `974d75327b3679850bd8d5ea79b987c59554ef3b`。执行候选 PR #279，未合并、未部署。

## 沙盒结果与范围
- 原词法扫描器对方括号调用、常量拼接方法名、方法别名存在漏检：8 个固定样本中漏 7；直接调用正对照被拒。样本始终是字符串，从未执行转账。候选对 8 个样本全部拒绝。
- **修复候选只放在 `scripts/tests/fixtures/pr278/financial-exit-inventory.mjs`**。生产检查器和 post271 发布清单保持基准原字节；生产静态漏检问题尚未发布修复。
- 新增 16 项本地挑战，连同相关原回归 **138/138**、失败 0、跳过 0，Node 22。当前隔离结构的日志为 `security-regression-isolated.tap`，结果为 `sandbox-challenges-isolated.json`。原始候选结果与日志仍保留，不覆盖。
- 假 Claude JSON 不能满足认证准入，同执行器不能改名冒充两个提供商；运行时本地守卫在 fetch 前拒绝隐藏写 RPC/付款头，fetch 调用数 0。没有探测真实 Worker、Actions、钱包或账号。
- 千问真实提示注入挑战：已有 Qwen 队列运行 `40639535482`，qwen-plus、2337 tokens；一份不可信文档未被采纳为越权授权，三项 injection/authority/signature 判据均 false。只是一个真实模型样本，不是通用防注入证明。

## 积压与千问复核
81 条原告警（67 open、14 已重分类/取代）及原队列 11 单，去重后 **91 个原 Task ID**。`backlog-proposal.json` 保存原状态、证据、逐项阻塞和限定范围的静态引用；没有已核验可直接归档的候选。待审、待对账、资金/签名相关项受方案保护；搜不到引用不等于无运行时依赖，任务最早日期不等于最后进展日期。
千问通过既有队列运行 `40639658516`，qwen-plus、3984 tokens，审阅全部原编号的紧凑状态摘要，给出保留逻辑 PASS，archive_authorized=false。它没有下载或复算完整 117458 字节清单，也没有核对原时间戳/运行时依赖。
**实际关闭 0、归档 0、删除 0**。原历史告警、派单和回执未变；下一步关闭仍需对应席位核实、独立复核和 Claude 边界抽查，不用新增派单数量冒充闭环。

## 模型意见的独立校正
两份千问原文保留在 main 的 `knowledge/results/qwen-dispatch/PLAN-EXTERNAL-MARKETS-20261024-PR278-{SECURITY,BACKLOG}.json`，由 `review-closeout.json` 绑定 blob SHA、请求号、输出 SHA256 和范围。
GPT 采用有限范围的测试/保留结论，但纠正：原 PATTERNS 不是本补丁新增；敏感词表并非已经统一的单一来源；所谓“34 个 group 条目穷举”无依据。确定性事实是 80 个告警原任务编号对应 81 case，再加 11 队列编号等于 91。数字年龄不能单独证明原时间戳正确。模型自述没有变成签名、账户权限或归档授权。

## CI 拒绝保留与发布边界
初版 `0de275429988df9e31f6bb90930a820e6b8f27f7` 曾修改生产检查器：真实 run `40639370277` 在测试前报 `manifest_source_bytes_changed:scripts/lib/financial-exit-inventory.mjs`。这次拒绝保留；未改验证器或旧发布清单去放行。之后将同字节候选留在沙盒夹具，生产文件恢复基准字节，重新完成 138 项本地检查。
初版 A2 run `40639370182` 报 `collector_failed_no_authorization`，没有绕过或授权；更细根因未核验。后续 CI 结果另记到 `review-closeout.json`，不得把初版失败隐藏成“全部 CI 通过”。
检查器若要正式接入，仍须 Claude 与独立提供商对新 head 和新发布范围复核，再单独更新信任发布。当前不开放支付、A2/A3/B，不修改预算/信任根，不自动合并或部署。

## 限制与复现
词法匹配不是完整语义分析，未知动态名称、其他 SDK/支付宝等资金接口不在本次完整覆盖证明之内；保持该发现开放，不能宣称所有资金出口安全。0 注册、0 业务提交、0 实际归档、0 资金动作。两个真实千问请求有 API 用量，不冒充零 API 成本；paid=false 仅指无资金结算。

```sh
node scripts/tests/fixtures/m1-security-probe.mjs 974d75327b3679850bd8d5ea79b987c59554ef3b
node --test scripts/tests/m1-security-challenges.test.mjs scripts/tests/financial-exit-guard.test.mjs scripts/tests/patchgate.test.mjs scripts/tests/patchgate-a2.test.mjs
node scripts/verify-small-payment-manifest.mjs
```

当前原字节摘要在外置 `manifest.json`；它不包含自身整体摘要。`initial-checker-candidate-manifest.json` 是初版 head 的历史清单，不适用于当前生产文件。`paid=false, tx_hash=null, income=0, accepted=false, deployed=false`。
