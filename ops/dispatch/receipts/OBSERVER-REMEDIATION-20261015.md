# 10-15 观察席复议处置 · 总控

范围仅 `ltzyz2181-collab/ltzzz`。本记录依据 owner 转交的观察清单和总控直接核对的当前代码/回执，不冒充外部审稿人亲自执行。新工程改动的 CI 运行结果在部署后追加，未运行前不宣称部署验收。

| 编号 | 核对与处置 | 关闭边界 |
|---|---|---|
| 01 | 复现三个ID的双记录：84项只有81个唯一ID。schema v2归并为一ID一当前状态；applied派生索引、revision和state_history分开保存，原队列整体另存reconciliations快照。两条元数据保留历史applied，同时标记operational_metadata、不再具备晋升资格。扫描器不修改长期正文 | 修复不伪造新的人工确认、历史晋升时间或自动撤回；历史质量问题可追溯，后续撤回须有明确记录 |
| 02 | 旧巡检/代理探针不能当作千问原生派单。现有总控流程将每日签发千问回归单和结构化签发回执，算力不足可只交零模型检查；仅签发不算认领 | 不补造早先缺失的原生单；千问实际接单仍待一手回执 |
| 03 | 旧Vault10-15区块52631973两RPC记录余额/敞口均0，guardian仍匹配旧Agent地址；这不证明泄露，也不证明权限解除。新只读探针固定同一区块、分开RPC不支持/合约回退/不确定网络错误，任何模拟结果都不算权限解除 | 源码-字节码等价及权限撤销仍未验证；new_funding_allowed=false；无签名、无资金动作 |
| 04 | 真正完成的是ANS生成、异provider草稿审核、任务板hash回读。具体跨日派单问题已由总控实现，commit5697955；无通用任意补丁自动测试合并部署 | P1保留。另发ANS-PATCH-AUTOMATION-20261015工程单，不用“草稿已审核”冒充“任意代码已部署” |
| 05 | daily-tasks从10-09配置升级：原厂GPT与Microsoft额外付费日课停用、逻辑GPT总控由国内执行器接续、Claude外部免费讨论、千问每日外部回归。运行脚本从同一配置生成非执行席位状态 | 不恢复OpenAI/Anthropic付费调用，不把按预算停用算API故障 |
| 06 | WEP3旧轮实际审核者Grok仍保留。新Kimi-readiness-38696556578确认两项接线存在但generation_verified=false；AET38/39的Kimi成功是另一条子网链路 | WEP3新Kimi生成审核未重新验收；等待既有获批运行，不加付费定时 |
| 07 | data/agi-econ/receipts/AET-00038/39已明确ledger_only、internal_credit、paid=false、tx_hash=null。settled是内部任务结算状态 | 两单本次USDC付款均为0；不得说已付真钱工资，不重写余额或历史收据 |
| 08 | 原私密视频记录保留为历史。最新B_F6YC0GeBA已真实公开且processed；首次发布38740073156成功，日课38740451167返回already_public且同一ID，模型调用0 | YouTube“目前只能private”已过时；TikTok未连接仍开放，不把新视频成功追溯给旧视频 |
| 09 | 豆包10-15正文包含尚未执行的三次念头观察，并在脚本中预言结果。原文不改，增加明确的未执行/未验证内容复核，要求修改未经证实的预测性表述 | 结构完整不等于科学论证通过；没有新增人体实验或机制验证 |

GPT正式原厂日课停用、Claude未产生正式付费日课都符合现有预算安排；逻辑总控运行另查 `knowledge/results/control/`，不能把岗位名称与原厂模型身份混为一谈。

关键原件：`knowledge/results/security/legacy-vault-38706656285-attempt-1.json`、`knowledge/results/ans-cycle/2026-10-15.json`、`knowledge/results/wep3/latest.json`、`results/publishing/youtube-recovery-2026-10-15.json`、`data/results/2026-10-15.json`。历史回执保留原日期，新处置按实际时间记录。

## 首轮实际验收与持续运行补修

- PR81合并提交 `0d9f582`。Memory Promotion `38742937967` 成功，实际扫描后81项/81个ID，未重建冲突候选；六文件完整性 `38742938177` 成功。
- 总控 `38742937989` 成功，千问回归单于 `2026-10-15T13:28:14.260Z` 真正签发并入库，状态仍是等待外部回归，模型调用0。证据：`knowledge/results/dispatch/qianwen-return-2026-10-15.json` 与对应ops正式单。
- 新双RPC只读验收 `38742938089` 成功：同一区块52640777，USDC/aUSDC/exposure均0，guardian仍匹配旧Agent地址；两次提款模拟均明确为 `contract_reverted`，不证明权限安全。回执 `knowledge/results/security/legacy-vault-38742938089-attempt-1.json`；交易0、模型调用0。
- 同时定位两处真实持续运行故障：后续总控 `38742953830` 的计算步骤成功，但检出旧事件提交后在回写时add/add冲突；Manifest `38742937966` 被另一写入者推进main导致push拒绝。这些是保存阶段失败，不是模型执行失败。
- 后续补修：总控始终检出最新main，保留原模型回执并记录本次扫描的实际checkout版本；只对Git回写做有限重试、真实冲突不覆盖，失败时保留artifact。Manifest在独立worktree读取最新main、每次重建后提交，push竞争失败时重新构建，而不是推过期hash；不再吞掉rebase错误或取消正在运行的同步。
- 补修的真实Git并发反例与原有回归合计27项测试通过。新的总控和Manifest线上验收结果将在运行完成后追加；不把首轮历史失败改写为成功。

## 持续运行补修验收完成

- PR82合并提交21df939。总控38743881471成功：原03:26模型审查未重跑，日志明确Fresh receipt scan / no duplicate daily model call；实际checkout21df939与核心文件hash另存最新扫描字段，原失败未抹掉。回执提交930feb3。
- Manifest38743881503成功：真实worktree重建并推送，提交3016fa1；对象存储密钥缺失时如实跳过R2，当前manifest通过GitHub正常提供，不声称R2已同步。
- 新增三份当日重要事实候选来源，分别记录ID归并、旧权限未解除、保存阶段失败修复；仍只是candidate，不自动晋升或伪造human_confirm。
- 所有实现经PR81/82入库；新Vault、付款、签名权限和原厂付费API未操作。开放项仍为：旧Vault撤权/源码等价证明、通用补丁自动部署、WEP3新Kimi生成验收、千问实际原生回归、TikTok连接及豆包原稿修订。
