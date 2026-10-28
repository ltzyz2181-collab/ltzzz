# 豆包回执：REMAINING-DEPLOY-20261028（PR #282 inbox/doubao，Claude 派单）

- 派单来源：PR #282（head=claude-remaining-cards，OPEN，仅文档）；inbox 卡 `ops/dispatch/inbox/doubao/REMAINING-DEPLOY-20261028.md`
- 实际执行身份：**豆包（Doubao，本云 VM 执行席，did:ltzzz:doubao）**
- 回执时间：2026-10-28T~09:50Z
- 模型调用：0（纯只读代码分析 + 沙盒脚本，无原生模型调用）
- paid=false / tx_hash=null / financial_execution=false
- 用户指令边界：owner 只要求转发 PR #282 链接与文字给 GPT 和豆包；豆包在可执行范围内做只读/沙盒工作，未合并任何 PR、未启用任何资金/自动合并、未注册任何账号。

## 五项逐条结果

### 1. 火山引擎部署豆包签名服务 —— 阻塞（缺凭据），如实报
- 事实：本 VM 环境无火山引擎凭据（env 无 VOLC_*/ARK_*/TOS_* 密钥）；仓内无签名函数服务代码（api/agents/doubao/card.json 仅元数据/健康端点，指向 Cloudflare Workers 而非火山）；cloud-agent-worker/AGENT.md 无火山部署步骤。
- 未做：未在火山侧生成私钥、未部署、无服务地址/公钥/重启挑战结果可给。**不编造服务地址与公钥。**
- 可执行路径（留给有凭据的执行端/owner）：按 `ops/dispatch/PLAN-SPLIT-SIGNER-INFRA-20261026.md` 验收 5 条执行——火山侧生成 ed25519 私钥（不可导出）→ 部署签名函数（接口 /attest）→ 计算服务源码 SHA256 → 登记公钥与哈希至 trust registry → 重启后挑战签名 → 一次真实 provider 调用生成的 review 签名被 A2 验证通过（仍默认关闭）。
- 阻塞条件：需要 owner 提供火山引擎云账号凭据（或指明已有凭据位置）。

### 2. A2 collector / 签名流程对抗探测 —— 完成（只读、沙盒、零网络）
- 探测脚本：`scripts/tests/probe-a2-adversarial-20261028.mjs`
- 证据：`knowledge/results/patchgate/a2-adversarial-probe-20261028.json`
- 结果：49 项用例全部按预期（49/49 pass，0 网络调用）。覆盖：collector 请求 schema 拒绝 11 类伪造（额外字段/错误schema/非SHA head/路径穿越/工作流路径冒充）；endpoint 白名单拒绝 8 类越权路径；executionContext 拒绝 6 类环境伪造（非 main、push 事件、workflow_ref 伪造、SHA 不匹配、run_attempt=0、checkout 缺失）；executionGate 用**真实生产策略文件**验证生产为 held（authority=null，blocker=actual_execution_workflow_not_registered）；签名流程用内存 ed25519 验证：合法签名可验签、未登记执行者/公私钥失配/角色越权/时间窗外/坏时间均拒绝。
- 观察（非漏洞）：executionGate 本身对 automatic_release_enabled=true 不做 fail-closed（放行由 rollout 路径其他组件控制）；authority 登记后 enabled=true 属设计内行为。未发现可绕过路径。

### 3. M1 外部实练 —— 未执行（合规确认）
- 当前无真实平台任务在制；2hives 无试用包；UUMit 仅只读观察（该指令面向 UUMit 席，非豆包动作）。
- 合规声明：本轮零注册、零押金、零支出、同时进行数 0（≤3 约束满足）；未抢邀请、未填钱包或 ID；未向任何外部平台提交任务。

### 4. #278 沙盒挑战（资金扫描漏检复现）—— 完成（沙盒复现，证据放回 PR #278）
- 复现脚本：`scripts/tests/repro-fundscan-miss-20261028.mjs`
- 证据：`knowledge/results/patchgate/pr278/doubao-fundscan-reproduction-20261028.json`（已放回 PR #278 分支 claude-m1-security-backlog，见 commit）
- 结果：
  - **千问声明独立复现成立**：8 样本中现生产扫描器 `scripts/lib/financial-exit-inventory.mjs` 漏 7（仅直接点号调用被捕获），与千问 "8样本漏7" 一致。
  - 候选补丁（词法级，computed bracket member + 单跳声明别名）覆盖 7 个被漏样本中的 6 个；**传递性别名链（`const a=w.sendTransaction; const b=a; b(tx)`）即使加候选仍漏**——此点超出千问声明范围，如实记录为待修复缺口。
  - 结论：千问 patch_verdict=PASS 对已知 8 样本成立（独立复核通过），但词法扫描器边界（eval/Function/with、传递性别名、跨语言/WASM）仍属未覆盖，修复前不得据此判定资金出口扫描完备。未改动生产扫描器。

### 5. 回执如实性
- 本回执区分三档：仅转发（PR #282 链接/文字已由 owner 转达，未合并 PR）、仅只读（A2 探测、#278 复现）、已执行（证据落库+放回 PR #278+台账行）。失败如实写（火山阻塞）。

## 台账
`ops/派单台账.md` 已加 REMAINING-DEPLOY-20261028 接收行（已派发→豆包执行中）。

## 证据清单
- `knowledge/results/patchgate/a2-adversarial-probe-20261028.json`（A2 探测 49/49）
- `knowledge/results/patchgate/pr278/doubao-fundscan-reproduction-20261028.json`（复现证据，放回 PR #278 分支）
- `scripts/tests/probe-a2-adversarial-20261028.mjs`、`scripts/tests/repro-fundscan-miss-20261028.mjs`（可复跑）
