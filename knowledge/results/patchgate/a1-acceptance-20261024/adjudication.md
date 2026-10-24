# A1 真实 runner 验收与 BOUNDARY 逐条裁定

原任务 `PLAN-PATCHGATE-ESCROW-20261023`。实施 head `87f270d08195c3bd2be5892ab6800921c5140a03`，合并提交 `bcd04bf9d2eda4c5d5350c1c24ebfb1ab02e69ea`。本文由 OpenAI Codex 总控执行器整理，具体模型 ID 未验证；是证据与不同意见的汇总，不冒充 Claude 的独立核对。

## 真实运行的范围

- GitHub Actions `workflow_dispatch` run **40101318501**，acceptance job **120893879484**，source main **d0b65dc30949ac286f48afc45509727ae21a292c**。七个关键执行/配置文件的原字节与获审 head 一致。
- 两张测试 PR：#230 / head `1fc9ee64632cf4861a7f68891e0088c8b9ce2b58`；#231 / head `e02d35d63b592586eab0d4c7cf8b9786b5156b13`。GitHub API 确认每张只新增一个限定目录中的普通 Markdown 文件，均为同仓、未合并。
- 实际 Node22 回归 69/69 通过。常态 observe job skipped，手动 acceptance job success；日志明确 `PATCHGATE_A1_ENABLED: false`。
- 三项通过：首次创建并读回；同 head 重复执行无新增 PUT、ref/blob 不变；另一 head 在预留之后注入固定 collect 错误并读回失败文件。
- 独立 GitHub API + git 对账：两条观察分支分别只有一个新提交，父提交均为本次 runner source；各新增一个对应 JSON。成功 blob `72518f95438145325d1ebae80944321f108f16ff`；失败 blob `bb499b3c6552830afbade0e45aad64cbfd7c06ea`。
- POST=3（两次新预留、一次重复预留422），PUT=2。请求数来自实际执行的固定代码及通过的断言，另用两条各一提交的分支交叉核对；没有伪称从 ZIP 原字节重读出了计数。

## BOUNDARY 四条均保留原文

原始回执 run40080552107，输出 SHA256 `de2309773afc25669b287890be01101d9055eba9648c95a515200aeb5725bec8`。本期千问两份新复判各自另存，绝不覆盖旧 revise。

| 项目 | 原发现 | 裁定与证据 |
| --- | --- | --- |
| B1/P0 | runnerSha 可伪造 | Claude #229 不采纳。实际入口用平台 GITHUB_SHA 对照检出 HEAD，GitHub create-ref 还要求对象存在。不能把一个内部函数接受40位字符当作公开可控入口。 |
| B2/P1 | base.ref 可能需接受全名 refs/heads/main | Claude #229 不采纳。REST pull.base.ref 是短名；全名被保守拒绝，不是权限绕过。 |
| B3/P1 | 记录字段不完整 | 先前已按当前字段契约补完整校验。千问本期第一份仍坚持 observed_at/observer_version/manifest/evaluation_results，原文保留；收到实际契约和在线 JSON 后，第二份明确承认这些是审查者建议，非既定必需字段，并取消阻塞要求。当前 at_utc、source_main_sha、run/head、policy/trust SHA、changed_files、evaluation.subject 等均可回读；不为迎合模型新增同义字段。 |
| B4/P2 | 静态并发组跨 PR 冲突 | 实现已改每 PR 组。真实问题是跨 PR 的 pending 可能被替换，不能说 cancel-in-progress=false 也会主动取消运行中的任务。千问本期第一份又错误否认 inputs.pr_number；官方文档与真实 workflow_dispatch 均证明其有效，第二份取消阻塞要求。 |

第二份千问输出的顶层 verdict 是 **approve**；B3/B4 内的 decision 原字节均为 `revise`，其明确理由与 remaining_action 均是在修订旧意见、取消旧阻塞，而不是要求修改代码。原字节不改名。

## 模型意见与实际证据分开

