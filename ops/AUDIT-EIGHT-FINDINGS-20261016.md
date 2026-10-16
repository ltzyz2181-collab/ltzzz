# 10月16日八项复议：修复与证据边界

本记录依据 owner 转交的八项发现、正式日课原始回执、PR93/97 与当前源码。保留历史失败，不借独立ANS执行替代正式DAILY，不对资金权限或公开发布补造证据。

| 项目 | 本轮核对 | 处理与尚未完成 |
| --- | --- | --- |
| P1 执行链 | 08:10 CST 正式结果属于旧 run 38827688430，claim_verified=false；PR93/97 晚于它上线。 | 新增复用豆包现有日课调用的 DeepSeek 当日工件独立审核；同一 date/run/source/task 与双方公开工件绑定，提交和审核回读失败保留 unknown。未重生成旧日课；首轮生产验收仍待真实回执。 |
| P1 工程草稿 | ans-cycle/2026-10-16.json 的 accepted 属 engineering_draft_only。const重赋值、错路径和错哈希是建议补丁中的问题。 | 没有原样执行草稿；真实修复由 PR93/97 和本轮实际 diff、测试、部署回执证明。草稿审核不升级成 deployed，代码上线不倒填模型交付。 |
| P1 旧Vault权限 | 区块52640777两RPC零USDC/aUSDC/exposure，但 permission_revocation_verified=false；credential_exposure_verified=false。 | 权限风险维持未解除，不向旧Vault新增资金。不把旧地址匹配写成私钥泄露，不把零余额或revert写成权限撤销。未执行钱包交易。 |
| P2 千问回归 | 10-16工单已于08:29:38 UTC实际签发；明确 assigned_waiting_external_return。 | 这证明逻辑总控派单，不证明千问原生接单；不追溯补签、不以探针替代、不新增千问调用。 |
| P2 Claude来源 | git独立比较确认历史两篇新增12/13行，原文误述仍作为原始证据保存。 | 日课外部交付视图现在同步显示单独的总控校注；校注更新不改变原文hash、原执行ID或其他Agent结果，不冒充Claude的话。 |
| P2 记忆候选 | 原队列没有10-16新实质候选，已有10-16巡检/摘要主要为运行元数据。 | 新增正式日课证据边界、外部审稿归属两个有版本证据的候选，经既有晋升器入队；human_confirm=false，不自动写六篇正文，也不重复添加旧Vault同义候选。 |
| P2 视频发布 | 07:55 UTC回执为queued，计划14:00 UTC / 22:00 Asia/Shanghai；published=false。 | 不把入队、Pages文件或预期定时写成公发。仍须实际平台permalink/可见性与发布时间回执，不能以旧视频替代。 |
| P2 Kimi审核 | latest WEP3原生Kimi仍not_configured后实际Grok；readiness无缺项只代表接线。 | 不新增危险部署来制造调用，不把health200/配置写成成功生成；修复后的真实Kimi WEP3审核回执仍待验收。内部积分仍非USDC付款。 |

## 本轮日课审核实现

- 顺序为已有DeepSeek调用→已有豆包调用→已有Grok调用，次数与定时不变。豆包拿到本轮DeepSeek不可变工件并返回显式JSON审稿块；没有可核验工件只交清单，不能声称已审核。
- JSON判定绑定worker哈希；controller加入date/run/source/task和实际不同供应商、实际模型；将其与豆包原始交付哈希关联。完整双方工件与审核工件先入Git并回读，才能向线上任务板发review_task。
- 仅engineering_draft_only；拒绝会成为rejected_draft_review，接受仍不是生产部署或真钱工资。豆包自己的交付保持待另一个独立审核者审查，不能自审。
- 审核响应丢失只回读既有结果；状态不明不重买模型，不转移当天生成预留。同步补交不调用生成接口。
- 旧的正式结果不补造board_lifecycle；外部Claude校注仅更正来源视图，不修改历史认领和模型结果。

部署与首次真实生产闭环分开记录，最终以本轮PR、CI及knowledge/results/desktop/中的验收回执为准。
