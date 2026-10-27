# 方案：云端原生作者发布器与独立 checks 签名服务

原任务 `PLAN-PATCHGATE-ESCROW-20261023`；承接 Claude PR #266 的两项未解决设计。本文件是待审工程设计，不是实际部署、公钥登记或准入证明。配套配置 `config/patchgate-cloud-publisher.json` 默认关闭，无凭证、实际 App/云账号、服务地址或公钥。A2/A3/B、自动放款及资金开关不变。

## 基线与必须保留的拓扑

读取基线 main `9f12c598d110612bc30e66a519425edd74ed1d1a`：`knowledge/results/patchgate/claude-263-rereview-20261027.md` 认可 #263 head `c16da83734199755407c3b1fb4787db0aa347a10` **仅默认关闭代码合并**；仍要求另审云 publisher、检查签名托管和真实权限。

当前 `createAuthorChecksProducer` 只是 source-code-only 库，`native_author_service_connected=false`、`checks_cloud_signer_connected=false`，信任根没有真实公钥。这里补的是部署与权限设计，**没有把库接到线上服务**。

千问 `aliyun_dashscope` 和豆包 `volcengine_ark` 仍是两家必需的原生复核方，不减少票数、不让同提供商给自己加独立票。作者必须是另外的已登记真实提供商，优先现有 DeepSeek；其精确 model 取原生响应而非模型自称。GPT 已有补丁没有同服务生成/发布记录，不能补写成 DeepSeek 或国内模型原创。

## A. 同服务原生作者发布候选

### 权限的真实边界

使用只安装到 `ltzyz2181-collab/ltzzz` 的**专用 publisher GitHub App**。拟需 repository `contents: write`、`pull_requests: write` 和 metadata 只读；不申请 Actions、Checks、Secrets、Administration、Workflows 或组织管理权限。实际 App ID、installation ID、安装仓库范围、云托管身份未配置，均须日后回读验证。

**GitHub 标准 App installation token 不能原生限定为“只允许写 `patchgate-candidates/*` 分支”。** App 的 contents/pull_requests 写权限在仓库级别更宽；不能在文档或配置写一个前缀就宣称平台已隔离。短寿命 token 也不会自动变成 ref 范围 token。

因此同时需要两层控制：

1. 独立云凭据 broker 独占 App 私钥和 installation token，只暴露固定候选发布 RPC，不提供 token、任意 GitHub 代理、任意 ref/路径/HTTP 参数接口。作者业务服务也拿不到原始凭据；通过同一受管发布账本调用 broker 的能力接口。**GPT 与 GitHub runner 不得导出、请求或接收 App 私钥/JWT/installation token。** 云中创建 token 时仅请求本仓和最小权限，token 寿命不超过 GitHub 允许上限，到期在云端重新取得，不回传。
2. GitHub main 必须有实际可读回、不可由 publisher 绕过的分支保护/ruleset；publisher App 不列 bypass，不得改规则、直接推 main 或合并 main。总控提供的最近分支元数据显示 `main.protected=false`，这是**启用阻塞项**，本设计子任务未另联网核验，不能称保护已开启。具体 GitHub 产品/套餐下能否做到所需 actor、更新/合并限制，要以实际规则和拒写验收为准，不能凭标准 App 的权限名字承诺。

**现有 PR 作者门禁还需适配专用 App。** 当前模型证据读取器把 PR 用户固定为共享 owner，`collectTrustedChecks`、merger 与 BASE workflow bootstrap 还要求 OWNER/MEMBER/COLLABORATOR。App 创建的 bot PR 不保证具有这些 association，不能声称安装 App 即可走通。上线前须独立登记真实 App、bot login/数字 ID、installation/repository 身份及发布账本映射，在受审主线更新相关 allowlist 和反例测试；不能只根据 `[bot]` 后缀信任，也不能放宽为任意 App/任意 bot。没有这项验证时，App 候选保持受阻。

broker 是受信边界：一旦它的宿主/部署身份被攻陷，原始 App token 仍有较宽仓库权限，所以还必须隔离云 IAM、发布身份、密钥管理员、可变更 broker 的权限，并以独立控制面证据约束受审 release。不能把“broker 代码有白名单”说成“泄露 token 也只能写候选分支”。

### 公开 RPC 与内部 allowlist

唯一写 RPC 为 `POST /publish-candidate`，调用方只给原任务号和云内 `generation_id`，以及固定 schema；不接受源代码、文件内容、GitHub URL/ref、token、model/provider、任意操作或政策覆盖。认证采用已审计的工作负载身份/OIDC，校验固定 repo 数字 ID、main、workflow_ref、source commit、run/attempt 和新鲜度。RPC 的云部署与允许 workflow 需要单独登记，当前未配置。

