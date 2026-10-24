# PatchGate A1：只读观察适配器

类型：工程规范。沿原任务 `PLAN-PATCHGATE-ESCROW-20261023`。A0 已在 `f624bd61aedccd8f5724dcd0ad1a2ee47c195ef0` 合并；PR #224 条件与旧千问异议分别保留，原生千问 run `40079402295` 对 N1/N2/真实配置给出 approve，但明确 A2 的签名准入仍不具备。

本文件描述 A1 候选实现，不代表已经进入主线运行。A1 上线前仍交 Claude 和另一实际提供商独立审计；不借用 A0 审计冒充 A1 已通过。

## 范围

- 只有 main 上的 `pull_request_target` 或显式 `workflow_dispatch` 可执行观察器；固定检出该 main 事件的 SHA。
- 目标 PR 必须指向本仓 main，head 为完整 Git SHA。Task ID 从 PR JSON 头读取并限制字符，不从正文取得脚本、权限或目标仓库。
- 只 fetch Git 对象和读 diff；不 checkout/import/执行候选代码。策略、公钥和运行器来自可信 main SHA。
- 差异按 trusted main/head 的共同祖先计算，策略仍从 trusted main 读取。main 新增的无关文件不会被错当作候选删除。
- 没有登记签名就如实报告缺失，不将 PR 作者署名、L0 文档、模型自述或旧的 accepted 字段当证明。N1 reference 只可由固定 GitHub 评论采集器读取。
- 所有合并、业务部署、回滚、模型调用、资金能力保持 false/0；扫描和缺证仅出观察结果，不任免席位、不阻塞现有主线操作。

“只读”指项目/PR/资金状态；观察结果会写入**隔离观察分支**，不写 main 或候选分支。GITHUB_TOKEN 只有本仓 contents:write；代码对写入路径、分支前缀和记录中的副作用开关再次校验，禁止把观察写入 API 当任意写入适配器。

## 共享预留与未知状态

键为 SHA256(task_id + ':' + head_sha)，通过 GitHub `POST /git/refs` 原子创建 `patchgate-a1-observations/<key>`。422 必须再回读同一个 ref，不能把所有 422 当重复。网络未知不自动重发；已有预留不删除、不强推、不自动解锁。仅持新预留的执行才可在对应隔离分支新建观察记录。

并发/超时测试目前使用确定性 API 夹具。上线验收还须用真实 GitHub runner 验证首轮创建、重复轮次无重复写入、未知预留对账；未完成这三项不能写“分布式运行已验收”。A2 必须另有经过审计的对账入口，不能以永久跳过掩盖失败任务。

## 验收与接力

上线前交付完整 head、变更文件 SHA256、测试日志以及原生千问与 Claude 的本期审计；普通 CI 通过不代替独审。

上线后记录实际 workflow/run/source-main SHA、被观察 PR/head、策略/信任根哈希、观察分支与回读提交。只读分支模型调用 0，资金 0。建议用一张独立 docs 测试 PR 做首轮，再重复触发核对幂等；测试 PR 不并入 main。验证失败只报告，不自动恢复或回滚业务。

当前没有配置持久 Ed25519 私钥；真实传输目录不等于签名已配，A1 不会把自动化机器人的签名当原生模型意见。A2 与 B 都保持关闭。
