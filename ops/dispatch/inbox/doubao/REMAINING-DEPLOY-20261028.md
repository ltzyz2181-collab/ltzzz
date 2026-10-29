# 豆包剩余执行项：总控收尾修订

原任务 PLAN-PATCHGATE-ESCROW-20261023，步骤 SPLIT-SIGNER-INFRA-20261026；Claude PR282 原文保留在 d50f5b2dc430f2f44dbb26876f480061e051a48d。以下为 GPT 按 owner 指令修订，不冒充豆包原生执行。

## 已有证据，不重做

- A2 检查/签名的49个沙盒探针已由总控本轮重放，全部符合预期。探针使用进程内临时测试 key，不是生产签名人；原豆包报告保留，新回执在 knowledge/results/patchgate/closeout-20261028/a2-probe-replay.json。
- PR278 原候选确实漏掉传递别名链。总控先保留失败测试，再修订 tests 目录的沙盒候选：八例覆盖由7升8；生产扫描器仍漏7例，尚未修复。结果放回原PR，不与PR279的不同源码混称同一候选。

## 需要有真实火山部署通道的执行端接力

逻辑席位或 Ark 模型 Key 不证明云资源部署权限，不再声称“只有豆包能做”或“豆包已有权限”。本会话没有该云身份。若你的当前执行环境具备火山资源部署身份，沿用原任务认领并执行；没有则回报具体缺项，不能让模型编造云部署。

1. 回读实际账号、区域、产品和部署角色的公开标识。使用现有官方控制台/已配置身份，不把 AccessKey、私钥或模型 Key 发到对话或仓库。
2. 固定已审主线，按 scripts/build-patchgate-signer-release.mjs 生成源码清单；本次只读重新生成的库存固定在 main 提交 `31098268afc0463c047500bcf00b2b243b786279`，21 个文件，摘要 `5a5ccf185bfdf5411133430f9e29e67855c2d5dc586e43f21ae2838a8fd8fc87`。旧摘要 `53847961…b5217` 保留为历史及现有未启用登记，不以本卡覆盖登记。这仍不是可直接部署的完整火山包；真实部署前从确切已审提交重新构建并核对全部依赖。
3. 接好真实持久化事务和 CLOUD_SIGNER 适配器；确认目标产品是否支持现行 Ed25519。不能把其它算法的 KMS 当成可直接替换。私钥只在火山侧生成/保管，禁止 GPT runner 代生。软件 API 不返回私钥不等于 HSM 不可导出，要如实记录管理员/发布者/存储读取权限。
4. 默认关闭服务部署，回执给出公钥/SPKI、源码摘要、service/version/URL、云账号绑定、独立控制面代码摘要/IAM 读回。相同 key 重启后用 fresh nonce 签挑战并验证公钥不变；不得用进程内 mock 代替重启。
5. 同服务完成一次原生豆包响应和签名、公钥验签；先持久预留、未知不重放、沿用现有日上限/OIDC。保留实际 provider/model/request ID、原 verdict 和用量；回执只含公开证据。交 GPT 登记候选并交千问/Claude复核，不自行打开A2、A3、支付或正式五签。

外部实练仅真实平台任务、零押金/零支出、同时≤3。2hives没有包就等待；UUMit已有owner注册/一个WorkBuddy绑定的报告，不重复注册、不抢邀请、不填钱包或ID，仅观察。无新结果不写重复回执。

补充已核实的技术条件：官方 AsymmetricSign 参数表目前未列 Ed25519（https://docs.volcengine.com/docs/key-management-system/asymmetric-sign-asymmetrickeysignature?lang=zh）。不能仅补一个云凭据就宣称现有验签能接 KMS；兼容产品或独立算法适配需先实现并审核。实际账号/区域尚未调用验证。本轮不改变算法或信任根。

## 2026-10-28 用户补充：已配置云资源部署身份

用户本轮直接回答“已配置云资源部署身份”。这条记录更新的是连接种类，不是密钥内容，也不是 API 权限测试结果。不要再次要求用户提供密钥或重复配置账号。

当前 GPT 受管云环境的已生效观测仍是：无已挂载 outbound identity、Secret 或 runtime variable；未找到可直接调用的火山控制面连接，现有浏览器连接也没有火山站点的已保存登录记录。这里只能说明当前 GPT 执行端未取得连接，不能断言用户给豆包配置的身份不存在。

接力到**实际配置该身份的执行端**后，先仅做现有身份的只读核验：公开账号/角色标识、区域、已使用的云产品、可用资源以及调用的官方 API/CLI 和 request ID。不要打印配置内容、认证头、访问密钥、会话令牌或任何私钥。权限错误保留精确原因；不自动换账号、不扩大 IAM、不创建另一套账号。

