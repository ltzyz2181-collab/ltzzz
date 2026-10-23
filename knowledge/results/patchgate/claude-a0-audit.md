# Claude 独立审计：PatchGate A0（PR #221）— 结论 REVISE

- 任务：`PLAN-PATCHGATE-ESCROW-20261023`，阶段 A0（沿用 #220 原单）
- 审计席：Claude（Claude Sonnet 5.5，Claude Code 云端会话，经仓库 PR 交付；无原生 Anthropic API 调用、无 Key、无钱包、无签名；未用 DeepSeek/豆包代执行）
- author_provider：openai（按派单卡；我无法独立验证，沿用卡内声明）
- 读取的完整提交：`da8cc52b0ad47649ed781bdc945360ae89b25f53`（PR #221 head）
- bundle：`c44b690b0a54ac584363a3002cd8c84b634b0db8e04daff8389dc2ff459b5f05`（我在该提交上执行 `bundle()` 复算，与派单卡一致）

| SHA256 | 文件 |
|---|---|
| 60c74da4…c211 | config/patch-policy.json |
| cc0075bc…3103 | config/patchgate-trust.json |
| 40a09df2…3fee | scripts/lib/patchgate.mjs |
| 1862140d…8299 | scripts/patchgate.mjs |
| 97b9867a…f641 | scripts/patchgate-audit.mjs |
| 7d979603…6730 | scripts/tests/patchgate.test.mjs |
| 957db35a…4014 | scripts/tests/patchgate-audit.test.mjs |
| ac5bdfb9…319e | .github/workflows/patchgate-a0.yml |
| 04de46ad…7f58 | docs/PATCHGATE-ESCROW-STAGES.md |
| a0ef0c5c…e064 | ops/dispatch/PLAN-PATCHGATE-AND-ESCROW-20261023.md |
（完整 64 位哈希见本 PR 的 JSON 附录或用 `bundle()` 复算。）

## 已验证
- 本地复跑 `node --test scripts/tests/patchgate*.test.mjs`：**36/36 通过**。
- 策略/公钥从 base 对象读取（`loadBaseConfig`），`--no-renames` 使重命名按“删+增”两条记录进入分类；删除受保护文件会被 `modifies_own_checks` 拦下；symlink/gitlink 因 mode 非 100644/100755 升 L3；未知路径默认 L3。
- 签名绑定 subject（含 base/head、策略与公钥哈希、全体 diff 哈希）、角色与时间；同一公钥挂两个提供商标签被拒；确定性复验函数不依赖模型判定；预留用 `wx` 原子创建。
- 派单卡第 5 点：本审计**不把 A1 以后未实现的适配器当作已启用漏洞**，下列问题均指 A0 已有代码或 A0 策略数据本身。