服务从自己不可变 ledger 读取原生生成，不接受调用方上传一份自称原生的 response。同一逻辑服务可分为生成/账本单元和凭据 broker 单元，但二者的服务身份、受管账本和读权限必须受同一受审协议约束；仅靠 `origin` 字符串不够。

broker 内部 GitHub 写调用限定为：

- 固定仓库内创建本次完整文档的 Git blobs、tree、以本次 BASE 为唯一父提交的 commit；文件只许普通 `docs/*.md` 或 `README.md` 的已审 L0 子集。拒绝 `.github/`、配置、回执/台账/记忆原文、可执行文件、二进制、符号链接、删除、路径穿越、修改约束自己的文件及凭证模式。
- 创建服务自己计算的候选 ref：`refs/heads/patchgate-candidates/<K>`，其中 `K = SHA256(task_id + ':' + generation_id + ':' + source_main_sha + ':' + artifact_sha256)`。调用方不能挑 ref。只允许 create，不允许覆盖、更新、删除已有 ref，不用强推。
- 创建固定 `base=main`、该 exact head 的一个 PR；回读实际 PR 的仓库、作者 App/安装身份、BASE/HEAD、变更文件/模式。禁止 merge、ready/合并授权、审批、触发或重跑 Actions、发任意评论、改其他 PR、改 secrets/IAM/分支保护。

用 GitHub API 的效果必须逐项记录，不能把“PR 创建成功”当成检查通过、审核通过或上线。PR 事件可触发仓库原有只读检查，但 broker 本身不能 dispatch/re-run 工作流。

### 服务拥有的生成／发布账本

1. 原生作者请求前先持久化原 task_id、已审 source_main_sha、预算/幂等预留；输出模型从 provider 实际响应取 `model/response_id/finish_reason`，只接受完整 `files[{path,content}]` schema，记录原始输出 SHA256、provider/executor、UTC、生成来源。
2. 生成先完成，publisher 再冻结输入；读取当前 main 必须仍为记录的 BASE。若 BASE 已动，不偷偷换 BASE 后给旧输出补作者票，应按既有重新派单/复核路径处理。
3. 原子保存 publication 预留与确定性候选 ref 后才请求 GitHub 写入；写前写后均核对 exact bytes、tree、parent/HEAD。服务器记录 `generation_id/source_main_sha/artifact_sha256/candidate_ref/commit/PR/at_utc`，不让调用方重写。
4. 原生输出逐字节对应候选 HEAD，发布回执的 `artifact_sha256` 与 `createAuthorChecksProducer` 相同的逐文件摘要一致；作者签名必须回读这个服务自己产生的账本以及不可变 HEAD。
5. 相同 generation 重试先对账：已有成功直接回读原 PR；HTTP 超时、结果未知或 ref 已存在但身份不符则持久记 `publication_outcome_unknown_reconcile_only`，不创建第二分支/PR、不自动覆写或重新生成。

安装令牌的授权寿命与生成/发布账本的长期保存是两回事：token 只短期存在云内，公开账本/回执必须在独立持久存储可回读。不得把日志中打印的自报 SOURCE_COMMIT 当成独立源码证明。

## B. 独立确定性 checks 签名服务

### provider 标签与密钥宿主分开

checks executor 的 `provider=github_actions` 表示**证据来自 GitHub Actions 的确定性运行**，不表示私钥放在 GitHub Actions，也不证明宿主是 GitHub。分别登记：

- `evidence_provider: github_actions`、`executor_id: a2-cloud-checks-executor`、role 仅 `checks`；
- `key_hosting_cloud/account/region/service/principal`、独立签名 key/version/public key；
- 受审 `signer_source_sha256`、控制面部署证据哈希、主线源码来源、角色与算法。

建议 checks 云服务的部署 principal、签名 capability 与 author/publisher 分开；至少不让作者服务、GPT CI、publisher App 或通用 runner 调用其原始 `Sign`、更换 key、改 IAM/改代码。只有经过本服务固定证据校验后才可请求签名。宿主选阿里、火山或其他已授权云必须另登记；本设计不虚构已选云或已获权限。

### 读取与签名流程

- checks 服务只拿 GitHub 只读能力（可为单独只读 App），限本仓必要的 contents/pull_requests/actions/checks/metadata 读取；原始只读 token 也由云保管。它没有 GitHub 写、发布、合并、rerun、Secrets 或 IAM 能力。
- 使用**受审主线版本**的 `collectTrustedChecks`，服务自己读官方 GitHub：指定 `candidate_pr/head`、实际 BASE、固定 check authority。忽略调用方的 `passed:true`、结果 JSON、签名声明或网页 200；不能执行候选脚本/候选 workflow。
- 校验真实 check App、workflow path/ID/原始字节哈希、job、run_id、run_attempt、`pull_request_target` 事件、PR BASE/HEAD marker、完成 success、新鲜度；不采信仅名称相同的候选 check。当前配置记录的 workflow_id `396518006`、app_id `15368` 仅是读取到的登记，真实首次通过仍另验收，不据此说已签 checks。
- 计算 `checks_sha256=SHA256(canonical(check_runs))`，签名绑定原 task_id、完整 subject、BASE/HEAD、checker_base_sha、时间、run/attempt 集合、source hash 与独立部署证据。内部调用 `createAuthorChecksProducer.checks`；服务不接收外界自报通过的 collection。
- 合并执行器仍重新收集并逐字节/摘要核对，不因有一份历史 checks 签名就放弃检查。HEAD/BASE/工作流变化、检查失败/未完成、证据过期、来源未登记、未知响应均拒签，并保留不重放记录。

