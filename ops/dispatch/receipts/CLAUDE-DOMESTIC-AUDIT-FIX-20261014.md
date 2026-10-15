# Claude 国内路由审计整改回执

日期：2026-10-14 America/Tijuana。执行：总控；审核来源：owner 转交的 Claude 文本。
状态：代码修复与本地检查完成；真实模型端到端验收仍未通过，不把模拟测试写成真实生成。

## 来源与边界

[Claude 转交意见](../../../knowledge/results/external/2026-10-14-claude-domestic-route-audit.md)，文件 SHA256：`ba2351f7481296ca16910af9fb42f049f64e3465879458b3d67e1306440b47e7`。
Claude 自述的 13/13 测试由其署名负责；总控本轮独立完成下面的 46 项测试。本轮没有调用原厂 Claude 或 GPT，没有取回 Claude 网页聊天或 Pulse zip。

## 整改

1. **凭证隔离**：删除 `call-claude-delegated.mjs` 中通用 `apiKey` 的备用入口，国内模型只能读取对应国内环境凭证。不按 `sk-` 前缀猜提供商；调用者传来的任何通用 Key 均忽略。测试验证无国内 Key 时传入 `sk-ant-FAKE` / `sk-FAKE` 网络请求数均为 0；配置国内凭证时只发指定国内凭证。这证明旧代码存在误发路径，不证明真实原厂 Key 已被外发。
2. **流式与片段**：DeepSeek 默认 SSE + 最终用量；处理跨块 UTF-8、CRLF、keepalive、最终结束标记；保留实际 model、请求头 request ID 和 completion ID，缺字段为 null，不伪造。工单执行器随接收将正文和元数据写本地回执；正常结束或可捕获异常后由原有 always 步骤提交。模型推理过程不写回执。收到兼容的完整 JSON 响应时保留解析能力。
3. **失败即未完成**：流结束标记缺失、输出截断、正文缺失、传输或本地存储失败均阻断。已收到正文只作为“未完成片段：未验收、不得结算”；不送第二阶段审核，不结算，未知用量为 null。`terminated` 同提供商自动重试建议未采纳，因为不能证明前次未计费。已有 claim 的任务继续禁止自动重购。
4. **真实复核身份**：普通国内工单和 GPT/Claude 岗位代执行均强制作者/复核者不同实际提供商，并排除同款模型日期别名。交付标题和字段用“国内模型复核”，Claude 仅为岗位标识，不冒充原厂模型。
5. **自动检查**：现有 owner-inbox 工作流新增流式适配器和回归文件的路径、测试覆盖；push 只运行离线校验，不触发付费交付，不新增 cron。

## 验证

本地 46 项通过，0 失败；语法检查与 git diff --check 通过。

```sh
node --check scripts/call-deepseek.mjs
node --check scripts/lib/deepseek-stream.mjs
node --check scripts/run-owner-inbox.mjs
node --test scripts/tests/owner-inbox.test.mjs scripts/tests/deepseek-stream.test.mjs scripts/tests/domestic-model-identity.test.mjs scripts/tests/domestic-model-router.test.mjs scripts/tests/claude-review.test.mjs scripts/tests/model-routing.test.mjs scripts/tests/claude-credit-state.test.mjs
```

覆盖凭证外发阻断、命名国内凭证回退、真实型号保留、流式拼接、缺失 DONE、length 截断、未知 finish、坏帧、上游错误、请求异常、用量未知、片段落盘、存储失败取消接收、原生/代执行两模式复核独立性、中文复核标签、原有 claim 不重复购买。命令行集成测试在临时目录、模拟网络下实际运行 prepare/execute 并回读 JSON/Markdown；不使用真实模型 Key。

## 未完成

- issue #60 / run 38664038527 的真实请求仍是失败；保留原回执，不回填成功、不盲目重跑。
- 本轮未购买新模型生成；流式能否解决实际链路中断，仍需一次后续真实任务证明。
- 整个进程或执行机消失时不能保证最后本地片段已提交远端；已远端提交的 claim 仍防止自动重购。
- 原 Pulse zip 尚未取得，Pulse 未部署；本补丁不冒充作者原代码。
- 不改五签、钱包、权限、资金上限或国内日课频率。模型计费与内部积分/真钱工资仍分开，未发生真钱结算。

生效方式：本 PR 合并后，既有执行器使用新代码；不需要新增服务或钱包部署。上线检查以 GitHub Actions 实际结果为准。
