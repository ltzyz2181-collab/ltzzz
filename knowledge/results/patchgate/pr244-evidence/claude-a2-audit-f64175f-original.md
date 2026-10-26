# Claude 独立审计：PatchGate A2 候选 PR #240（部分审计，非最终放行）

- 审计对象 head：`f64175f3557890c0af55741d83c01e8f8233b731`（任务 PLAN-PATCHGATE-ESCROW-20261023）
- 审计者：Claude（原生，独立于作者 GPT；不是 Pi 国内“逻辑 Claude”代理）
- 结论：**REVISE（有条件）——不得启用 A2，不得合并本审计所涉候选为“已验收”**。A2/A3/B 与资金保持关闭。

## 已核验（对原始字节计算 SHA256）
- `config/patchgate-a2.json` sha256 df611173fdc5ed46ccfdf6304cb72e4b3495261d2c0663e10d19546cef2fcf36
- `docs/PATCHGATE-A2-DRAFT-20261025.md` sha256 5dae65b2304505c4a2356b362daa997ef90770c1032c3878870978e60fd8eea7
- `scripts/lib/patchgate-a2.mjs` sha256 5787a3174013082c4c61eb2bb178ef91b27f0e8bf73c29299cae43b1369ae685
- `scripts/patchgate-a2-preflight.mjs` sha256 c89437207bdffd69a29121afae7edbe8a51891163c85c38b3e88555f216a251e
- `scripts/tests/patchgate-a2.test.mjs` sha256 84358c1c13f4758611b2c9b6296fa6d2eefde190e8e1aebc062a9ff5809073cd

- 测试：在该 head 上运行 patchgate-a2 / patchgate / patchgate-a1 三个测试文件，85/85 通过（与 GPT 声明一致）。
- 范围：静态通读 `patchgate-a2.mjs`（全部）、preflight（至 blockers 输出）、测试名清单。

## 逐项结论
1. 默认关闭：`enabled:false`，`rolloutApproved` 缺任何一项即返回 false，`mergeDocsOnce` 零网络调用——通过。
2. 写接口白名单：固定仓库、固定路由、仅 expected-head 合并（merge_method=merge）、仅 create-only 回执分支——通过；无通用文件/ref 更新能力。
3. 幂等占位：以 `sha256(task:head:merge)` 为名的 ref 原子创建，422=已存在则不重复；超时/未知结果保留占位、不重试——设计正确；代价是瞬时失败也不会自动重试（保守，可接受）。
4. PR 准入：要求非草稿、同仓库、OWNER/MEMBER/COLLABORATOR、mergeable clean、base.sha==runnerSha、主线 ref 复读——通过；注意 GitHub 的 `base.sha` 可能滞后，只会造成误拦，不会放行。
5. 签名/独立性：Ed25519、executor↔provider 绑定、轮换不得改 provider、作者与复核 provider 不得相同——通过（代码层）。
6. 回执字段：paid=false、tx_hash=null、financial_execution=false 被强制——通过。

## 阻断项（真实 runner 前必须满足）
- **B1 原生 Claude 签名无法获得**：配置要求 `required_stage_auditors` 含 `anthropic`，需要由 Claude 持有的已登记 Ed25519 私钥签名。我在本环境无任何密钥、不得寻找或接收密钥；GPT 或他人代签并标为 anthropic 即违反 executor↔provider 独立性。可选方案（须 GPT/Qwen 评估后写入配置并再审）：改用“GitHub 评论读回 + 独立账号”作为我的审计证明通道，或把必需审计方改成实际能签名的两家独立 provider（如 aliyun_dashscope + bytedance），Claude 仅作补充意见。**不得用 Pi 代理的逻辑 Claude 冒充。**
- **B2 base 竞态**：GitHub 合并接口只有 expected-head，没有 expected-base。L0 纯 Markdown 风险有限，但在启用前必须选定合并队列/保护分支方案并验证，`base_compare_and_swap_verified` 才可置 true。
- **B3 真实检查收集器未实现**：`checks_sha256` 的来源是调用方传入的 checkRuns，需由主线可信代码收集并由独立执行器签名，否则“检查通过”无来源。
- **B4 无真实签名执行器**：trust.keys 为空，需完成登记并做一次活体验收。
- **B5 通知白名单未接入 A0/A1**：仅作 L3 以上用，A2 不依赖，但升级到 A4 前必须接入。
- **B6 首次真实合并必须由 owner 指定一个无害 L0 文档 PR 做活体验收**，并读回合并 SHA 与回执分支。

## 未验证范围（诚实声明）
- 未做对抗性探针（伪造 head、并发双 runner、回执注入、422 无 ref 场景）；仅依赖 GPT 的 23 项新增测试。
- 未读 `patchgate.mjs` 公共库改动；未审 #239（Pi 云）和 #241。
- 未验证 checkRuns 与 GitHub 真实 API 返回形态的一致性。

## 建议下一步
1. GPT/Qwen 对 B1 做出通道决定并改配置；2. 豆包可执行：在隔离分支上跑对抗性探针脚本并把输出提交为证据（执行类工作适合豆包）；3. 补齐后我对新 head 复审。
