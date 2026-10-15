# Claude 国内路由审核 · owner 转交

来源：owner 在本对话转交的 Claude 审核文本。署名保留 Claude；总控没有通过 API 调用 Claude，也没有独立证实其自述的干净环境运行。下面正文照录，不代表线上验收。

---

**通过的部分**

- 仓库自带的 13 项测试，我在干净环境里全部跑过，13/13 通过。
- 路由是对的：Claude 岗位先走豆包、再走 DeepSeek，GPT 岗位先走 DeepSeek，再走豆包、Grok。
- 身份是如实的：返回里带 `executed_by`、`delegated:true`，原厂调用计数 `native_openai_calls` 和 `native_anthropic_calls` 都是 0。国内模型不会冒充 Claude 或 GPT，符合你说的"不能变成它们本身"。
- `config/ai-providers.json` 里 Claude 的签名权和投票权都是 false。
- 成本有上限：原厂 Claude 复核只能由 owner 手动触发，先提交记录再调用，没有定时任务。

**必须改的漏洞：原厂 Key 会被发到豆包**

我用模拟网络请求实测了：不设 `DOUBAO_API_KEY` 和 `ARK_API_KEY`，调用 `callAgent({apiKey:'sk-ant-FAKE'})`，请求真的发往 `ark.cn-beijing.volces.com`，带的头是 `Bearer sk-ant-FAKE`。原因是 `scripts/call-claude-delegated.mjs` 里把传入的 `apiKey` 当成豆包 Key 的备用值。

- 这正好违反"国内额度不能激活原厂 Key"的反面：原厂 Key 会被送到国内服务商。
- 修法：删掉 `||apiKey`，豆包 Key 只读 `DOUBAO_API_KEY` 或 `ARK_API_KEY`。
- 再加一条测试：传入 `sk-ant-` 或 `sk-` 开头的 Key，任何国内端点都不应收到它。

**两个运行问题**

1. DeepSeek 会断连。issue #60 的运行（run 38664038527）里，`deepseek-reasoner` 非流式调用约 61 秒后报 `TypeError: terminated`。
   - 建议改成流式调用，边收边存部分输出，并记录请求 ID。
   - 路由器遇到状态不明确的失败（`provider_incomplete_or_uncertain`）就停，不再换下一家，这样不会重复扣费，但任务也会卡住。可以对 `terminated` 加一次同提供商重试，再决定是否换家。
2. 复核的独立性有限。豆包和 DeepSeek 做作者、复核者时要强制分属不同提供商，输出要标成"国内模型复核"，不要写成"Claude 审核"。

**我没验证的部分**

我没有任何国内模型的 Key，所以没有真实生成过内容。issue #60 的端到端验收还没证实，仍不能写成"已通过"。

要我把上面三处改成补丁和测试发给你，转给总控提交
