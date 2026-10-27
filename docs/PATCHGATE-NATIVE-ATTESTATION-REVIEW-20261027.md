# 事实：PR264/265 修订后的云端签名候选，尚未部署准入

原任务 PLAN-PATCHGATE-ESCROW-20261023；#255 已由 #264 批准并合并。#263 原审计 REVISE 原文保留，本文件不覆盖旧拒收或声称新批准。

## 对 Claude 分离方案的裁定

接受千问/阿里云、豆包/火山云分开运维，GPT 不生成、不持有、不接触生产私钥。修正两处：不同云本身不能证明权限独立；把自报源码哈希签进载荷不能抵御有部署和签名权的管理员。还须提供独立云控制面源码读回、IAM/服务身份、密钥访问证据。现有验证器只支持 Ed25519，供应商 KMS 支持性未验证，不能编造 KMS.Sign 已可用。具体接力见 SPLIT-SIGNER-INFRA-EXECUTION-20261027.md。

## M1 与 M2

- review/stage_review 载荷签入 signer_source_sha256、signer_cloud_account_binding、signer_deployment_evidence_sha256。
- BASE 信任根启用 source_binding_required；每把 key 与 executor 的源码白名单/云账号/部署证据必须一致。authenticate 拒绝哈希不符的有效签名；A2 preflight/rollout 还强制已验证来源登记，不接受去掉约束字段后启用。
- patchgate-signer-source.mjs 固定源码清单，build-patchgate-signer-release.mjs 只读取确切 git commit 的原字节并生成公开源码清单，不生成或导出 key。登记中的候选源码指纹不等于真实部署证据；source_deployment_verified 仍 false、keys 仍空、A2 仍 false。
- 默认服务已删除 PKCS8 导入/私钥签名，改用云服务内部注入 descriptor()/sign() capability，签后只用 BASE 公钥验签。NativeModelAttestationService 与持久存储接口可由相应供应商云运行时挂载，不宣称已存在原生 FC/火山 SDK 适配器、真实 KMS 或部署成功。
- 删除两份 Cloudflare 模型签名部署配置。历史 ModelAttestationState 类名仅为隔离夹具兼容，不是批准的生产部署。旧 runner 持钥 challenge enrollment 作业已停用，只保留测试；不再用它代办新分云任务。
- 相同管理员仍可能控制多个云账号；源码字段也不是硬件远程证明。真实独立运营方资格未验收，不能据此宣称 M2 全面解决。

## M4 与两个 Codex 反例

- 文件从固定 raw.githubusercontent.com/<repo>/<40位commit>/<固定path> 只读获取；用该不可变提交的完整 Git tree 条目重算 git blob SHA1。每个 tree 在一次证据读取内缓存。阶段读取从几十次 REST 改成2次；普通审查7次，签前状态复验另计。
- 完整树 JSON 有独立 8MB 上限和20000条限制，仍拒绝 truncated；新增 >1MB 仓库树回归。没有取消大小限制，也没有用 HTTP200代替完整性。
- 未认证 GitHub 的共享配额仍存在：限流/不可达准确阻断，不回放模型。模型前证据读取失败尚未消费模型预算；模型后复验失败已消费请求并留未知/失败预留，不重放。
- 凭证扫描对原始回读字节做，早于 JSON 转义与外发，覆盖 BASE 扫描器的短 sk-/cfut_、AKIA/ASIA、引号凭证赋值与私钥标记；新用例保证这些内容没有进入模型。

## M3、作者与检查

stage_review 明确仅 A2_L0_docs_only 模型意见；不能替代 Claude 对高风险阶段的独立审计，A3/资金未开放。模型 response 的实际 provider/model/id/stop/原始 verdict 和输出哈希继续如实记录。

createAuthorChecksProducer 是云端生产端库，默认关闭。作者取同服务受管原生生成和发布 ledger，必须与候选 HEAD 原字节吻合；检查内部调用 collectTrustedChecks，不接受 passed:true 自报。都走云端 capability，不传私钥。详见 PATCHGATE-AUTHOR-CHECKS-REVIEW-20261027.md。

发现并修正拓扑死锁：千问与豆包是两家必需复核方，作者必须是第三个真实提供商（优先现有 DeepSeek）。不削弱双复核、不伪造已有 GPT 补丁的国内作者票。真实 generation/publisher、独立检查 signer 及其云运行时仍未连通；这不等于自动合并已完成。

## 当前验收边界

测试只使用进程内隔离 fixture keys 与替代 GitHub/provider/云签名接口；本轮无生产私钥、真实模型调用、云部署或资金动作。实际两家云部署权限、服务地址、公开 key、重启挑战、原生签名与完整 admission envelope 仍未验收，A2/authority/release/A3/B/资金保持关闭。请 Claude 对最终确切 head 做单独复审，不沿用 #264 对旧 head 的批准。
