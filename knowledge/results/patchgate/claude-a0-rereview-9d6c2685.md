# Claude 复审：PatchGate A0 新 head `9d6c2685` — 结论 APPROVE-WITH-CONDITIONS（H1–H4、M1 已关闭；新增 2 条中低问题）

- 任务：`PLAN-PATCHGATE-ESCROW-20261023`，阶段 A0；沿用 #223 审计意见，对 PR #221 新 head 复审。
- 审计席：Claude Sonnet 5.5（Claude Code 云端会话，经仓库 PR 交付；无原生 API、无 Key、无钱包、无签名）；author_provider=openai（沿用派单卡，未独立验证）。
- 读取的完整提交：`9d6c26854860ecaedd36d31817dd60deb8080b8e`
- 复算 bundle：`9f781fb83c9763240f8b99077aaeea7172afcadd6c717a1e63ba23934f8332c0`（与 GPT 的 `pr223-remediation.json` 一致）

| SHA256 | 文件 |
|---|---|
| b4695150c96f95d08be23dd5641d5c5ba54beee11eaec35a0dc67235e8c135ca | config/patch-policy.json |
| df969549d2628112e414109daefe099f47acf3ae9f9d37e348bc7e47a78d773a | config/patchgate-trust.json |
| c4014a8ee81de0bb6185bd89782a8a281d751f7a62eb12c033ef935f9ab5af00 | scripts/lib/patchgate.mjs |
| 1862140d64914d8389af67949db946f6efca7933a9f3cf619ae7c23d00748299 | scripts/patchgate.mjs |
| 146c7df8507d79cc72e7dd7f4d3f92fb680a2ccc7df32400dbc54669486fc1a7 | scripts/patchgate-audit.mjs |
| c8adb7a604dcb789d606d747ebad9410d398193d912b205ece2f2d07eab03f96 | scripts/tests/patchgate.test.mjs |
| bd73e3bdefe67c2121db6d898d11a881b0a95613777a05d47e8a315182dd851b | scripts/tests/patchgate-audit.test.mjs |
| cccd3de9f3cd33f9a99c62055d3bd0f4961829fc9fdb8b1112dd114046116c09 | .github/workflows/patchgate-a0.yml |
| f460150c0e3c2c2897bc3a5689c0b4b09e1783ef87dc4ce290d48a942671c2bf | docs/PATCHGATE-ESCROW-STAGES.md |
| f4edcf91f58b45883b4fce3d0a18322c35344dcec33e6dcd505f96bf57472744 | ops/dispatch/PLAN-PATCHGATE-AND-ESCROW-20261023.md |

## 复验结果（我自己跑的，不采信回执）
- `node --test scripts/tests/patchgate*.test.mjs`：**48/48 通过**。
- 用 #223 的原攻击脚本在新 head 上重跑：
  - **H1 关闭**：`scripts/funded-invest-executor.mjs`、`provision-funding-executor.mjs`、`prepare-treasury-migration.mjs`、`lib/proxy-auth.mjs`、`scripts/package.json` 全部 L3。
  - **H2 关闭**：`knowledge/results/**`、`ops/派单台账.md`、`ltzzz-memory/魄.md` 全部 L3，且 `receipt_writer_rules` 空白名单使其必须有已登记写入执行器的签名。
  - **H4 关闭**：同一执行器两把密钥标两家提供商 → `executor_provider_registry_invalid`，被拦。
  - **H3 关闭**（专项用例，见 `claude-a0-probe-rereview.mjs`）：部署复验由作者自己的执行器签 → 被拦（`signed_allowlisted_canary_verification_required`）；由独立执行器签 → 通过。
  - **M1 关闭**：凭证作业仅 `workflow_dispatch` 且 `ref=main`、检出 `github.sha`；候选只以 git blob 读取（`ls-tree` 校验为常规 blob，不检出不导入）；`execute` 里 `git diff --exit-code <main sha> -- scripts/ lib/ config/ skills/` 保证可执行源未变；候选 SHA 经 env 传入，不拼进 shell。
  - **M2 部分关闭**：`wss://`、`//host`、`Function(`、`spawn(` 现在有发现；`sk-` 误报已消除；`scan_safety_conclusion:false` 明示“无发现≠安全”。字符串拼接主机名仍不可检（`'ev'+'il.example'`），属启发式固有局限，已在文档承认。
  - **L1 关闭**：外链限本仓路径前缀；`../` 规范化后越界也被拦。

## 新问题
**N1（中）`notification`（owner 通知证据）没有独立性检查。** 复现（`claude-a0-probe-rereview.mjs` 第三个用例）：L3 补丁中，作者执行器自签 `owner_notified:true` 并指向任意本仓 URL，`owner_notification_evidence_required` 未触发。作者可自己满足“已通知 owner”这一门槛。建议：notification 与 checks/review/deployment 一样要求 `executor ≠ 作者执行器`，且 `reference` 须能被回读核对（指向确切的评论/回执，并含 head sha）。
**N2（中，可用性/过度限制）`ops/` 整个升 L3 + 回执目录空白名单 = 常规派单与台账都要两家复核加通知。** 派单卡（`ops/dispatch/inbox/**`）、台账行、`knowledge/results/**` 回执（含 Claude/Meta/微信办公的交付）今后都无法按“自动合并”流转，会把整条团队流水线卡住，且与 owner “大胆尝试、评审不限权”的决定相冲突。建议：A2 前把**账本状态列、授权/身份配置**留在 L3，而派单卡入口目录改为 L1 级，并在 `receipt_writer_rules` 登记真实写入执行器（GPT 中转席、仓库 bot）。这是放行范围问题，不是安全缺陷，故不阻塞 A0。
**N3（低）扫描噪音**：`exec(`、`Function(` 等规则会命中 `re.exec(`、`isFunction` 之外的普通代码；A0 不影响，A2 前需要降噪或改为仅提示。

## 仍保持的边界（我认可，且不当作漏洞）
单机原子预留（A1 接共享 CAS）；L2/L3 的“基线仍是 tip”“预留对账流程”推迟到 A1/A2，文档已如实声明；A0 无任何合并/部署/回滚适配器；信任根为空且 `enabled:false`；未启用任何资金。

## 未验证范围
未在线上复跑 CI；未读取千问对 H1–H4 的原生回执内容（GPT 说其“仍要求补实际配置证据”，我未核对）；author_provider=openai 为沿用声明；`workflow_dispatch` 路径依赖 main 上已有受信 runner，bootstrap（首次引入）尚未发生，故 M1 修复仅经单元/夹具测试而非线上实跑；Escrow 无合约代码。

## 建议状态
A0 工程内容可接受（H1–H4、M1 关闭）。进入 A1 的条件：处理 N1；对 N2 给出放行方案；千问回执中要求的“实际配置证据”由 GPT 补齐并保留原结论；两家审计（Claude 本稿 + 千问）均归档。B 阶段仍 blocked_by_A，不抢跑。