第二份千问 limitations 又误写“publishObservation 未调用、JSON是离线草稿”。这与同一份回执前半段及实际 GitHub commit 相矛盾。acceptance job 直接调用 `runAcceptance → observe → publishObservation`，常态 observe **job** 被跳过，不等于 observe **函数**未被调用。成功与失败文件已经分别提交到 `6ac42186a9bdaa68361cfd9841c84778b53f5451`、`60b1aab2d84250267890948ba0caa99c47ca1fb6`，原字节、blob、父提交已独立读回。因此不采用该旁注作为事实，也不删除原意见。

首轮 JSON 的 evaluation.status 为 `validation_blocked`，原因是没有真实签名作者/可信检查证明。这是 A1 的正确行为：记录缺证，不授予合并权限。观察写入通过不等于补丁授权通过。

## 留待核对的边界

- 原 GitHub Artifact ZIP 链接与服务端 digest 已保存；连接器虽返回可复用文件，但执行器读取其云文件 URL 被网络策略拒绝。没有绕过、没有伪称解压 ZIP 或重算其 digest。此处两份 JSON 使用独立 GitHub 文件 API 和 git blob 原字节回读，源 Artifact 仍可在运行页下载。
- 本轮同一个真实 runner 验证三项场景；未做两个 runner 同时竞争，也未验证 fork 对象可达性。
- L4 actor 准入、L5 fork、A2 签名准入及 B 托管放款仍不在已完成范围。
- `PATCHGATE_A1_ENABLED` 保持 false。请 Claude 对本包和原 Artifact 独立回读核对；未收到本次验收核对前，不开启常态观察。

## 补充 H5/H6/M3 原生复审：保留 REJECT，交 Claude 裁定

总控没有把 B3/B4 的 scoped approve 当全量安全通过，又向原生千问提交了完整的作者/模式/传输守卫源码组件。run **40102096611** 返回 **REJECT**，原文保存在 `qwen-controls.receipt.json`，不能隐去或改写。

本包的 `controls-counterprobe.mjs` 只导入已审脚本并使用本地 API 桩，0 网络、0 凭证、0 变更；输出另存。逐条处置如下：

1. **CRITICAL：传输层未再次约束 task_id。** 内部直接构造一个含 `../../` 的 task_id，配上对应 hash 与其余合法字段，确实能通过 `validateObservationRequest`。这是可加固的内部契约缺口，不能说“完全不存在”。但是观察路径把 task_id 放进 SHA256，而非当作文件路径；真实入口在 `candidateIdentity` 中先限定 task_id。千问假定攻击者已控制 CI/伪造 API 调用，没有提供候选数据如何绕过入口、影响传输 body 的路径。因此当前证据不足以认定为已存在的 CRITICAL 越权；建议 Claude 独立定级并决定是否要求单独修订/重新验收。总控不据此自行开启。
2. **HIGH：控制字符和非法 fallback PR 号。** 实际正则为全串 ASCII 白名单，控制字符任务号不被使用；实际 PR 编号先过正安全整数判断。探针验证 null/undefined/NaN/0/-1/字符串数字全部拒绝；控制字符输入回落为合法 `PATCHGATE-PR-7`。千问关于这些值绕过的描述与执行结果不符。
3. **MEDIUM：手动 observe 没有事件内作者字段。** 手动事件本来没有 PR 作者字段，其触发权限由 GitHub 写权限约束；随后 `observe` 仍从 GitHub GET 目标 PR，执行 `candidateIdentity` 的受信作者判断。探针对 NONE 作者验证在任何 mutation 之前拒绝，0 POST/PUT。不能把事件路由的一步当成整个调用链没有作者验证。
4. 千问 limitations 还说缺失 association 会 fail open；实际 Set.has(undefined) 为 false，触发拒绝。这段原文也保留，不作为运行事实。

以上是被审实现者的可复现实物和处置建议，**不是独立审计批准**。当前状态是：三项在线验收已通过、B3/B4 最新 scoped 复判 approve、补充 controls REJECT 待独立裁定、Claude 对在线验收回执的核对未收到。常态观察继续关闭。
