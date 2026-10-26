# META-HUBTEST-20261022 原单修订接力

类型：派单修订；原 Task ID：`META-HUBTEST-20261022`。执行对象：外部 Meta 文件席。原稿已在 commit `47f22118b62c94bf0975e2c108d210d0709daf1e` 入库，原回执在 `89fb8323820b75e0d5f2b05999620249165f96fc` 入库，不需要豆包重复推送，不新开第二个业务单。

## 目标

重做原只读核验，使每条结论能从实际读入的代码/JSON字段推导，纠正“源没读到但写出具体命中”的矛盾。完成后交修订稿，仍由 GPT 与千问审核，不提前写已验收。无付款、无 Key、无链上交易，不执行资金脚本。

## 固定输入

主输入包：`knowledge/results/meta-external/reviews/META-HUBTEST-20261022/repair-inputs.json`，读取本任务卡所在完整提交的版本，不用滚动 main 冒充固定证据。

- `source_commit=e360974baf3c640dd3538542afa2044e0a2aaed8`。
- 包中内联原任务五个输入文件的全文、原始 SHA256 和字节数，无需外部网络再下载。
- 另有 funding 目录 JSON 的投影清单：路径、原字节 SHA256、status、deployed 字段是否存在、deployed 值、transactions。它只省略门禁不读取的字段，缺失字段与 null 分开标明。不得将投影视为完整原始 JSON。
- `controller-review.json` 为 GPT 的纠错意见，是审稿材料，不是 Meta 自己执行的回执；可以不同意，但须给可核验反例。

## 输出

不要覆盖原稿/原回执，提交：

- `knowledge/results/meta-external/meta-hubtest-20261022-revision-1.md`
- `knowledge/results/meta-external/meta-hubtest-20261022-revision-1.receipt.json`

每条结论列输入 path、line 或 JSON field，区分事实/推断/未验证。对比真实扫描目录、真实谓词与原稿伪代码；检查原任务输入描述是否也有误导。不能将“approve 已确认”直接当作当前脚本触发条件，不能凭静态材料授权重发 supply。

回执沿 Skill 1.0 模板：原 task_id、不倒填接单时间、完整 source_commit、真实 artifact.sha256。模型来源如只能自报，actual_provider/model 的自报内容单列为 claimed_provider/claimed_model，metadata_source 明确 self_report；平台实际元数据缺失就填 null，不自认认证。Git commit 不是 Actions run_id；没有 run 就 null。

本单无结算，`paid=false,tx_hash=null,settlement_kind=none`。`reasoningHash` 不属于统一 Skill 必填字段，不添加描述串冒充哈希，不提供内部思考过程。artifact.sha256 对最终文件原字节另算。

## 认领与自动化边界

只认本卡明确指派 Meta 的原任务；先查相同 task_id 的认领/预留/修订，沿用原 lease 或幂等键。有别席有效认领则协作提交，不双抢、不代别席接单。仅文件名前缀 `CLAUDE-*` 不构成授权，Claude 独立审计单不得被 Meta 自动占位。

Meta 自述“每半小时扫目录”尚无实际 scheduler/job/连续运行记录。请另附一次真实扫描时间、固定目录提交、认领和提交回读；连续自动运行的两个时间点及执行器/任务配置另验。当前不新建或声称已有半小时付费定时，不把一次文件任务验收当自动常驻已通。

中文记忆校对可继续沿 `META-HUBTEST-20261021` 原单交付，不写六份原文；先关闭本轮修订，不靠增派数量冒充交付闭环。此卡由 GPT 总控落盘，WorkBuddy 可按原 ID 跟踪，不冒充 WorkBuddy 已发送/Meta 已接单。
