# A1 开启、首批观察与分支保留

任务：PLAN-PATCHGATE-ESCROW-20261023。依据：owner 本轮指令与 Claude PR #233。只开启 A1 观察；A2、B、签名准入、自动合并、业务部署、模型/资金执行保持关闭。

## 开启与首批真实 PR

1. 本次独立裁定先进入回执并可回读，再把仓库变量 PATCHGATE_A1_ENABLED 从 false 改为 true，保存并回读。
2. 用真实工程交付 PR（L8 防御加固补丁、开启监督回执）观察自动 pull_request_target 行为，不把 docs 验收夹具当首批业务流量。
3. 每轮记录 PR/author_association/head、实际 main SHA、workflow/run/job、唯一 key、ref、文件/blob/commit；验证只写精确观察分支、其余自动能力为 false。
4. 每个新 ref 必须能对应受信作者 OWNER/MEMBER/COLLABORATOR 的真实 PR 与同一 head。非受信作者一旦出现，workflow observe job 必须跳过，新增 ref 数为0。当前开放PR都是OWNER，若期间仍无外部样本，明确记“外部实样未验证”，不能以零流量声称外部拦截已实测。
5. 任意非受信作者生成ref、路径/主体不符、写main/候选分支、意外模型/合并/部署/资金动作或异常失败：立即把 PATCHGATE_A1_ENABLED 改回 false 并回读；保留现有证据，不自动重发、不清锁、不回滚业务。

## L8 低危加固

isolatedRecord 再做字符串类型与原 task_id 正则校验，防内部直接调用提交畸形ID；补传输层拒绝发生在发网络请求之前的回归。独立分支加PR，未复审不合并。此补丁不改变已批准的A1运行器，作为首批真实工程PR观察其被归为控制面高风险、保持不自批。

## 只处理自建观察分支的清理流程

**本期只写流程，不删除任何观察 ref，不增加自动清理定时。** 当前 ref 同时承担幂等预留；简单“30天到期删除”会解除唯一锁，使旧head被重复执行。因此在经过独立审计的持久去重墓碑/归档查询上线前，保留全部预留ref。

后续清理须另走受审任务：先按实际run登记确认执行器自建归属，精确匹配 patchgate-a1-observations/<64hex>、task/head/key、可信source、固定提交信息及完整父链；不能仅凭分支名判断。将原始记录、blob/commit、原拒收与失败证据持久归档并回读；使已审运行器能在ref删除后仍按原key识别墓碑；由另一执行器核验再逐个处理确认属于自己的成功分支。失败、未知、无记录或不明归属预留继续保留并对账。不得清理main、候选、他人分支或当前审核仍需的证据。
