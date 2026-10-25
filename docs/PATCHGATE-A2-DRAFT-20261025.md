# A2 最小适配器草稿：待原生双审，不启用

类型：工程实现说明。原任务 `PLAN-PATCHGATE-ESCROW-20261023`，不新开业务任务。代码作者：当前 GPT/Codex 会话（OpenAI）；测试密钥均为测试进程临时生成的夹具。

本稿新增 docs-only 合并库和默认关闭配置，未接生产工作流、未登记生产签名密钥、未执行真实合并，也没有资金能力。现有 A1、A2/B 开关、钱包配置和额度保持不变。

## 已实现并本地测试的范围

- 整个执行器登记与已有信任根一同校验：一个执行器只能绑定一个实际提供商，历史停用密钥也不能换标签；公钥必须属于登记执行器。内存签发器核对私钥对应公钥、角色和有效期，不生成/落盘/发现任何生产私钥。
- A2 初次只允许普通 L0 Markdown；敏感路径仍由原分类器升 L3。候选不能修改约束它自己的检查。逻辑席位不证明提供商身份。
- 经 PR #244 B1 修订，密码准入使用千问/Aliyun DashScope 与豆包/Volcengine Ark 两个实际提供商的执行器签名；Claude 仍经 PR 作阶段审计，由基础设施签回读证明但不冒充 Anthropic、不计入模型签名数量。三项缺一均阻断，详见 `docs/PATCHGATE-A2-B1-CHANNEL-20261025.md`。
- 检查结果必须全部 completed/success、精确绑定候选 head、覆盖指定检查名，且与非作者 checks 签名里的原始检查数组摘要相同。
- GitHub API 包装器只接受本仓固定 PR/main/ref 读取、隔离分支 CAS、create-only 回执和携带确切 head SHA 的 merge 请求。不允许任意端点、改 main ref、强推、覆盖文件或重定向。
- 预留以 `task_id:head_sha:merge` 摘要建立共享 GitHub ref。两个同时 runner 只有一个能取得预留；未知提交或未知合并结果不删锁、不重试；预留后失败会尽力写独立结果。正式 runner 还须保存 Actions 工件作为 GitHub 写入故障时的证据。
- 合并前再读 PR 和 main；head/base 变化、外部作者、fork、draft 或 mergeable 不是 clean 均拒绝。合并后再读 PR 的实际 head 和 merge_commit_sha。
- 最高风险通知评论者检查额外约束准确 GitHub 数字 user ID、login 和非作者 executor 白名单。这是待接 A4 的帮助函数，尚未替换 A0/A1 的通知验证器，不能说最高风险通道已完成或上线。当前风险分级仍为 L0–L3；“L4 通知”按最高风险通知加固理解，没有创建宽松的新等级。

## 仍明确阻止生产启用的条件

1. 当前 `config/patchgate-trust.json` 仍 `enabled=false / keys=[]`，现有三个真实传输执行器均 `signing_enabled=false`。不是缺一个布尔值：必须建立隔离的签名执行器密钥与真实提供商调用路径，并审计签发流程；共享 GitHub 登录不等于 Claude 原生身份。
2. Claude #244 对旧 head 给 REVISE；本次 B1 新 head 尚待 Claude 复审，千问/豆包的真实签名同样未配。`stage_audits=[]`、`external_stage_audits=[]`、`runtime_bundle_sha256=null`。运行器必须从可信 main 固定文件清单复算 bundle（含约束代码、策略、执行器/公钥登记、有效 A2 配置；排除 bundle 摘要、stage_audits 和 external_stage_audits 自身），不能信任 PR 提供的摘要。stage_review 绑定该 bundle，另存 reviewed_source_commit，避免把签名放进它自己承诺的字节而产生自引用。
3. **GitHub 普通 merge API 只有 expected-head，没有原子 expected-base 参数。** 此库复核前后读取 base，但最后一次读到 PUT merge 之间仍有竞争窗口。生产适配器必须先接 merge queue/强制严格基线检查，或另一个经过审计的原子基线机制；本稿不宣称已解决这个窗口，不能据当前 A2 夹具测试开启自动合并。
4. 可信主线调用器、真实 token 作用域、GitHub CI check-run 采集及其 app 身份白名单、真实并发 runner 验收和持久回执回读仍未接通。检查数组只允许可信采集器提供，不能使用 PR JSON 自填结果。
5. 通知白名单当前为空，A2 之外风险级别一律不放行。后续 A3 隔离目标/线上版本、B 测试网三类交易回执未开始；不因合并库存在而提前宣称部署、自动回滚或放款。

## 验证

命令：`node --test scripts/tests/patchgate-a2.test.mjs scripts/tests/patchgate.test.mjs scripts/tests/patchgate-a1.test.mjs`

最初版本本地 A0/A1/A2 为 85/85（A2 23/23）；B1 修订后为 91/91（A2 29/29）。此数量不是生产签名、自动合并或线上部署验收。

其中新 A2 回归涵盖签名注册、独立双审、精确检查摘要、API 白名单、同键并发、预留超时、合并响应丢失、追加提交、base 前移与真实 API 传输选项。这里的成功只代表本地测试，非 GitHub runner 验收。

下一步：固定此稿 head → Claude 经 PR 复审及千问/豆包实际提供商审计 → 修复/复审 → 可信签发器和原子基线补齐 → 仍关闭开关做真实 runner acceptance → 一张普通 docs PR 自动合并并回读 → 才申请进入 A3。需要 Claude 时发送完整 PR/head 与测试工件，不用国内代执行冒充原生 Claude。

## 可运行预检与签发接线

`node scripts/patchgate-a2-preflight.mjs` 只读当前检出，固定文件清单复算 bundle 和各文件哈希，列出准确 blocker；本稿预期 exit 1（blocked_not_activated），不会读取环境密钥。上线以后可信主线 runner 必须使用同一清单而非 PR 自报清单；更改 runtime、配置、策略、身份或检查器都会使旧 stage_review 失效。

签发接线入口为 `signExecutorAttestation({registry, trust, executorId, keyId, privateKey, payload})`：私钥由已认证 Secret 绑定直接传入内存，函数先校验当前登记公钥一致性，签发后私钥仍不写文件。当前没有调用 mergeDocsOnce 的生产 CLI/Workflow；唯一 CLI 是只读预检。最高风险 actor 白名单 helper 尚未进入现行 A0/A1 通知门禁，不能将这条需求标为已完成。

当前未接真实 Secret，且没有可用 GitHub secrets/variables 写接口，所以不生成孤儿密钥、不把假公钥放入登记。现有真实 API key 只能调用模型，不能代替 Ed25519 签名凭据。

独立签发器应分别部署到已核验上游执行器，例如千问 main consumer 的 DashScope 专用 signing key；GPT/Claude/豆包等不同 provider 的 key 各有独立 secret scope、不得共用一个公钥。给纯基础设施检查器登记 github_actions/checks，不能借它伪装 Anthropic author/review。每个 key 的注册需提交实际 signer workflow/job、运行 ID、对应原生响应元数据证据和只含公钥的登记。合法 provider 调用先在受信执行器完成、绑定原始产出哈希，再调用签发函数；模型 prose/PR JSON 不是签发依据。

当前能独立完成的是代码、预检与测试；签名人登记实测、Claude 原生审计、受保护主线的 base 原子门禁和真实 runner 验收分别保持未验证。缺项是明确的实际平台能力，不是再给 owner 加一个无来源“批准”步骤。未来凭据绑定就绪后按原任务续做，不另派重复单。