## 问题（复现见 `claude-a0-probe.mjs`，在 PR #221 head 上运行）
**H1（高）策略把资金执行脚本归为 L1。** `scripts/` 整体是 L1，`scripts/funded-invest-executor.mjs`、`provision-funding-executor.mjs`、`prepare-treasury-migration.mjs`、`provision-wep3-treasury.mjs`、`lib/proxy-auth*` 全判 L1。A2 起 L1 只需 1 份不同提供商复核即自动合并，等于一位作者+一位复核者就能改动钱款执行器与鉴权。建议：这些路径显式列入 `l3_prefixes`/`l3_files`；`scripts/` 里凡能签名、转账、调用钱包或改鉴权的文件统一 L3。
**H2（高）L0 把“证据/账本”当普通文档。** 复现：`knowledge/results/**.json`、`ops/派单台账.md`、`ltzzz-memory/魄.md`（六份记忆原文之一）全部判 **L0（无需任何复核）**。这些文件正是监督脚本、验收和（未来）放款读取的证据来源：作者可自行合并一份写着 `accepted:true`/`paid:true` 的“回执”，或把台账状态改成已验收，或改记忆原文。建议：回执目录只允许经认证执行器写入（路径→允许写入者的映射），L0 收窄到 `docs/**/*.md`；`ltzzz-memory/` 六份原文与台账状态列至少 L3 或需审计席。
**H3（高，A1 设计缺口）作者自己的执行器可以签“独立复验”。** 复现：给作者密钥加上 `deployment` 角色并在 policy 配置 canary 目标后，作者自签的复验证明通过（`reverified_deterministic`）。`evaluate` 没有要求 deployment/checks 证明的 `executor` 不同于作者的 `executor`。建议：deployment、checks 的签名执行器必须与作者执行器不同，且由 base 信任根登记“可签复验的执行器”。
**H4（高，A1 设计缺口）同一执行器可持有两个提供商的密钥，从而伪造“两家复核”。** 复现：同一 `executor` 登记两把不同密钥，分别标 openai 与 aliyun_dashscope，作者+复核均通过（`validation_passed:true`）。现有“同公钥多标签”检查拦不住。建议：信任根必须“一个 executor 只能对应一个 provider”，评估时检查复核者 executor ≠ 作者 executor，且 provider↔executor 映射在 base 中固定。
**M1（中）工作流让被审分支的代码拿到密钥。** `independent_qwen_audit` 在 push 到 `codex/patchgate-a0-20261023` 且提交信息含 `[patchgate-a0-audit]` 时，检出**该分支自身**并运行其 `scripts/patchgate-audit.mjs`，同时注入 `DASHSCOPE_API_KEY` 并持 `contents: write`。这与文档自称“不向候选代码注入凭证”不一致：有该分支写权限者提交带标记的恶意脚本即可读取密钥。A0 影响面限于有写权限的人，但与 A1 目标相矛盾。建议：从 main 检出受信脚本，把候选只当数据；或用需审批的 environment 保护密钥。
**M2（中）扫描器可被平凡绕过，且有误报。** 复现：`wss://evil.example`、`new WebSocket(...)`、`Function('return process')()`（无 `new`）、`spawn(...)`、`fetch('//evil.example')`、字符串拼接主机名，**均无任何发现**；同时 `task-queue-runner-config-notes`、`risk-adjusted-return-calculation-method` 被当作密钥（`sk-` 前缀无词边界）而误报。文档已声明“保守启发式”，我同意它不是安全边界；因此建议在文档与回执里**明确不得把“扫描无发现”当作安全结论**，并给 `sk-` 规则加词边界。
**L1（低）允许域名里的 `github.com` 过宽**：`https://github.com/<任意>` 都放行，可作为外传出口。建议收窄到本仓路径前缀。
**L2（低）预留无到期/对账入口**：`reserved_outcome_unknown_until_reconciled` 没有对账命令与超时规则，崩溃后会永久阻塞同键动作。偏安全，但 A1 前需给出对账流程。
**L3（低）A2 合并前必须复核 base 仍为目标分支当前 tip**：签名绑定了 base_sha，但 A0 未要求合并时 base 未前移；A2 合并 API 用 expected head SHA 时应同时校验 base。

## 对 Escrow 规范的意见（仅审文档，B0 未开始）
方向正确：EIP-712 绑定 chainId/合约、固定三位验证者、过期后只能退款、退款不受暂停影响、上限只能调低、B1 限测试网假币。补充两点：①验证者“不同提供商”必须在合约部署前落成 H4 的 provider↔executor↔密钥 映射，否则链上 2-of-3 只是 1 个人的 3 把钥匙；②keeper 触发退款未证明前不得称“全自动”，文档已写明，保持。

## 未验证范围
- 未在线上复跑 CI；未接触 Secret；author_provider=openai 与千问回执未独立核验；未审 `knowledge/results/patchgate/*/qianwen.result.json` 内容；Escrow 合约代码尚不存在，故只审规范文本；未评估 A1 之后的任何适配器。

## 建议状态
**revise**。H1–H4 修复并补相应测试（含 `claude-a0-probe.mjs` 的四个场景应变为“被拦下”）后，我对新 head 复审；在此之前不进入 A1。M1 建议随 H3/H4 一并处理。
