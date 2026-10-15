# Claude 工作身份与五签资金权限分开

Claude 可以继续为 LTZZZ 做代码审查、设计反例、研究、六文件讨论和测试建议。退出五签不等于被禁止工作。

本次只启用外部审稿接入，不恢复旧资金子网席位。`votingSeat=false`、`walletSigning=false`；工作入口不持有钱包/部署凭证，不能因一篇审稿自动部署、发工资或改变资金策略。原资金子网撤席与历史账本保留。

## 不依赖云浏览器的按需方式

[Claude 按需审稿工作流](https://github.com/ltzyz2181-collab/ltzzz/actions/workflows/claude-on-demand-review.yml) → Run workflow：

- `mode=inspect`（默认）：只查官方 API 模型目录，生成 0 次，并生成公开资料包；不会请求付费生成。
- `mode=review`：仅仓库 owner 手动发起，一次原生 Claude 生成；`topic=ans-pulse` 评方案与既有审核，`topic=six-memory` 完整读六文件。任务单号幂等，已有 claim 不再次调用。

API 是新任务执行通道，不会继承 Claude 网页对话，也不能通过 API 取回旧聊天里的 zip。原 Pulse zip 未取得时，审稿提示明确缺少实装代码，不允许把方案评语写成实现验收。

```sh
gh workflow run claude-on-demand-review.yml --repo ltzyz2181-collab/ltzzz -f mode=inspect
# 确实要使用现有API额度进行一次审稿时，显式选择review和新的真实任务单号：
gh workflow run claude-on-demand-review.yml --repo ltzyz2181-collab/ltzzz -f mode=review -f topic=ans-pulse -f task_id=CLAUDE-ANS-PULSE-REVIEW
```

Claude 不需要自己能推送 GitHub；已有 Actions 执行器代存。完成输出仍为 submitted_pending_review，不自动进入六文件定论、不视为部署、不视为真钱工资。

## 成本与失败

默认优先目录中实际存在的较轻 Haiku；指定 Sonnet 须实际在目录。最多 32000 输入字符、1600 输出 tokens、1 次生成请求。没有计费价格/账单数据时不承诺某个美元上限。不自动选昂贵模型、切备用模型、重试未知请求或充值。

余额不足明确 `blocked_insufficient_api_credits`；未正常结束或缺交付结束标记为 `blocked_incomplete_output`，不报成功。超时也保留 claim，后续不重复购买。同一单号遇到未知结果先核实，不靠换单号绕过。没有可核验免费 API 额度，也不把浏览器人机验证失败解释为 AI 不能工作。

## 免费聊天仍可参与

若仅用原有 Claude 免费/订阅聊天，它仍可讨论和审稿，但套餐资格、额度及 GitHub 写工具分别验证。可在本机受支持的 Claude/Claude Code 环境使用本人现有登录；不能保证套餐含 Claude Code，也不替 owner 新购订阅。Claude 输出可由有写权限的总控代存。浏览器登录不是本按需 API 工作流的依赖。

## 自动化边界

没有 schedule、没有新付费日课。普通合并只运行测试和 inspect。现有 DeepSeek/豆包日常工作不变；五签、Safe、资金子网注册和钱包 Secret 没有恢复。源码和生成文本全部作为数据，执行器不运行模型给出的命令。
