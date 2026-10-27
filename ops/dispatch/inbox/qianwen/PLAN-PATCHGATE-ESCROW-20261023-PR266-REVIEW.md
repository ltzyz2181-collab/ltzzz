类型：派单（不等于原生调用或验收）

原任务：PLAN-PATCHGATE-ESCROW-20261023；子项：PR266-REVIEW。目标：按 #266 五条要求独立查小额付款的确定性策略/状态机，检查总控完成声明，不替代 Claude 审计。

输入：本卡所在 PR 的准确 head、knowledge/results/patchgate/post266/artifact-manifest.json 全部代码/测试、docs/SMALL-PAYMENT-AUTONOMY-20261027.md 和云设计/配置。总控评论固定实际 head；自行回读/计算摘要，不要求文档包含自己的整体哈希。云 API 若不能自主读取，必须由持凭证的 Actions 执行器将完整受审字节注入；只发链接的盲审不验收，不给你传密钥。

输出：knowledge/results/patchgate/post266/ 下独立回执及审计 PR。署名来自真实客户端/提供商响应：actual_provider/model/metadata_source、source_commit、输出工件 SHA256、run/attempt/request_id（存在才填）、完成状态、每条结论/反例、paid=false、tx_hash=null（指审计本轮无资金动作）。不能用模型自报身份或 OpenAI 工程帮手充作千问原生审核。

验收：复算 raw精度和时窗；单笔/别名滚动24h <20、共同日周预算、并发预留、未知结果跨期保留；验证真钱字段不能从 false/null 默认补造、真实冻结而非报告；审查旧钱包live入口迁移影响、可信回调/云调度尚未实现、默认配置和两审均未登记。逐项裁定，不写笼统 approve。

禁止：付费定时/真实付款/签名、打开资金或A2/A3/B、扩大绝对预算、让自己生成所审代码后自审、把本卡记成已接单。收到准确回执前仍 assigned_waiting_acceptance；无需为本卡重跑日课。
