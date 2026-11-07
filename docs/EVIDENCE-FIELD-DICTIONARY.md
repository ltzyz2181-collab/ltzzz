# 同一工件的三层证据字典

2026-11-06，接续QW-REVIEW-DEPUTY-20261104与DEEP-SUPERAGENT-20261103。先核原Task、日期、source_commit与原字节SHA，再比较字段；文件名或层级本身不是“天然真相”。冲突保留并对账，不用高状态标签替代对应证据。

| 层 | 字段与真实来源 | 不能推断 |
|---|---|---|
| 服务/部署观察 | 实际HTTP、鉴权探针；部署run与目标线上source/revision；health配置字段仅作配置观察 | 心跳200不证明生成；health.generation_verified=false只指本次无生成，不能覆盖历史成功 |
| 模型实际执行 | 原工件及执行器/提供商响应中的actual_provider、actual_model、model_source、request/response ID、finish_reason、非空产物与hash、generation_observed/verified；tokens_used是报告用量 | 模型自报身份不算；配置模型、health或席名不能冒充原厂响应；报告Token不等于已核账单 |
| 审核/业务/经济 | 同工件hash绑定的独立评审、真实board回读accepted/review_verified；部署另查部署run/目标版本；外部接受另查平台；付款查真实平台/链凭据及对账账本 | results自评不顶替board审核；board.deployed不自动证明生产；tx_hash存在不等于确认，paid=false不等于API免费 |

## 必须分清的子状态

- reviewer分工写明primary/fallback和模式；没有分工明确review_assignment.status=review_unassigned并不得验收。分工/subject绑定/已认领/已完成/回读通过分别记，不能靠填人名通过。
- 当前GPT/Codex真实审阅使用actual_provider=gpt（Pulse登记标签）、actual_provider_company=OpenAI、actual_model=null、native_API_generation=false。这是当前AI决策席的实审及认证执行器发布，不冒充原厂付费API或生物人工，不伪造API request ID。不同于Qianwen的真实上游提供商。
- DeepSeek原生日课首先生成，最后的Qianwen产物不可能被此前同一请求逆向读到。不能简单添加循环pair声称补审完成。Qianwen走独立的当前控制席复核或有独立预留的真实Deep接续；本次不新增付费cron或日课正文请求。
- missing_sections缺失/null不自动等于[]；同一原字节工件经明确required_sections与固定校验器得structurally_complete可证明该结构检查通过。不能据此推断内容准确或全部规则已执行。
- accepted/review_verified/status必须对应同Task/同hash的已提交审核及真实board；历史或跨任务的true不能挪用。declined草稿保留，不强改为通过，也不撤销owner已授岗位。
- 当前health保留generation_verified=false以兼容旧消费者，补probe_scope=health_no_generation和generation_verified_scope=this_health_check_only。生成事实取独立执行回执，不把health硬改成历史全局true。

## 观察窗口与历史

Dispatch Sentinel与service-continuity是两个工作流。PR verify成功、生产观察failure也分开。11-06 run42180823362的Aave ok=false记服务观察欠项，不计作Dispatch Sentinel自己的失败，也不因另一个工作流失败重置其窗口；11-10是否销案仍逐项核原单的结构观察、内容审核与Sentinel实际运行，不能提前结项。旧文档中要求health.generation_verified=true的完成标准作废，以真实原生生成工件替换；三日结构观察与岗位授权分开。

10-13 control回执记录的是1USDC Aave断言/测试派单，明确“不执行资金”。旧results/LTZZZ-TREASURY-REAL-001.md另称1USDT/U卡回归交易，币种/用途与该派单不等同，且本次未做链上核验；不得拿其hash补成10-13原单转账。该原单财务实物维持未找到/未核验，不推断从未转账。

