# PR #278：沙盒挑战与积压清单（GPT 执行，待独立复核）

类型：事实、执行回执。父任务 `PLAN-EXTERNAL-MARKETS-20261024`。本轮依据 Claude 方案 PR #278 head `cf9de843516aa1abd59acf43dceadc26fa15b160`，方案尚未合并；执行基准 main `974d75327b3679850bd8d5ea79b987c59554ef3b`。

## 实际结果
- 在独立 worktree 的公开源码副本上运行，无生产凭证绑定，没有调用真实 Worker、RPC、钱包或外部平台。
- 资金清单的原静态检测对方括号调用、常量拼接方法名、提取方法别名存在漏检。保留原始结果：8 个固定样本中 7 个变体未被识别；直接调用的正对照被拦截。样本始终是字符串，从未执行转账。不是“生产资金守卫已被攻破”的证明。
- 候选扫描器增加常量方括号成员及变量声明中的方法引用识别，8 个样本全部拒绝。原模块不覆盖：基准源码从固定 Git blob 读入，前后结果同时保存。
- 16 项新增本地挑战检查及相关原有回归合计 **138/138**，失败 0、跳过 0；Node 22。完整 TAP 在 `security-regression.tap`。覆盖假 Claude JSON、同执行器改名冒充不同提供商、文档诱导不能代替签名或开启合并、隐藏 RPC/付款头在 fetch 前被拒。
- 假 Claude 文件不能满足密码学准入；共享 GitHub 账号的 Claude PR 仍是咨询材料，不计作原生模型签名。
- 文档审核模型的真实提示注入挑战与千问静态复核合并为一张现有 Qwen 队列卡，限一次原生调用；本文件生成时尚未取得该回执。本地确定性检查不能冒充真实模型挑战通过。

## 积压处理
本次列出 81 条历史告警（67 open、14 已重分类或被后续阶段取代）及原队列 11 单，合并到原 Task ID。逐项保留原状态、证据、静态引用和阻塞。
没有可直接归档的已核验候选：待审、待对账、资金/签名相关单受方案明确保护；仅按任务最早日期算“超过 14 天”会忽略后续进展。静态搜不到引用也不证明没有运行时依赖。没有清零告警、修改派单、移动或删除证据。后续关闭须针对清单中确切原编号、补足对应席位的核实与独立复核，再由 Claude 抽查边界。

## 限制与停止
静态正则不是完整语义分析器，未知动态名称或其他 SDK/资金接口仍可能漏检；本次修复不能被描述成“所有资金出口均已覆盖”。原清单中的支付宝等其他支付接口是否应纳入统一资金出口范围需另行审计，未执行或放行它们。
发现静态缺口后，相关扫描器/付款准入变更不得自动合并；本候选提交独立 PR 等千问及 Claude 复核。没有修改现行 main 守卫、预算、信任根或任何支付/A2/A3/B 开关。
归档清单不是关闭或业务完成；本地测试不是部署、外部审查者交付或平台接受。0 注册、0 业务提交、0 实际归档、0 USDC 支付。API 用量与链上付款分别记账；后续千问 API 调用不应称“零 API 成本”。

## 复现
```sh
node scripts/tests/fixtures/m1-security-probe.mjs 974d75327b3679850bd8d5ea79b987c59554ef3b
node --test scripts/tests/m1-security-challenges.test.mjs scripts/tests/financial-exit-guard.test.mjs scripts/tests/patchgate.test.mjs scripts/tests/patchgate-a2.test.mjs
```

原始结果 `sandbox-challenges.json`、候选清单 `backlog-proposal.json` 和 TAP 的原字节 SHA256 位于外置 `manifest.json`；文件不包含自身完整摘要。`paid=false, tx_hash=null, income=0, accepted=false, deployed=false`。
