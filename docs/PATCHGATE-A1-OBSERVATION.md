# PatchGate A1：只读观察适配器

类型：工程规范。沿原任务 `PLAN-PATCHGATE-ESCROW-20261023`。A0 已在 `f624bd61aedccd8f5724dcd0ad1a2ee47c195ef0` 合并；PR #224 条件与旧千问异议分别保留，原生千问 run `40079402295` 对 N1/N2/真实配置给出 approve，但明确 A2 的签名准入仍不具备。

本文件描述 A1 候选实现，不代表已经进入主线运行。PR #228 对 bf18c9fa 的原生 Claude 结论为 revise，原稿保留；本版修复 H5/H6/M3/M4，仍需 Claude 对新 head 复审和另一实际提供商工程复核，不借用旧结论冒充已通过。

## 范围

- 常态观察要求 `vars.PATCHGATE_A1_ENABLED == 'true'`；变量未配置、空值、false 均关闭。只有 main 上的 `pull_request_target` 或显式 `workflow_dispatch(mode=observe)` 可运行；固定检出该 main 事件的 SHA。
- H5：`pull_request_target` 的 workflow job 层仅放行 OWNER/MEMBER/COLLABORATOR 作者；脚本独立回读 PR 的 author_association 再校验，手动观察亦不能绕过。其他作者不创建预留。目标必须指向本仓 main，head 为完整 Git SHA。Task ID 是有界数据，不决定代码或权限。
- 只 fetch Git 对象和读 diff；不 checkout/import/执行候选代码。策略、公钥和运行器来自可信 main SHA。
- 差异按 trusted main/head 的共同祖先计算，策略仍从 trusted main 读取。main 新增的无关文件不会被错当作候选删除。
- 没有登记签名就如实报告缺失，不将 PR 作者署名、L0 文档、模型自述或旧的 accepted 字段当证明。N1 reference 只可由固定 GitHub 评论采集器读取。
- 所有合并、业务部署、回滚、模型调用、资金能力保持 false/0；扫描和缺证仅出观察结果，不任免席位、不阻塞现有主线操作。

“只读”指项目/PR/资金状态；观察结果会写入**隔离观察分支**，不写 main 或候选分支。GITHUB_TOKEN 为本仓 contents:write。H6 传输层按方法+完整路由+body 白名单校验：只读 PR、评论、对应观察 ref/文件；只创建精确观察 ref；只新建同 key 分支中的 `<key>.json` 或 `<key>.failure.json`。没有更新已有文件所需的 sha 参数，不允许强推、删ref、改main、开issue、合并PR或改配置。通知采集器也经此白名单传输，重定向拒绝。

## 共享预留与未知状态

键为 SHA256(task_id + ':' + head_sha)，通过 GitHub `POST /git/refs` 原子创建 `patchgate-a1-observations/<key>`。422 必须再回读同一个 ref，不能把所有 422 当重复。网络未知不自动重发；已有预留不删除、不强推、不自动解锁。仅持新预留的执行才可在对应隔离分支新建观察记录。

M4：新预留之后的 Git/collect/evaluate/publish 失败均写 `observation_failed` 到同预留分支的 `<key>.failure.json`，只含受控阶段/错误码，排除原始异常、认证信息和任意文本。超大diff在Git子进程输出到达策略字节上限时终止并记 `diff_limit_exceeded`；不会先把整份大diff放进内存再裁剪。若原成功文件写入结果未知，失败文件使用不同路径，不覆盖可能已写成的原记录。若失败记录本身写失败/未知，保留ref，上传本地Actions artifact并要求对账，不伪称已持久化、不重发。

目前只有单元/Git/API夹具通过，未有真实 runner 结论。A2 必须另有经过审计的恢复入口；A1只保留失败证据，不擅自解锁或重复执行。

## 验收与接力

上线前交付完整 head、变更文件 SHA256、测试日志以及原生千问与 Claude 的本期审计；普通 CI 通过不代替独审。

M3 启用顺序不可跳：新 head 双审 → 合并但确认变量为 false/未设 → 显式 `workflow_dispatch(mode=acceptance)` → 三项真实 runner 验收和回读 → 才将变量设为 true → 常态观察期。验收 job 与常态 job 互斥，不读取/修改仓库变量；常态开关关闭时 PR 事件不会创建分支。

手动验收需要两张受信作者、不同head、只有 `docs/patchgate-a1-acceptance/*.md` 普通文件差异的测试 PR，填 `pr_number` 和 `failure_pr_number`，两张均不合并。独立的 main 验收脚本先读Git差异限定docs，再固定已验证head（移动则拒绝）：①首轮创建并回读记录；②同head重复调用，PUT数量、ref提交及文件blob均不变；③第二head预留后人工注入固定collect失败，并回读 failure记录。输出 `work/patchgate-a1/acceptance.json` 与Artifacts。夹具测试这一脚本不算真实runner验收。

上线回执记录 workflow/run/source-main SHA、目标head、策略哈希、观察分支及blob/提交。验证失败只报告，不自动恢复或回滚业务。L4通知actor准入待A2信任根扩展，L5受信fork head可达性不在本轮同仓验收内，均不声明已解决。

当前没有配置持久 Ed25519 私钥；真实传输目录不等于签名已配，A1 不会把自动化机器人的签名当原生模型意见。A2 与 B 都保持关闭。
