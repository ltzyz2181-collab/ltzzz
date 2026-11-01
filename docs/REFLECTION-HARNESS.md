# Harness：观 → 记 → 改 → 验

这是 LTZZZ 的执行经验层，不需要购买云端 Harness。桌面客户端通过仓库命令取用；现有云端任务通过共同调用入口取用。它改变上下文、取证方式和执行检查，不训练基础模型权重，也不保证模型从此不犯错。

## 已接入的执行链

1. **行动前**：`scripts/lib/ltzzz-skill.mjs` 的 `skillContext` / `callWithSkill` 在原有激活合同后附加相关教训及经验策略。原合同哈希不变，反思内容单独记录 SHA256、lesson IDs 和 strategy IDs。使用这些入口的 ANS、日课、千问队列、native inbox、autonomy 和 patchgate audit 获得相同经验入口。检索证明只表示已放入上下文，不表示执行者已经遵守。
2. **观与记**：`Harness observe learn and verify` 在主线代码或受支持回执变化时运行，读取 Git 固定提交中的公开回执，只输出白名单状态、任务/执行 ID、提供商元数据和原始字节哈希。同一任务和 run 更新同一个事件，不按每次扫描新增日志；没有变化不新增运行回执。失败和成功阶段都计数，避免只统计失败却没有分母。
3. **改**：从已观测错误类别选择代码内审定的短策略，下一次任务直接取用。重复类别提示改变方法及补回归验证。模型和外部输入不能往策略里塞可执行补丁；修复仍由已有授权的总控实现。原因没有验证就保持 `unverified`；同类别出现多次不等于已证明同一根因。
4. **验**：这次实际修复了三个可测试问题：ANS 输入从固定提交读取并逐项记录 commit/hash；独立提供商比较先归一化别名；自动 ANS 提交标题来自真实状态。工作池的现有 preflight 接上教训检查，修复 `applied=false`、重复 ID、超过 50 条漏检。8 条历史种子仍是建议，没有伪造采纳或异提供商复核。

## 桌面执行与回执

```
node scripts/harness.mjs before receipt,model_output,input_hash,external_platform
node scripts/lessons.mjs validate
node scripts/lessons.mjs stats
```

根目录 `AGENTS.md` 提醒可读仓库的执行器先取经验。没有仓库/工具权限的豆包、Kimi、Claude 等席位，由现有派单入口传入这份上下文；仅有任务卡不代表对方收到或运行。网页版、第三方桌面客户端是否加载仍需实际执行回执，不声称已经远程升级所有 AI。

原任务回执建议补充 `lesson_ids_considered`、`changed_action`、`verification_evidence`。这些字段如果来自模型，标明自述；只有对应工具结果和测试才能证明改变已经执行。不要为填反思字段额外购买模型调用。

## 外部练手数据

2hives 的正式地域拒绝只留下允许公开的状态引用，后续已经暂停。没有包就不做平台业务，也不拿拒绝材料训练模型。其他平台的原始包、邮件、客户输入、模型工件遵守各自保密/留存/转交条件；不确定时不复制到公开仓库。

未来执行器可以提交下面的公开元数据，文件名只用字母、数字、下划线和连字符：

`knowledge/results/harness-input/TASK-EXAMPLE-01.json`

```json
{
  "schema": "ltzzz.harness.public-outcome.v1",
  "retention": "public_metadata_only",
  "task_id": "ORIGINAL-TASK-ID",
  "execution_id": "REAL-PACKAGE-OR-RUN-ID",
  "outcome": "submitted",
  "issue": null
}
```

允许阶段：`draft`、`test_passed`、`submitted`、`platform_accepted`、`platform_rejected`、`blocked`、`unknown`。此封装只是执行器报告，不独立认证平台接受。原平台证据和验收仍在原任务回执中，不能用这个字段代替真实回读。未知字段和正文不会被反思观察器保留。禁止先把保密内容放到这个输入文件再期待观察器替你保密。

## 经验、采纳与效果分开

- `knowledge/lessons/` 是人工/AI 提炼候选的原台账；`observed` 只建议。旧格式的 `adopted/verified` 校验保留，但单个 JSON 中的供应商名称和布尔值不是原生身份或执行证明。总控按现有授权决定实际改动，评审监督，不新增五签门槛。
- `knowledge/learning/events/` 是固定来源的紧凑观察；`summary.json` 汇总不同阶段、类别、次数和下一次策略。先前回执修正会更新同一事件；它不替代原始历史。
- `recurrences_after_adoption` 只有存在 `adopted_at` 才统计采纳之后的记录；缺时间列为未知，不把全部历史算作改进后失败。
- 第一次主线观察器会写 `knowledge/results/harness/<run-id>.json`，含实际 run、源码哈希和上下文构建证明。没有真实模型调用就写 `model_calls=0`，不会冒充各席位已经学习或第三方接受。
- 要判断效果，比较同类任务改进前后的失败率及样本数，并保留任务范围变化；现有数据不足时写“尚未测量”。少写几条错误日志不等于变聪明。

## PR #316 审核结论

准确 head：`2da79212dffb2d7a4e2ec3b18035fa731de9cc9b`。它只有两份日课/核验回执，不是 Harness 实现；反思台账骨架来自已在主线的 `2915cde8`。

可借鉴：将固定规则规划如实署为 `fixed_rules_dispatch`，区分成功标题与实际失败回执，为滚动输入补固定提交。ANS 输入 `f86457455b5488c3a350e552dc70501a1ae50562` 的 SHA256 `69a65e4cbfc48d401e8d8e6eea89710bdfe6157057bda0f35887ab9d5c000931` 匹配，但那是调用前输入，不能代替后续模型调用证明。

不纳入事实知识：“多数戒烟者出狱后复吸”没有给来源；“10 次/30%”只是拟议实验参数。两组失败回执不能外推项目历史从未发生真实付款。此次同供应商子代理复核也不算另一家原生复核。

不修改资金、预算、信任根和六份原文，不增加付费定时任务或原厂 GPT/Claude API；既有授权的自主合并、部署和恢复继续按现有执行策略运行。
