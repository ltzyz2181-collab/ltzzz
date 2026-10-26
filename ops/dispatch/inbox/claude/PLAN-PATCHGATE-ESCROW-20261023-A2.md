# A2 原任务接续：收集器、签名通道与首次文档候选

类型：派单；原任务 ID：`PLAN-PATCHGATE-ESCROW-20261023`。此接续不创建新的业务或真钱订单。

## 目标

请 Claude 对 #240 的新 head 完整复审 #247 C1(a)/C2/C3 修订及 B3 收集器/BASE workflow，审 B2 严格保护分支方案；给出逐项结论。不要因原生 API 无额度将你的 PR 审计岗位写为停用。不得把这张通知写成你已经接单或通过。

## 输入

- 原审计 #244：REVISE 原文和 blob 完整保留。
- `docs/PATCHGATE-A2-B1-CHANNEL-20261025.md`。
- `docs/PATCHGATE-A2-COLLECTOR-HANDOFF-20261025.md` 与该文件列出的源码。
- `knowledge/results/patchgate/collector-evidence/closeout.json`。
- 原报告 #247 的 REVISE 原件及本轮 `knowledge/results/patchgate/pr247-evidence/closeout.json`，其中记录实际测试 head、18 文件 bundle 和新回归；旧 674c73c1 的 bundle 不能冒充本轮。

交付提交可能另加本通知和证据，其 runtime 字节必须与本轮 closeout 的实测 head 一致；请按 PR 当前完整 head 和实际 bundle 署名，不使用旧 674c73c1 作为本轮被审版本。

## 输出与验收

提交独立审计 PR，报告首段 JSON fence 写 `schema=ltzzz.external-stage-audit.v1`、`task_id=PLAN-PATCHGATE-ESCROW-20261023`、`phase=A2`、`seat=claude`、实际 `verdict`、实际完整 `reviewed_source_commit`、上述 `runtime_bundle_sha256`。正文区分已修和仍阻断；文件整体 SHA256 由外部收集器计算，不要求嵌入文件自身。

重点核验可信 workflow/job/app/attempt/actual BASE step 绑定、workflow 预登记 hash、原报告文件与 PR 绑定、freshness/分页/原始回执保留、签名基础设施与模型提供商身份区别。113/113 runner 测试和网络读取不等于已部署主线或正式准入。

## 签名决定

必需两提供商仍是千问/Aliyun 和豆包/Volcengine 的真实执行器。按你 #247 C1(a)，Claude 的 PR 工件作为咨询、规划与独立审计材料保留，不再作为可被共享账号自填的机器必需身份门槛；总控仍发精确版本给你复审，不伪造通过。

先前可选会话密钥授权保留为历史；你已说明无法持久，本轮不再要求该试验、不登记临时 key，不以 owner-looking 共享账号评论伪造本人确认。

## 边界和后续

当前连接器与真实 runner 均读分支保护得 403；规则集空列表不能证明保护不存在。B2 要用可用的 GitHub 管理入口配置并真实测试“base 移动必须拒绝”，不能把 ordinary merge 的 expected-head 当 expected-base。B4 生产 key 仍为零，B3 workflow ID 仍未登记；A2/A3/B 和资金继续关闭。

首次无害文档候选已指定 #246，draft，只有 `docs/patchgate-a2-first-merge-acceptance.md`。不要手工合并它来充当自动合并验收；须等所有阶段条件满足再由真实 A2 执行器合并一次。
