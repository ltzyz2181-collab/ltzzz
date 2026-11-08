# LTZZZ 本轮给其他 AI 的转发卡

主任务沿用 DEEP-SUPERAGENT-20261103。来源基线：3dccf57d517187106bb69c6e536d5181fe9af24c。
路由按 owner 本轮直接指令：豆包任务由 GPT 邮件直派；其他 AI 的部署/接续任务由 owner 转发。本文件发布不证明接收方已经收到、接单或执行。原有日课/运行中队列保持原状，不新购模型调用。

## 转发千问：请补原单落实回执

task_id：QWEN-FOUR-RULINGS-20261108
nonce：87eaac89ea441a46c893d118087eef2f
原派单：ops/dispatch/inbox/qianwen/20261108-QIANWEN-FOUR-RULINGS-DISPATCH.md
指定回执：knowledge/results/qwen-four-rulings/QWEN-FOUR-RULINGS-20261108.json

截至上述固定基线，指定回执尚不存在；只有豆包的转达/派单卡。11月8日日课 accepted=true 是另一个原任务，不能替代本回执。请读原卡后逐项交：
1. 保留11月7日拒收，不重审同一稿、不重购、不抵扣其他业务。
2. 审他席沿现有 writer 的 <date>-<worker_agent>-<receipt_sha256>.json 路径，真实审方写字段，不伪造签名。
3. null/缺失 missing_sections 不作无缺段证据；结构校验与内容接受分开。
4. Treasury 查找写已查范围、截止UTC、缺失原凭证及重开条件；不改财务事实为成功或确认失败，无新证据不重复空查。

回执包含同 task_id/nonce、四条各自 applied/blocked、逐条证据路径+固定提交、实际UTC/客户端/执行器元数据。模型来源没有可信元数据就null，不能模型自报。无仓库工具可把待落盘JSON文本交owner转GPT，由有工具宿主验证后落盘；在此前只算草稿，不说已写库。不得复制客户材料/密钥或改资金、旧审核原件/六份核心记忆。不要另建同任务/新nonce。

## 转发 Deep：承接原协调任务，用现有产品找最短可运行闭环

task_id：DEEP-SUPERAGENT-20261103
原 step_id：LOW-SPEED-CORE-FINANCE-20261108
原卡：ops/dispatch/inbox/doubao/LOW-SPEED-CORE-FINANCE-20261108.json
期望回执：knowledge/results/deep-superagent/coordinator-handoff-20261108.json

先查此原Task/step已有认领、租约和回执，未知调用不重放。请实际接续并交一份可执行接力：
- 核对已经交付的核心产品 products/releases/ltzzz-delivery-check-0.1.0.zip，原包SHA256=2669d667dd7e99be9ca7736fb2f206ee7d871e8d37b96cb680df12c55d38b252；原型通过不等于订单或收入。
- 优先核对既有uGIG/UUMit/WorkBuddy账号的一个真实订单/原申请，有订单必须带平台Task/package与确认、用途/许可、期限、报价和实际宿主；没有确认就记no_verified_order，不虚构外部单、不重复报名、上架或投标。
- 用一项原业务验证“Deep协调→指定席位处理→异源复核→实际宿主提交→平台回读”的最短路线；每环写真实接收方/能力/阻塞。平台保密输入无相应提供商许可不能转给模型或公开。
- 支付是另一个待验环节，不把雇佣支出当收入、不动五签、不提高现有机器预算。当前优先交产品/订单执行与能力清单，不为测试添付费API或付费cron。
- 当前客户端无执行工具时只交有源规划与准确接力，不声称已部署。待实际输入/宿主具备再沿原单推进，日常技术选择交GPT，不转回owner。

actual_provider/model 取真实执行器响应，未知填null；手动客户端接单不冒充原生API。先交接单/输入核查与一个明确下一动作，不重写整套架构。

## 转发 Grok：新签名器补丁到位后做独立复核

原 task_id：PLAN-PATCHGATE-ESCROW-20261023
依赖：豆包下一份生产者+消费者契约PR的确切head（目前尚未交付，缺head则waiting_input）
期望回执：knowledge/results/patchgate/signer-contract-independent-review-20261108.json

新PR到位后复核确切源码/hash和真实测试，不提前写通过：
- 业务error、ok=false、缺schema/revision/scope、错误链/用途、冲突布尔值均不能ready。
- configured来自现有绑定，control_verified来自可核验且适用的既有控制证明；二者不混同；缺证明保持unknown。
- status为只读兼容扩展，不签名、不转账、不改变nonce/账本，不泄露凭据；Aave与anchor分别验证scope。
- 实测命令/输出和未实测项分别记；97项历史回归不代替新契约反例或生产部署。
只用公开工程输入，不调用钱包/付款/新模型API。回执写真实客户端/实际提供商来源、subject commit/hash、accept/reject/blocked与具体理由；没有新head先记等待输入，不重复审旧稿耗调用。
