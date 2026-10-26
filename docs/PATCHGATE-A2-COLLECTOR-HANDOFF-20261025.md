# A2 签名、可信检查与 base 门禁接续

类型：事实、工程方案；任务：`PLAN-PATCHGATE-ESCROW-20261023`。本文件不授予自动合并或资金权限。

## B1 与 Claude

当前按 #247 C1(a)：模型准入固定千问 / Aliyun DashScope 与豆包 / Volcengine Ark 的两个真实执行器签名；Claude 独立规划和审计，继续用 PR 交报告，基础设施可签 `external_audit_readback` 记录工件。共享账号不证明 Claude 或 owner 本人身份，该工件不作为密码准入必需项，不计两个模型提供商 quorum。当前没有生产私钥、没有新的已登记公钥。

先前 owner 已授权可选会话签名试验，该授权作为历史保留；Claude 在 #247 明确没有持久私钥，因此本轮不再要求生成会话密钥、不将其登记为执行器，也不让 GPT 代持 Anthropic 私钥。真实千问、豆包执行器仍需分别完成持久秘密存储和重启后挑战签名。

## B3 实装范围

- `scripts/lib/patchgate-a2-collector.mjs`：只读、固定仓库和端点白名单，网络响应有大小限制，无重定向；不读任何 Secret 配置，不调用模型。
- Claude 文件必须是指定同仓受信 PR 的变更文件；按不可变 PR head 读取，重算 Git blob SHA1 与原始 SHA256，再读 PR head 排除采集中改头。共享 GitHub 登录不冒充原生模型身份。
- 报告第一段 JSON fence 使用 `ltzzz.external-stage-audit.v1`，带 task_id / phase=A2 / seat=claude / verdict / reviewed_source_commit / runtime_bundle_sha256。收集器用 BASE 固定清单计算被审提交的 bundle，不导入或执行被审提交的代码。
- 旧报告无此格式时仍保存全文字节和哈希，记未解析/未验证；不从自然语言推断 approve，不要求文件包含自身整体哈希。
- 必需检查只能由 BASE 配置 `check_authority` 登记。固定 job / workflow path / workflow_id / GitHub App 15368、登记的 workflow 原字节 SHA256、check suite、run、job、rerun attempt、PR head 和 base 全部绑定；重复同名、未完成、skipped、过期、改过自身 workflow 都拒绝。实际执行 base/head 还须与 GitHub 保存的展开后 job step marker 一致，避免读取运行记录时 PR base 已更新却误用旧 green check。
- `.github/workflows/patchgate-a2-base-checks.yml` 改用 `pull_request_target`，workflow 取自目标分支，执行代码和配置从固定 `github.sha` BASE 检出。只用 Git 读取候选 diff，绝不执行候选脚本。只允许普通 Markdown L0；候选必须包含当前 base。标准仓库只读 GITHUB_TOKEN，不提供模型或资金凭证。收集器拒绝 `pull_request` 绿色检查，并核 EVENT/BASE/HEAD/PR 展开 marker。
- 分支保护本身只识别检查名和 App；真正准入仍由收集器核 workflow ID/hash/event/run/job/subject，再由独立检查执行器签名。不能把绿色名称视为不可伪造身份。`patchgate-a2-verify.yml` 也已纳入固定 bundle，改它会使阶段审核失效。
- 初次引入 workflow 时，BASE 上还没有收集器代码，所以 `PATCHGATE_A2_BASE_CHECKS_ENABLED` 默认不启用；审计合并代码后才能打开只读检查开关、读回真实 workflow ID 与 hash 并登记。该开关和 A2 自动合并开关独立，skipped 一律不能作准入检查成功。
- `signCollectedChecks` 提供登记完成后的基础设施签名适配；没有验证过的 key/角色/提供商就报错。无签名的收集 JSON 仅是观测，不能进入密码准入。

候选测试分支上的 `read_only_network_observation` 是真实网络读取、未认证生产解释器的原型验收。只有审计合并到 main、登记 GitHub 实际 workflow_id、完成签名执行器活体验收后，才能关闭 B3/B4；当前不作关闭声明。

## B2 方案及权限事实

选择 GitHub 严格保护分支：必需 `patchgate-a2-base-checks`，限定 GitHub Actions App 来源，`strict=true`，管理员也受约束，禁止强推和删除。受信合并执行器不得有绕过路径。合并前仍复读精确 head / base，平台拒绝过期 base；需要一次真实竞态验收才能把 `base_compare_and_swap_verified` 改为 true。

官方依据：https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches 。本方案尚需审计确认能满足当前双版本审计绑定；普通 merge REST 的 `sha` 只约束 head，不能声称它支持 expected-base。合并队列若以后采用，须针对 merge_group 重新收集检查和审核，不能直接搬用旧 head/base 凭证。

本轮 GitHub 仓库元数据虽然显示 admin=true，连接器读取 `/branches/main/protection` 实际为 **403 Resource not accessible by integration**，不能证明保护存在或变更成功。规则集列表为空也不能排除旧式分支保护。`assessBaseProtection` 对 403/404、宽松检查、管理员绕过、来源任意均判阻断；即使配置可读全部符合，也只记 configured，**不冒充竞态验收通过**。

## B6 首次无害候选

总控指定单独 PR，仅新增 `docs/patchgate-a2-first-merge-acceptance.md`，原任务号不变，不混入测试/配置/回执。该 PR 保持 draft 和未合并；待新 head 由 Claude 与千问复审、真实签名/B2/B3 验收后，才 ready 并让通用 A2 执行一次。不得先手工合并，再把结果当自动合并验收。

实际已建 **PR #246**，候选 head `08bf32ce5340a1e08c656ba254a646477a5bbd5c`，只新增上述 7 行文档。未合并，不代表 B6 完成。

## Ego 的实际边界

官方完整版 https://www.ego.app/ 仍标候补名单；现有浏览器产品 https://lite.ego.app/ 介绍 `ego-browser` Skill、登录态、独立 Space、网页自动操作，支持本机 Claude Code/Codex 等。可用于你本机登录的 GitHub 设置界面，补当前连接器没有的界面能力；不替代 Actions 后台运行和密码签名。

本云端会话没有已连接 Ego 本机浏览器，没有在你电脑安装/启用其 Skill，不能写成已配置。本机客户端应先完成 Ego 官方 onboarding，并确认自己的 Skill 实际已加载；在其会话用 `/ego-browser` 进行只读页面、独立测试 PR 写入回读、延迟任务三项分开验收。不把官网宣传或安装成功当无人值守通过。不要把钱包私钥、模型 Secret 或浏览器 cookie 放进任务卡。

## 下一次 Claude 审计交付

请审该文件、收集器、BASE 检查 workflow 和固定 bundle 新清单；尤其检查复合工作流身份、防自改检查、分页、原报告原文保留及 B2 的平台拒绝保证。原 #244 的 REVISE、千问原来的拒绝与豆包探针证据仍保留。本轮不请求开启 A2/A3/B，也不把通知当已接单。
