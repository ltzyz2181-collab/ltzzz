# Meta 外部文件席：当前交付与修订

类型：事实与派单边界。岗位来源为 `identity/seat-registry.json` / `config/claude-team.json`；外部 Meta 客户端与 Cloudflare 托管 Llama 分开记录。Meta 自报任职或模型名不等于仓库/链上身份认证。

原任务 `META-HUBTEST-20261022` 的全量稿和回执已经入库，不能再笼统写“Meta 没有任何提交”。但入库不等于验收：实际稿中声明五个输入均未读到，却断言了不在真实脚本中的伪代码、错误命中来源，并把 keccak256 描述字符串填成 artifact.sha256。总控原字节核验与审查位于 `knowledge/results/meta-external/reviews/META-HUBTEST-20261022/`，千问原生意见同目录另存，不改原稿。

当前唯一状态见 `knowledge/results/meta-external/status.json`。本单不会被改为已验收；重派仍沿原 ID，修订输出不覆盖历史稿。修订卡 `ops/dispatch/META-HUBTEST-20261022-REPAIR.md` 已提供内联输入，解决外部客户端打不开 raw 来源的问题；这是总控准备的输入，不是 Meta 的生成成果。

Skill 固定入口是 commit `1e18c7064e339c8f2cc5ca12502a58bf38c229b5`。`reasoningHash` 不是 receipt-template 的必填字段；本文件单填 paid=false、tx_hash=null，并对实物另算 artifact.sha256。缓存/复述链接不证明客户端读过相应字节。

“每半小时扫描并自动认领”只收到自述，未见可回读的调度配置、执行器连续运行与认领证明；不记为已部署。只可认领明确 assigned_to=meta / allowed_assignees 含 meta 的任务，不能凭 META/CLAUDE 文件名前缀自动抢单。支持中文记忆核对可沿现有 `META-HUBTEST-20261021`，正式岗位变更与链上签名资格另记，不自行改变。
