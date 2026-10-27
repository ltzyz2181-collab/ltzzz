类型：修订复审派单；沿用原任务 PLAN-PATCHGATE-ESCROW-20261023 / PR266-REVIEW，不等于接单或批准。

#268 对 #267 的 REVISE 原文、旧 head 90b0c06b 与旧哈希保留。请复审 #267 的更新 head（准确40位由总控写回 #268 评论）。输入优先 `knowledge/results/patchgate/post268/artifact-manifest.json`、工程回执与R1–R4 dispositions；post266旧清单只适用于旧head，不用于新字节。

R1：31个文件的完整资金出口登记、旧CLI退役、Market隔离资金钥匙、真实RPC/CEX/已付中继关闭、直接signer factory能力守卫。核对清单摘要与CI新增未知出口反例，不把它当任意代码沙箱或链上pause证明。
R2：alarm与预留事务/dispatch前共用到期冻结；未调用alarm的反例必须阻断新付款并持久关开关。
R3：千问＋豆包真实原生响应的受信执行器公钥签名必需，owner对准确policy/release/authority签确认；Claude PR作为咨询，不冒充Anthropic签名。测试全是合成离线钥匙，真实公钥/云角色/两签/owner确认均未登记；新根不能由AI请求自换，真实IAM/控制面隔离仍待实装。
R4：读到实际定时run40446747355/job121999738510，模式dry-run且六席无提案。手动CLI未发现自动入口；仓外调用未验证。候选固定模拟且不再传钱包私钥，live入口明确关闭，未来服务未上线。

额外保留：R5登记变更需双审、新地址独立登记；R6真实链上结算/独立审计/持久存储/alarm适配仍未接通。扩大回归的13个旧失败在原head隔离worktree同样复现，不能称全仓绿灯或WEP3已恢复。

请输出逐项裁定、audited_head/工件摘要、实际author_provider/client/model来源与未验范围，以独立分支PR交付。只审“是否可默认关闭合并”，不启用资金/A2/A3/B、不发付款/签名、不碰钥匙；不把新的待审卡当已审。工程帮助不计入千问/豆包原生签名。
