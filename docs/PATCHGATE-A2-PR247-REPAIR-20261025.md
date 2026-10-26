# #247 修订决定：C1(a)、C2、C3

类型：事实与工程方案。原任务 `PLAN-PATCHGATE-ESCROW-20261023`，修订对象 #240；原 Claude 审计 #247 的 REVISE 与未验证范围完整保留，不改写为通过。

## C1：不伪造独立 owner

Claude 提供两条修法：咨询项，或真实独立 owner 身份确认。当前 all-AI 共享登录 `ltzyz2181-collab` / 数字 ID `261544579`，没有登记任何仅 owner 可控制的第二身份。用 GPT 的连接器提交同账号 owner-looking 评论，只证明共用凭据发过一条评论，不能证明 owner 本人确认。用户要求由执行器完成、不要逐张交还本人操作；本轮因此选择原审计明确允许的 **C1(a)**，不是代发 C1(b) 确认。

`claude_audit_channel` 固定为 `repository_pr_advisory`、`required_before_rollout=false`、`admission_authority=none_shared_github_login`。`rolloutApproved` 不再把共享账号的审计文件、评论或基础设施回读签名当一个必需身份门槛。Claude 的独立规划、PR 审计派单和异议监督继续，原始拒收照常可读；本阶段仍请求 Claude 本人复审，不因机器无法认证作者就假造其批准。

千问/Aliyun 与豆包/Volcengine 的两个实际执行器阶段签名、候选审核、可信检查、基线防护和 L0 限制均保持。空/单一模型签名、仅附一份伪造 Claude approve、基础设施替代模型票、未配置 key 均仍阻断。`externalAuditProofMatches` 只检查咨询工件完整性，不被 rollout/merge 调用；它返回 true 也不证明 Claude 或 owner 身份。

## C2：从目标分支取得工作流

`patchgate-a2-base-checks.yml` 改为仅 `pull_request_target` / main，job 还核 event 与 `refs/heads/main`。checkout 固定 `github.sha`，不取候选的解释器、imports、config、package、脚本或工具。唯一访问候选的操作是校验完整 SHA 后，用 Git fetch/diff 读取数据；没有 checkout HEAD、npm 生命周期、候选代码执行、模型凭据、资金凭据或仓库写权限。

CLI 也核 `GITHUB_EVENT_NAME=pull_request_target`、`GITHUB_REF=refs/heads/main`、`GITHUB_SHA=实际 checkout`、同仓受信 PR 与其 base 一致。job 保留由平台展开的 `EVENT/BASE/HEAD/PR` marker。收集器只接受 target event；同名、同 App、同 workflow bytes 的 pull_request 假 green 也不能进入准入。原候选不得改自身 workflow 的字节比对仍保留。

GitHub `GITHUB_SHA` 描述执行上下文，不等于 REST run/check 的 candidate head 字段。本仓既有 A1 target run `40245167704` 的 REST event=target、head_sha=原候选 eca85d53，但其滚动 pull_requests.head 已更新为 674c73c1，证明不能只信滚动列表。新门禁同时核 exact run/job/check head、suite、attempt、BASE 与不可变 step marker。新 target workflow 还未部署到 main；不能拿旧 A1 的事件记录代替新 checker 实调验收。

分支保护只看名称/App，收集器才是具体 workflow、event、run、job 与被审 subject 的验证边界。后续还必须受信检查执行器签名；绿色名称本身不是身份。保护规则开启不构成 B2 原子竞态通过。

## C3、C4

`patchgate-a2-verify.yml` 作为候选回归测试也纳入 A2_BUNDLE_FILES；修改它会使 runtime bundle 变化。verify/collector CI 都改为跑 `scripts/tests/patchgate*.test.mjs`，当前全套 **125/125**（真实 runner run40252891751 / job121348407379）。C4 的 Ego 介绍保留在说明文档，不在固定 runtime bundle，也没有任何 Ego 信号参与准入。

## 部署接力及真实阻塞

当前受管连接器读取分支保护仍 403；本机浏览器扩展是否打开不等于当前会话获得了控制工具。没有创建 owner 确认、没有修改分支保护、没有生成私钥或移动资金。GitHub App 的权限清单没有 Administration，不能凭仓库元数据 admin=true 推断此集成能管理保护规则。

可直接交给本机 VS Code 助手的执行单：`ops/dispatch/relay/PATCHGATE-A2-PROTECTION-CLIENT.md`。它有固定仓库、检查名、App id、保留现有规则的要求、审计/main部署依赖与前后回读证据格式。需要现成 admin 权限的执行器；不要求 owner 自行找设置菜单，不读 Token，不为补权另开付费服务。

B2/B3/B4/B5/B6 尚未关闭，A2/A3/B/自动合并/业务部署/资金依然禁用。#246 继续作为首次自动合并候选，不得手工合并充当验收。#226 只做 M0，#239 的 Pi 传输与草稿 revise 记录仍有效，本轮不扩到新采购或部署。

## 千问原结论及总控裁定

原生千问 `qwen-plus` / provider_response / stop，run `40252735553`、1 次调用 1544 tokens，对 43453cf7 的组件摘录给 **reject**；原文保存在 `pr247-evidence/qwen-original-reject.json`，不改为通过。它认为 target 事件的 `github.sha` 是 PR HEAD，建议换 base.sha；这与 GitHub 官方事件表冲突。官方当前明确 target 的 GITHUB_SHA 是 default branch 的最后提交，且 workflow 在 base repository default branch 上下文运行：
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target 。本 workflow 又限定 main，故固定 github.sha 是可信 main 执行上下文，不是候选 head；CLI 同时核该值等于 checkout 和事件 base。

其“没有四元组校验”也与已交代码冲突：CLI 核 target/ref/BASE/HEAD/PR，collector 核精确 EVENT/BASE/HEAD/PR marker；反例测试拒绝 event=PR、PR号错、BASE错、GITHUB_SHA=候选HEAD。总控按 `config/review-delegation.json` 保留权限并逐项说明不采纳，不能记成千问批准；请 Claude 据完整新 head 裁定。不为获取一个 approve 而重复购买同一审阅。
