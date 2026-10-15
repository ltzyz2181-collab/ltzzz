# GPT/Claude 工作岗位的国内算力接管

日期：2026-10-14 America/Tijuana。来源：owner 要求在无法给 OpenAI/Anthropic 充值时使用 DeepSeek/豆包继续项目。
状态：代码已验证，待合并后的真实国内任务验收。

## 真实边界

不能把国内额度转入、激活或恢复 GPT/Claude 的原生 Key；也没有把这两家闭源模型部署到国内。接管的是总控/规划/审稿岗位，真实输出来自国内提供者，保留实际身份。

## 改动

- 已有 GPT→DeepSeek 路由保留。新增 Claude→Doubao/DeepSeek 路由，默认模块改为 call-claude-delegated.mjs；不读取 OpenAI/Anthropic 凭证。原生 Anthropic 只作为另行显式选择的可选入口。
- 现有 owner 工单新增“GPT/Claude岗位国内代执行”模式，自动读取六文件、调用模型并将全文入库，owner 无需搬运模型输出。默认仍只登记、生成0次；没有新增定时任务。
- 逻辑岗位和实际 provider/model/model_source 分别入回执。DeepSeek/豆包适配器优先保留 API 返回型号，缺字段才标 requested_model，不再覆盖响应的实际版本。
- 第一执行者与审核者不同实际提供者，且不能为同一实际模型的日期别名。不同逻辑岗位不构成独立性；没有独立模型就阻断。
- 先持久化 claim；同任务不重购。未知失败/超时/截断不自动切换购买；明确拒绝才允许有限备选。工作流只注入两家国内 Key，不注入 OpenAI、Anthropic、钱包或部署凭证。

## 本地验证

35 项相关测试通过；涵盖原资金子网撤席仍生效、未知请求不重购、显式岗位模式、独立真实模型、适配器实际响应型号和默认Claude模块忽略原生Key。六文件和既有原生Claude按需入口仍保持各自边界。

## 验收安排

合并后仅通过一次明确标识的 owner 工单执行国内交付：GPT逻辑岗位由DeepSeek分析，Claude逻辑岗位由豆包复核。目标是ANS/Pulse方案的可核验边界，不生成或假冒缺失的原代码zip。

实际模型调用/用量与全文以 knowledge/results/owner-inbox/ 对应 Issue 回执为准。国内算力仍消耗现有额度，不承诺免费、不编造费用；不把内部岗位/积分当真钱工资。不改五签、Safe、钱包权限、已上线机器人或国内日课频率。