本次还缺的非敏感信息是“身份配置在哪个执行端/已有连接名称”，不是新增 owner 审批。已通过现有异步问题一次性询问位置，等待回复；没有位置不瞎填账号、区域或服务地址。定位后沿用本卡原 Task ID/步骤与已有认领机制，再推进默认关闭的部署和原有独立审计。

公开核查回执：`knowledge/results/patchgate/split-signers/volc-access-followup-20261028.json`。原生 API 阅读/计划的旧 ACK 不是具备工具的云执行端接单；不为更新卡片重新购买模型 ACK，不改既有 step_id。A2/A3/B、付款、预算、信任根和正式五签保持原状态。

## 2026-10-29 GPT 接手收尾

owner 已明确身份位置为 LTZZZ **GitHub Actions**；`VOLC_ACCESS_KEY` / `VOLC_SECRET_KEY` **未更新**。不要再问身份在哪，不把 Ark 模型 Key 当控制面 AK/SK。真实失败为 run `40798605209` / attempt 1 / source `bf52ada784b7e25689ed428dab2e8f28433b576e` / job `123201006002`，`InvalidAuthorization`，部署未执行。

GPT 正在原步骤修订格式检查、去掉无关 ListUsers 权限依赖、移除不完整匿名签名入口，复用主线 OIDC/证据/原生响应核心并补共享 NAS 持久适配与闭包打包。详情 `docs/VOLC-SIGNER-CLOSEOUT-20261029.md`。新 head 通过实际 CI 后交 Claude/其他提供商审计；不改登记或激活开关，不宣称已部署。请沿用此接手卡，避免并行向 main 覆盖同一部署入口。


## 2026-10-29 18:48 UTC：真实 Actions 只读核验，更新旧凭据与资源状态

原 Task ID/步骤不变；本节为 GPT/Codex 实测与接力，不冒充豆包接单。#303 文档和 #307 已审探针已合并；#308 的通过仅限四文件，不代表部署或公钥登记。

- 真实 run **40934245588 / attempt 1**，source **fd0dec310070b22ea406f774e05c2394b1e7921d**，readback job **123660539517** 已成功。采用 #308 已审两个模块的固定 SHA256，现有 GitHub Actions IAM 身份调用真实 VeFaaS；旧“Secret 未更新/只有无效凭据”的表述只保留为历史，不再拿它当当前阻塞。
- 实际函数 **jt247vfx / ltzzz-signer-volc-attest**，账号 **2131926778**，北京；GetFunction request ID **20261030024841974D7B7C901DAE647C31**。这是目标资源 owner 绑定，不是已查清调用 IAM 主体和 NAS 读者。
- **nas_mount_declared=false**；官方 GetFunction 的 NasStorage.EnableNas 表示 NAS 挂载开关，未读到启用声明不能算实际共享挂载完成。**CodeSize=3122**，实际已部署源码字节仍未核验，不能靠环境变量摘要或仅凭大小说它已经是已审闭包。
- 真实触发器 1 个，但探针未取得可允许的网址（url=null）；不能从 null 推断一定是域名拼写错误，也不能把历史 voiceapi.com 改写后拿来调用。首次非标准路径会被省略，不公开潜在路径令牌。
- 固定真实回执：knowledge/results/patchgate/split-signers/volc-closeout-20261029/live-readback-40934245588-1.json；当前阶段入口：knowledge/results/patchgate/split-signers/volc-closeout-20261029/runtime-verification-current.json。

请具有原火山控制台/部署身份的执行端沿原单继续：先核对工单 **T-2026102917230001** 的实际回复、现有 NAS/VPC/挂载配置是否保存并发布生效；回读原 NAS、实例 IAM Role、UID/GID 与实际可挂载/读取/改代码主体，不能把未知清单写成“无其它读者”。不要删 NAS/账本/密钥或另建重复资源，不把 /tmp 当持久存储。当前已审包不得作为已部署事实；确认存储与已审源码真正就位后，才有条件做不同 instance_boot_id 的 fresh nonce 重启同钥验签及一次原生豆包签名。仍未提供部署验收/公钥登记/激活准入，不放开 A2/A3/B、付款或正式五签。

此火山只读快照没有云写入、重启、原生豆包调用、私钥读取或公钥登记；这些真实验证继续记未完成。另有既有队列的按需原生千问交叉复核与清理抽查，不能把 model_calls=0 解读为整个任务没有模型 API 成本。请求与回执均已存在，不重跑旧版未脱敏 detail workflow、不重复索要 Key。若当前执行端仍无可用控制台会话，记录具体通道阻塞，不声称已自动被唤醒。
