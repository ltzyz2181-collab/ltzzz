# 下一单外部雇佣：盲测新增价值

类型：派单规范。状态：prepared_not_purchased；今天已付款订单不重复购买，下一日期新订单采用external-novelty-v2，仍受每笔≤0.05 Base USDC限制；不新增付费定时。

目标：只提供接口说明和一个已知的历史GET预览缺陷，请供应方找至少一个额外问题，给可证伪反例和复现计划。不得在作者提示词给第二个缺陷答案或完整回归答案；接口字段文档可以提供。提示词实现：wep3-procurement-novelty.js；自2026-10-21起新daily订单生效，不改既有订单原提示词和交付。

输入：固定接口说明、source_commit/input_sha256、一个已知缺陷。模型：固定外部提供商报告的DeepSeek；复核必须不同提供商。资金来源：wallet/addresses.md的operating_treasury，不调用Claude团队钱包或交易所充值地址。

输出：原始交付和SHA256、known_regression/new_candidate分类、具体证据、反例、测试和未验证事项。找不到新问题时明确no_supported_new_issue，不为了满足数量编造缺陷。

验收：原有GET预览和limits层级问题都不是新发现（此历史基线只供独审使用，不加入作者提示词）。至少一个真正新增问题须由独审排除基线重复，并实际独立复现；仅有作者候选或静态接受仍是engineering_draft，新增价值记pending_independent_reproduction、已验证新问题数0。八项我方回归不得计作供应方新发现。

未执行：本卡没有新增付款、模型请求或复现。实际值须等新订单交付和独立复现回执，不能预写成功。
