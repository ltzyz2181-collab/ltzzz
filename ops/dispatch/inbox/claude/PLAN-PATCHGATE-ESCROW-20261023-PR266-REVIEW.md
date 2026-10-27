类型：原任务接力修订，非已接单、非已批准；原任务 PLAN-PATCHGATE-ESCROW-20261023，承接 #268/#270 与 #271 的显式决定。沿用本卡，不新增付款或采购单。

读取：PR #267 本次通知固定的新head、knowledge/results/patchgate/post271/artifact-manifest.json、docs/SMALL-PAYMENT-AUTONOMY-20261027.md、完整 authorization/lifecycle/policy/runtime 与测试；post268清单仅适用于旧48f03b92，不拿旧批准覆盖新head。源码/文件摘要从固定Git blob算，不采信模型自述。

本次：删除owner_confirmation及owner公钥激活门，不转给任何个人；两家原生执行器双签仍必需。公开仓库记录须原字节回读，然后冷却24h；付款时签名仍须有效<=24h。阶梯10/25/50/100%，本级连续10笔按时结算/独立审核后才允许新双签提一级；异常冻结，解冻需新双签+未用过的新release，重回10%并冷却。原20U硬边界/预算/自交易/预留/未知不重试/出口守卫不变。

重点反例：过期签名跨冷却、换根继承冷却、并发预留/发单、伪造公开读回、签名命令换stage、历史付款凑数、旧release回滚、异常与发布/解冻竞态、已付款但未审、定时器漏跑。要求保留原拒绝与失败、准确source_commit/原字节SHA256、actual_provider/model/metadata_source、run/attempt/request_id与未读范围。工程测试不是线上支付验收；paid=false、tx_hash=null仅指本轮无资金动作。

真实payment_policy_review/payment_anomaly云执行器/公钥仍未登记，机器签名状态为blocked_not_provisioned；没有真实通道不造签名，也不向GPT交私钥。可先交带实际原生来源的工程咨询意见，不能把派单或合成测试计成通过。R6/S3真实结算/独立审计/持久存储/alarm/公开发布回读适配仍待实现，S1残留Secret治理另列，不掩盖13项旧失败。

禁止：启用支付/A2/A3/B、钱包签名、真实充值/采购、新增付费cron、替其他提供商署名、用owner/GPT身份单独激活或解冻。

顺序：千问与豆包先交当前head的真实复核并逐项处置后，再点名你做最终审计。本卡现为等待前置，不能沿用#270的旧head批准；若尚未收到两席回执，状态保留waiting_qwen_doubao_review。

本次固定执行基准：41f87856b97cc5b95cc88c040e164456c826877a
主入口：https://github.com/ltzyz2181-collab/ltzzz/blob/41f87856b97cc5b95cc88c040e164456c826877a/knowledge/results/patchgate/post271/artifact-manifest.json
清单原字节SHA256：28c5eaf2a9273e913258bc5c250cb2a84f542fcb0a87914540d1d389f3bd3fd6
实际runner付款225/225（run40487043101）与PatchGate243/243（run40487043373）；原生签名/千问审计/豆包收尾作业均skipped，不冒充本席已复核。主线本卡只是接力元数据，业务代码仍在未合并PR #267。 两席复核未到齐前，不要求你给最终放行。
