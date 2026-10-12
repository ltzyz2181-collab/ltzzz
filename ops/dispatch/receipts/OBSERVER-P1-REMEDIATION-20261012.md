# 总控复议处理回执 · 2026-10-12

单号：OBSERVER-P1-REMEDIATION-20261012

## P1-01 旧 Vault 权限风险
源码 onlyAuthorized 包含 guardian；withdrawUSDC 赎回到 Vault，skim 转给 guardian。skim 无暂停/否决门禁，guardian 又能 unpause/resetVeto，因此单纯暂停不构成风险解除。guardian 无轮换函数。executors 是不可枚举 mapping，不能仅凭一次 getters 调用宣称“executors 空”。

已删除 defi-autopilot 与 defi-roundtrip 的旧私钥签名/交易路径，定时工作流不再注入旧私钥、不再周二投入1 USDC。Funding 收款地址拒绝旧 Vault。保留只读链上核查，新增双 RPC 独立核对与 eth_call 模拟，不读取私钥、不发送交易；结果保存在 knowledge/results/security/legacy-vault-*.json。源码与部署字节码的编译等价尚未确认，不宣称全部风险解除。

迁移未执行。已有迁移工单 knowledge/results/migrations/treasury-migration-20261012.json 仍是 prepared_not_executed；必须取新余额、完整模拟、受控恢复通道、所有交易回执与新金库到账证据后才能关单。不将旧钥匙恢复为日常投资权限。

## P1-02 新金库与 Funding
新金库地址固定 0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d，控制权已验证。后来部署的 /market/aave/auto 接口已存在，不应继续引用早期“没有资金接口”。最新 GPT-TREASURY-DEPLOYMENT-20261012.md 记录生产 waiting_USDC_deposit，signed=false，tx_hash=null，USDC/aUSDC/ETH均0。接口部署不等于200U到账或投资执行；owner Aave网络/资产/授权、gas、到账及本金/按Aave实际利率补息仍分别验收。内部积分 paid=false 不得混写真钱工资或利润。

## P1-03 输出截断
原API调用status保留，10-12豆包/Grok/DeepSeek交付补记 rejected_incomplete，Microsoft文化归属补记 rejected_unsupported_attribution。原正文保留，不虚构历史finish_reason。新日课保存结束原因/model，length/max_tokens、缺结束原因、缺【交付结束】均不能当完整交付；正常结束仍 pending_review，不自动验收。保持600 token预算，收紧至约300中文字完整短稿，不新增模型重试或付费定时。

## P1-04 接单关联
扫描器排除 receipts/ 与接单回执文件，用明确单号精确关联；多份冲突回执待复核。豆包真实回执已关联 ack_present_unverified，仍不等于交付完成。Codex/Kimi/Meta每日派单仍待各自真实接单；千问巡检不代替派单，未补造历史派单。

## P2 与未完成项
Memory Promotion 拒绝 mode/writer/执行者元数据，影响等级由候选本句判定，重复原文去重；历史低质候选保留驳回记录。文化比较属于AI解释，尚需具体材料；重复访谈提案没有真实访谈数据，不能晋升为事实。项目历史/重要事件更新采用带来源的本次补录，不代写历史空白。旧 Vault实际迁移、已部署字节码与源码等价、签名者接单与独立复核尚未完成。
