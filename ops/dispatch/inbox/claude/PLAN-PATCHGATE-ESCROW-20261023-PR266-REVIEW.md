类型：派单（不等于接单/审计通过）

原任务：PLAN-PATCHGATE-ESCROW-20261023；子项：PR266-REVIEW。沿用原任务，不新增购买或日课。

目标：复审 #266 后续的小额付款实现与两份云 publisher/checks 设计。#263 已依据 #266 在默认关闭范围合并，不能重复要求批准旧 head 或把这次审计记成 A2/付款启用。

输入：本卡所在 PR 的准确 HEAD（由总控在 PR #266 评论中给出）、knowledge/results/patchgate/post266/artifact-manifest.json、docs/SMALL-PAYMENT-AUTONOMY-20261027.md、docs/PATCHGATE-CLOUD-PUBLISHER-AND-CHECKER-20261027.md 及清单中的代码/测试/配置。自行读取完整字节，不仅看总控结论。

输出：在原任务下新审计文件＋分支 PR。列 audited_head、逐文件 SHA256、实际 author_provider/client/model 来源、每条五规则裁定、阻断项与验证边界；保留旧意见。测试或 GitHub shared login 不冒充 Claude 原生审计。

验收：核对单笔/日/周及2×证据、防拆单/别名/并发、经济独立性、持久冻结、自动 alarm 契约、回执真实语义、默认关闭；检查 callback 是否把核心验真外包且部署尚缺，不能把库测试当作线上完成。区分已实现逻辑和未连接能力，给出可否默认关闭合并；付款激活仍须另一提供商真实审计。

禁止：付款/签名/充值、读私钥或配置凭证、改上限/开关、替自己填写另一家批准、把工程帮手当独立供应商审核。没有实际接单/读取证据，状态保持 assigned_waiting_acceptance。