## 签名算法和源码证明约束

现行信任验证只接受 Ed25519。阿里/火山某个 KMS 产品可用不代表该区域/产品支持 Ed25519；**本轮没有验证该支持，不提供虚构 `KMS.Sign` 可运行命令。** 可选路径仍是：已证实支持的非导出 Ed25519 云能力，或云端隔离服务内生成/保管 Ed25519 并准确披露管理员/可导出性残余；若改 RSA/ECDSA，则另审算法/编码/摘要与信任根迁移，不静默兼容。

服务自报源码哈希只是签名绑定字段，不是远程运行证明。登记 `source_deployment_verified=true` 前，要有独立只读控制面回读实际版本/包摘要、受审 release manifest、IAM/服务身份/密钥绑定和重启挑战。没有证据就保持 null/false；GPT 不生成、导入、导出或保管真实签名私钥。

## 上线前验收与负向测试

以下均是**待做**的验收清单，本文件没有运行它们或生成成功证据：

| 范围 | 必须成功的正向证据 | 必须拒绝的负向场景 |
|---|---|---|
| GitHub/App 权限 | 安装仅 ltzzz、实际 permissions、云 token 不外泄、main 规则可回读 | broker 请求 main/merge/actions/secrets/IAM/token export；任意仓库/ref/URL；规则 bypass；无保护 main |
| App 候选身份准入 | 真实 bot/App/installation 与固定仓库、原生发布账本一致，BASE bootstrap/collector/merger 各自允许 | 任意 bot、同名 login、未登记 App/安装、只靠 author_association 或 `[bot]` 后缀 |
| 原生作者 publisher | 一次第三原生 provider 响应 → 同服务 ledger → 唯一候选 HEAD/PR，字节/哈希一致 | 旧 GPT 文本倒签、手工 response、千问/豆包给自己当第三作者、替换 model 标签、改生成/发布时序、BASE 移动、路径/凭证注入 |
| 发布幂等/故障 | 同 generation 重复只回原 branch/PR；未知结果先对账 | 超时重发、已存在 ref 被覆写/强推、第二 PR、账本与实际 HEAD 不符 |
| 独立 checks | 官方 run/job/App/workflow/attempt/BASE/HEAD 原件及签名可回读、既有 verifier 通过 | 伪造同名绿灯、PR 改 workflow、自报 passed、旧运行/旧 attempt、BASE/HEAD 混用、作者调用原始签名 capability |
| 云 key 与 release | 公钥/算法/source/云账号/部署证明登记；重启不换 key 的 fresh 挑战 | wrong provider/key/role/source、恶意重部署仍自报旧哈希、未核实的 KMS 算法、GPT runner 持钥 |
| 原有 A2 门禁 | 千问+豆包两份独立 review、第三作者、checks、阶段审核、首次普通文档自动合并证据 | 缺任一票、同 provider 顶替独立票、直接启用 A3/资金/任意补丁自动合并 |

公开回执至少保留：原 task/subtask、真实执行身份来源、source main/head、release/source/deployment 证据摘要、App 安装/权限的公开标识、generation/branch/PR/commit、原生 provider/model/response ID、artifact/output/checks 摘要、run_id/run_attempt、UTC、原始 verdict、key ID/public key、独立复核及实际状态。原始 App/云凭据、认证头、私钥和完整 token 永不入回执。公钥不存在时填 null，不拿测试 key 代替。

## 当前状态与接力

当前只有库和默认关闭的设计配置。第三作者原生生成/publisher、云 credential broker、独立 checks signer、实际云身份/App 安装、公钥/权限/发布证据、保护分支验证及线上演练均**未验证/未接通**。main 最近观测 `protected=false` 必须先解除，不能由一份设计声称已解决。

Owner 已授权工程推进，不必重复询问逐次代码/设计权限；真实云身份或平台管理员能力不在本任务现有工具内时，应把准确阻塞与可执行卡交给已有受管执行席，不伪造部署、不要求把私钥发给 GPT。代码修订、默认关闭部署、公开证据登记、实际验收和启用按阶段分别交独立审计。此设计不包含付款政策变更、真实付款、自动合并或生产开关修改。
