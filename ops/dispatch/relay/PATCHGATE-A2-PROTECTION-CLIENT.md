# 本机执行器接力：PatchGate 分支保护与只读 checker

类型：派单；原任务 `PLAN-PATCHGATE-ESCROW-20261023`。接收者：已登录 GitHub 的 VS Code/Codex/Copilot 本机执行器；实际模型由客户端元数据填写，不默认认作微软、Claude 或 GPT。接力不等于已认领/部署。

## 总控接管决定（本轮已核实）

owner 已回复“没看明白你做好吧”。总控选择现成内置 GitHub MCP 写通道，不需要 owner 在浏览器执行 gh auth login，也不再把三个选项交还给 owner。当前 get_profile 账号 ltzyz2181-collab / 261544579，协作权限查询 admin；上次提交 73728f25d8c9c446e030b3512ff7f62d73b36de2 已读回，authenticated repository write 成立。这只证明共享账号执行器身份，不证明 owner 本人或 Claude 作者身份。

分支保护 GET 仍为403 Resource not accessible by integration，因此“只差已认证写通道”的判断不准确：repo write 已通，Administration 能力、Claude 新 head 复审和写 main 的流水线迁移另需完成。不得以 owner 授权或账号 admin 字段冒充 API Administration scope，也不得选择“只读结项”把本任务关闭。

使用你会话已有且实际可调用的 GitHub MCP；只在它具备真实管理能力、并满足本卡前提后执行第5–6步。不要再次要求 owner 选择写通道、发送Token/Key或自行找菜单。没有管理能力就将该阶段保持外部权限受阻，继续无依赖的原任务修复，保留回执。

当前受审 #240 head 52ad8a9e7b2e21bb998a4ac0f8363327626d2f77 /125项真实runner通过，Claude复审已发出但未收到。原任务迁移候选的静态清单见 knowledge/results/patchgate/protection-client/main-writer-inventory-20261025.json；该清单不是迁移完成证明。A2继续关闭。

## 目标和固定输入

仓库只允许 `ltzyz2181-collab/ltzzz`，目标 `main`。当前云端集成缺 Administration，GET branch protection=403；owner 已授权你完成工程设置，不要把设置步骤再交给 owner 操作。已有改动不得 reset/clean/强推；在独立 worktree 操作。

先读 PR #240 当前 head、#247 与后续 Claude 复审、`docs/PATCHGATE-A2-PR247-REPAIR-20261025.md`、`knowledge/results/patchgate/status.json`。若修订后的精确 bundle 尚未被 Claude 与另一真实提供商复审，先提交准确依赖回执；不要擅自合并 A2 或开启自动合并。

## 授权的具体执行步骤

1. 确认环境、当前工作区/分支/head/未提交条目；用已登录 `gh api user --jq .login` 或官方 GitHub 设置页确认身份/能力。不读取认证文件、Token、cookie、Key；不要求 owner 把凭证贴给你。先 GET `/repos/ltzyz2181-collab/ltzzz/branches/main/protection`，记录状态，不用仓库 admin=true 代替真实 API 能力。
2. 仅在新代码已审核并合并 main 后，核主线 `patchgate-a2-base-checks.yml` 的 target event、只读权限、固定 BASE checkout 与代码字节；确认 collector/runtime 是最新受审版本。不要在 main 尚无 checker 代码时配置硬性 required check，避免把主线锁住。
3. 独立检查开关 `PATCHGATE_A2_BASE_CHECKS_ENABLED` 可在上述条件后设 true，立即读回。A2 自动合并开关及 `enabled` 继续 false，A3/B/资金不动。对一张无害同仓文档 PR 跑真实 target checker，保存 GitHub workflow_id/path、实际 workflow SHA256、run/job/check/App、展开 EVENT/BASE/HEAD/PR marker；只有真实成功后经复核登记 `config/patchgate-a2-collector.json` 的 check_authority，不能手填“看起来正确”的 ID。
4. 配置前检查现有回执流水线是否直接写 main；列出受新保护影响的已部署 writer 并测试其改为 PR/隔离状态分支的接续。不能用给同一个合并执行器绕过保护来解决，也不能破坏日课回执。如果迁移未就绪，保持保护变更未应用，按原任务登记这个具体依赖。
5. 先读并保存原保护 JSON，合并式构造更新：保留已有必需 checks、reviews、签名提交、会话解析、限制等更严格设置；仅追加 required check `{context:"patchgate-a2-base-checks",app_id:15368}`，`required_status_checks.strict=true`、`enforce_admins=true`、`allow_force_pushes=false`、`allow_deletions=false`。不覆盖既有条件为空，不关闭其他规则，不授予 bypass。若当前规则/平台无法无绕过实现，记阻塞，不降级。
6. 使用现成管理权限执行器调用 GitHub 官方 API，或已授权且工具确实连接的本机浏览器设置。若 CLI 403 且没有可用 UI，不反复重试、不搜索凭证；交原始 HTTP 状态及确切缺失能力。保存后的 GET 必须证实 strict、指定 App/check、admins、禁止强推和删除。配置可读通过仅记 configured。
7. 在独立 B2 文档探针验证陈旧 base 真正拒绝：不得借手工合并 #246 测试。规划无害探针，绑定旧 base/head，保留真实平台拒绝状态与运行 ID；若意外合并则记录 B2 验收失败并停止扩围，不能假称拒绝成功。A2 通用执行器第一单仍留给 #246，并须在签名/可信检查等完整条件都满足后执行。

## 输出和验收

回执放 `knowledge/results/patchgate/protection-client/`，只含非敏感信息：原任务号、实际 client/provider、source_commit、原/现保护 JSON 哈希与原文（不含认证头）、HTTP 状态、涉及 writer 及迁移证据、workflow/run/job/App/readback、每个未验证项、是否实际修改。费用/资金字段 `paid=false,tx_hash=null,financial_execution=false`。

独立分支加 PR，不动 owner 原工作区。未修改设置就明确未修改；有截图而无回读不算验证。完成后把回执 PR 链接交回总控和 Claude。保留 #247 的 REVISE 及后续发现，不代 owner 发“本人批准”评论。
