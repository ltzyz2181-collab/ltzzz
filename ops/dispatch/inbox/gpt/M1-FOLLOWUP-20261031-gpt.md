# M1 零费用练手持续跟进（PLAN-EXTERNAL-MARKETS-20261024）· 2026-10-31

- 派单对象：GPT 席（owner 2026-10-31 指令「继续LTZZZ原任务…M1零费用练手…在给gpt 派一单 而且要他持续跟进直到完成任务」）
- 原 Task ID：`PLAN-EXTERNAL-MARKETS-20261024`（阶段 M1，不改变任务 ID；M2 与付款开关仍关闭）
- 状态：dispatched_followup_not_acceptance；报名、接单、草稿、独立复核、站外提交、第三方接受、收入分开记录
- 幂等声明：income=0 / paid=false / tx_hash=null / 未签名 / 未广播；本单不授权任何资金、密钥、钱包或付费动作

## 现状（已核证，勿重复调查）

- 2hives 团队申请：2026-10-27T10:42:28Z 经已连接 LTZZZ Gmail 发送并回读 SENT（thread/message `1a17cf44f3bdf73e`，收件人 info@2hives.com，主题 "agent application"）；`registration_confirmed=false`，平台明确确认前**不得**称注册完成/被接受。不重发申请、不新建三个重复账号。
- 官方协议 `2hives/agent-work` @ `28b940d67a331c59031c38555c52597f188a943c`：注册=邮件申请 → trial task 先行（公开来源核验，格式 `formats/trial-contact-verify.md`）→ `[pkg-<id>]` 邮件工包（含保密条款+task reference+输入+交付格式+deadline）→ 交付回复保持 `[pkg-<id>]` 主题且 task reference 写在回复主题与交付物第一行 → 运行 kit 内 `validate.py` → 人工审阅评分。**当前全 volunteer 无偿（"No fees in either direction, ever"）**；HTTP API 按该 commit 文本"coming live this week"，未宣布上线，无 live API 注册声明。
- 内部状态：`knowledge/results/external-markets/status.json`（M1 授权范围=owner_20261027 零押金零转出如实注册与免费练手；applications_sent=1、external_trials_assigned=0、externally_accepted=0、M1_adapter PR #273 草稿未部署）。现行 M1 派单与验收= `ops/dispatch/PLAN-EXTERNAL-MARKETS-20261024-M1.md`（准入/执行复核/记录对账/停止条件/第一批 1-3 单建议/最多 3 单后暂停）。
- Claude 规划与回执：PR #257（M1 只读规划审计，已合并）；PR #273（M1 零转出 adapter 草稿，OPEN 未部署）；PR #316（DAILY-2026-10-30-claude 六文件日课+REAL-HIRE 核验，OPEN 待合并，与本单无直接依赖）。未到 Claude 真实 M1 规划/验收时，只整理输入和登记阻塞，**不把 GPT 草稿署成 Claude**。

## 任务（持续跟进直到完成）

1. **先对账再行动**：每次跟进先查 2hives 官方 thread `1a17cf44f3bdf73e`（Sent + 来自 info@2hives.com 的回复），只查该 thread 与官方回复，不读无关邮箱。无新回复 → 无动作、不通知。
2. **收到真实 trial 或 `[pkg-<id>]` 后**：核对 真实发件地址与邮件认证、官方协议、task reference、格式、截止时间、用途、费用及地域条件；确认与仓库内申请记录同 task 同平台（幂等：按原 Task ID + 真实 package ID 先查租约/幂等预留，再派执行）。
3. **准入与执行**：严格按 M1 派单 §1–§5（来源可回读、零费用、地域/资格无限制、内容许可——私密包无平台明确允许相应实际提供商处理则 `blocked_model_processing_not_permitted`、禁止资金/投资/医疗法律/隐私/代登录、同时在制 ≤3 单）。只做无押金/质押/预存/会员/投标费/转出/钱包签名的任务；出现条件不符即记录准确拒绝/blocked，**不能替项目充值**。执行席位取真实响应元数据的 actual_provider/model；无原生调用不得冒充豆包/Kimi 已接单。
4. **复核与提交**：交付前由与作者实际 provider 不同的另一家复核，复核意见与原文保留不覆盖；只经平台官方入口提交（2hives 交付=回复 pkg 邮件保持 `[pkg-<id>]` 主题、task reference 首行、先跑 validate.py）；提交前后各读回一次；一单只提交一次，超时/无响应记 `outcome_unknown` 先对账，不得重发。
5. **保密边界**：平台包若限制保密/无留存/复用/训练/转交，不得复制到公开 GitHub、日志、第三方模型；只有平台明确允许相应 AI 提供商处理、或输入本来就是可分发公开数据，才可按许可分给 GPT、豆包、Kimi。
6. **完成定义**：平台的真实接受/拒绝记录 + 第三方反馈或可回读平台页面；HTTP 200、草稿数量、内部审阅通过都不算完成、不计收入。
7. **暂停条件**：最多完成 3 个本轮真实练手任务后暂停本跟进；明确拒绝/退出也暂停；同一平台连续 2 单被拒且涉及质量/合规暂停该平台；deadline 到期停止。不扩展其他注册/广告/外部联络。

## 通知纪律

- 无新邮件/回执/规划变化：不通知、不写重复工件。
- 只有 新增平台回复、真实交付/拒收、或必须本人处理的平台强制验证 时简短通知。

## 回执与边界

- 每单一份回执（字段见 M1 派单 §4：task_id、平台与平台任务 id、状态、实际 provider/model/response_id、输入输出哈希、提交/读回时间、平台反馈原文摘录、paid=false、tx_hash=null、收入=0），仅将无敏感信息的步骤、哈希、邮件/任务 ID、实际提交与平台接受/拒绝写入原任务回执并回读。
- 不改支付/A2/A3/B、预算/信任根或调用钱包；不得新增付费 cron 或原厂 GPT/Claude API。
- 环境说明（本席已试）：豆包 vm 无 Gmail/浏览器邮箱回读能力，邮箱对账由 GPT 通过其已连接通道执行；收到真实 trial/pkg 前登记为 `waiting_official_trial`，不伪造模型签名或平台接受。
