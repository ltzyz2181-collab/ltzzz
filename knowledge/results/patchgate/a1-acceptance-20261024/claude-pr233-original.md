# Claude 核对：PatchGate A1 真实 runner 验收回执（PR #232）与千问 controls REJECT 裁定

- 任务：`PLAN-PATCHGATE-ESCROW-20261023`，阶段 A1（沿同一原单）。
- 核对席：Claude Sonnet 5.5（Claude Code 云端会话，经仓库 PR 交付；无原生 API、无 Key、无钱包、无签名）。
- 读取的完整提交：#232 head `7bc3832fd0e2a5233cc04ffe36694e5b65c02271`；验收对象为已合并的 #227（实施 head `87f270d0…`，合并 `bcd04bf9…`），runner source main `d0b65dc30949ac286f48afc45509727ae21a292c`。
- 结论：**验收回执属实（在我能独立读回的范围内）；千问 controls REJECT 逐条裁定，无需改代码，仅建议一项纵深加固；同意可以由总控开启常态观察，A2/B 保持关闭。**

## 一、我独立读回的事实（不采信回执本身）
| 项 | 回执声称 | 我的读回（GitHub REST，经只读 API） |
|---|---|---|
| 测试 PR | #230、#231 各只增一个限定目录的 md，同仓未合并 | 属实：`docs/patchgate-a1-acceptance/first-20261024.md`、`failure-20261024.md`；作者 OWNER；state=open，merged=false；head 分别为 `1fc9ee64…`、`e02d35d6…` |
| 观察分支数量 | 2 个新 ref | 属实：`patchgate-a1-observations/*` 恰好 2 个 |
| 成功分支 | 1 个新提交，父提交 = runner source，1 个 JSON，blob `72518f95…` | 属实：提交 `6ac42186…`，父 `d0b65dc3…`，文件仅 `a1/fb8a83ce….json`，blob 一致，提交信息为固定的 “A1 shadow observation only; no code/merge/deploy authority” |
| 失败分支 | 1 个新提交，失败文件，blob `bb499b3c…` | 属实：提交 `60b1aab2…`，父同上，文件仅 `a1/389f2f6b….failure.json`，blob 一致，提交信息固定 |
| 观察记录内容 | 缺证、不授权 | 属实：成功记录 `L0`、`validation_passed:false`、原因 `one_authenticated_author_required,trusted_base_checks_required`；全部开关为 false/0；失败记录 `observation_failed`、阶段 `collect`、错误码 `acceptance_injected_failure`、`reservation_retained:true`、`publication_outcome:not_attempted` |
| 运行文件字节 | 7 个文件与获审 head 一致 | 我已核对其中 `patchgate-observe.mjs`、`patchgate-a1-acceptance.mjs`、`patchgate.mjs`、`patchgate-a1.yml` 的 SHA256 与我 #229 稿记录的一致 |

## 二、我**没有**独立验证的部分（如实标注）
- Actions 运行日志、变量 `PATCHGATE_A1_ENABLED` 的值、POST=3/PUT=2 的计数：我的代理拦截 Actions 路径（HTTP 403）。计数只与“2 个新 ref、每分支 1 个提交”**一致**，不能反推出请求总数；回执也承认计数来自断言而非 ZIP 原字节。
- Artifact ZIP 未读（回执已声明读取被网络策略拒绝，没有绕过）。
- 两个 runner 并发竞争、fork 对象可达性（L5）：均未覆盖，回执亦未声称。

## 三、千问 `qwen-controls` REJECT 的裁定（原文保留，不改写）
我复跑了回执附带的 `controls-counterprobe.mjs`（本地、0 网络）以及我自己的补充检查 `a1-claude-traversal-check.mjs`：
1. **CRITICAL（传输层未约束 task_id）→ 降为 L8（低，纵深加固）。** 事实成立：`validateObservationRequest` 会接受含 `../../` 的 task_id。但我验证了它**不能导致路径/分支被引导**：写入路径和分支名只由 `sha256(task_id:head_sha)` 的 64 位十六进制决定；换路径、换分支（如 `main`）、多余 body 字段均被拒；task_id 只作为记录内的数据字符串。真实入口 `candidateIdentity` 先用 `^[A-Z0-9][A-Z0-9_-]{6,80}$` 限制，不符合则回落为 `PATCHGATE-PR-<n>`。不是候选可控的绕过。建议在 `isolatedRecord` 再加同一条正则，作为 A2 前的低成本加固（不阻塞）。
2. **HIGH（控制字符/非法 PR 号绕过）→ 不采纳。** 探针与我的复跑一致：`null/undefined/NaN/0/-1/'7'` 全被拒；控制字符 task_id 回落为 `PATCHGATE-PR-7`。
3. **MEDIUM（手动 observe 缺作者校验）→ 不采纳。** 手动事件无作者字段，但 `observe` 随后从 GitHub GET 该 PR 并执行 `candidateIdentity` 的受信作者判断；探针显示 NONE 作者在任何写入前被拒（0 POST/PUT）。
4. **“缺失 association 会 fail open” → 不采纳。** `Set.has(undefined)` 为 false，被拒。
5. 另：千问 limitations 声称 “publishObservation 未调用、JSON 是离线草稿”，与同一份回执前半段及 GitHub 上真实存在的两个提交相矛盾，我视为该回执内部的事实错误。原文保留，不作为运行事实。
说明：以上是**我的裁定**；千问回执本身已是原生 qwen-plus 调用，我不改动其结论字段。

## 四、状态与建议
- **A1 验收**：首轮写入、重复无新增写入、预留后失败存证——在我能读回的范围内成立。
- **建议开启常态观察**（把 `PATCHGATE_A1_ENABLED` 设为 `true`）的条件：①总控先在回执里记下我的裁定和 L8；②开启后用首批真实 PR 观察：只应出现 owner/成员/协作者 PR 的观察分支，外部 PR 零分支；任何异常把变量改回 `false` 即停；③观察分支清理流程（只清自己创建的）写入文档。
- **仍关闭、不得借此启用**：A2（自动合并/签名准入）、B（托管放款）、资金。L4（通知评论者白名单）、L5（fork）、并发竞争验收仍是 A2 前的待办。

## 未验证范围
Actions 日志与变量实值；Artifact ZIP；并发；fork；author_provider（沿用声明）；A2/B。
