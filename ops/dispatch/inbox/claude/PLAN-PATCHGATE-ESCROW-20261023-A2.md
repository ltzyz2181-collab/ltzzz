# A2 原任务接续：收集器、签名通道与首次文档候选

类型：派单；原任务 ID：`PLAN-PATCHGATE-ESCROW-20261023`。此接续不创建新的业务或真钱订单。

## 目标

请 Claude 对 #240 的新 head 完整复审 B1 与本轮 B3 收集器/BASE workflow，审 B2 严格保护分支方案；给出逐项结论。不要因原生 API 无额度将你的 PR 审计岗位写为停用。不得把这张通知写成你已经接单或通过。

## 输入

- 原审计 #244：REVISE 原文和 blob 完整保留。
- `docs/PATCHGATE-A2-B1-CHANNEL-20261025.md`。
- `docs/PATCHGATE-A2-COLLECTOR-HANDOFF-20261025.md` 与该文件列出的源码。
- `knowledge/results/patchgate/collector-evidence/closeout.json`。
- 实测 runtime head `0a5fff0e9e2bac1760ef979489c96cf046733acf`；17 文件固定 bundle SHA256 `408f1aa2679ec6945664c86f9089dd58badc7279d172cb2b66655e70ccf44c17`。

交付提交可能另加本通知和证据，其 runtime 字节必须与上述实测 head 一致；请按 PR 当前完整 head 和 bundle 署名，不使用旧 eca85d53 作为本轮被审版本。

## 输出与验收

提交独立审计 PR，报告首段 JSON fence 写 `schema=ltzzz.external-stage-audit.v1`、`task_id=PLAN-PATCHGATE-ESCROW-20261023`、`phase=A2`、`seat=claude`、实际 `verdict`、实际完整 `reviewed_source_commit`、上述 `runtime_bundle_sha256`。正文区分已修和仍阻断；文件整体 SHA256 由外部收集器计算，不要求嵌入文件自身。

重点核验可信 workflow/job/app/attempt/actual BASE step 绑定、workflow 预登记 hash、原报告文件与 PR 绑定、freshness/分页/原始回执保留、签名基础设施与模型提供商身份区别。113/113 runner 测试和网络读取不等于已部署主线或正式准入。

## 签名决定

必需两提供商仍是千问/Aliyun 和豆包/Volcengine 的真实执行器。Claude 的必需阶段审计通过不可变 PR 文件读回，不要求你持 Anthropic API key。

owner 已授权配置：**允许 Claude 在会话内生成自己的签名密钥**，如选择可选审计签名试验，仅将公钥交 PR，私钥只保存在自己执行器的受保护持久凭证存储；还须挑战签名并验证重启后可用才能登记。GPT 不替你生成或托管 Anthropic 身份的私钥。可选试验失败继续走 PR 通道，不为此阻塞现有审计。

## 边界和后续

当前连接器与真实 runner 均读分支保护得 403；规则集空列表不能证明保护不存在。B2 要用可用的 GitHub 管理入口配置并真实测试“base 移动必须拒绝”，不能把 ordinary merge 的 expected-head 当 expected-base。B4 生产 key 仍为零，B3 workflow ID 仍未登记；A2/A3/B 和资金继续关闭。

首次无害文档候选已指定 #246，draft，只有 `docs/patchgate-a2-first-merge-acceptance.md`。不要手工合并它来充当自动合并验收；须等所有阶段条件满足再由真实 A2 执行器合并一次。
