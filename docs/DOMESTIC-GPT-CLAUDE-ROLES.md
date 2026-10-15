# 不续费海外模型时的工作接管

DeepSeek、豆包的额度不能转入或激活 OpenAI/Anthropic 的 API Key，也不能在本地启动这两家的闭源模型。可以把总控、规划、审稿等岗位交给国内模型继续执行，并如实标注身份。

当前验收：入口代码已合并；首轮真实任务 #60 在 DeepSeek 请求中断后停止，没有买第二阶段审稿，尚未通过完整双模型交付验收。详见 [实际回执](../ops/dispatch/receipts/DOMESTIC-GPT-CLAUDE-ROLES-20261014.md)。模型是否被计费未知，不能把未收到用量记为免费。

## 已接入的默认路径

| 岗位标识 | 首选实际执行者 | 原生 GPT/Claude Key |
| --- | --- | --- |
| GPT 总控/规划岗位 | DeepSeek；已明确拒绝时可用豆包 | 不读取、不使用 |
| Claude 审稿岗位 | 豆包；允许时用 DeepSeek | 不读取、不使用 |

每次回执都保留 requested_agent、executed_by、API 返回的实际 model 与 model_source。API 未返回 model 时明确标记 requested_model，不伪造响应型号。不能把国内输出签成“原生 Claude/GPT 已执行”，不能改写以前真正由 Claude 写的审稿归属。

首轮作者和审核者必须是不同实际提供者，且不能是同一实际模型（包括带日期的同款别名）。如果 GPT 岗位实际用了豆包，Claude 岗位就排除豆包；不能靠换岗位名完成自审。没有独立可用模型就阻塞。

## 无需复制模型输出的入口

[国内执行席工单](https://github.com/ltzyz2181-collab/ltzzz/issues/new?template=owner-dispatch.yml)：

- 默认“仅登记：零模型调用”。
- 要实际工作时，选“执行：DeepSeek分析＋豆包交付”，岗位模式选“GPT/Claude岗位国内代执行”。
- 后台自动读六文件、交任务、保存全文和实际模型；没有要求 owner 往返搬运输出。
- 仅仓库 owner 提交可执行；先持久化 claim，再调用。已有单号不重购，输出截断/未知请求不盲目换模型。

普通工单仍按原来的国内岗位处理；只有明确选择代执行模式才记录 GPT/Claude 逻辑岗位。回执存 knowledge/results/owner-inbox/，不写入 Claude 本体的历史回执冒充本人参与。

## 费用、权限与旧材料

使用现有国内 Key/余额，不需要海外充值，但国内 API 也可能收费；金额未知时不编造。没有新增付费 cron，日常工作仍走既有国内调度。内部分工/积分不等于实际工资。

Claude 的默认登记模块改为国内代执行；原生 Anthropic 接口仅保留为可选的独立手动入口，不是本方案依赖。使用 API 兼容协议不等于使用 OpenAI/Anthropic 模型。

本方案不恢复五签、Safe、钱包签名、转账或部署权限。模型只产出草稿/审稿意见，由执行器代存，待验收。原网页聊天、zip、上下文不会自动搬进另一个模型；旧 Pulse zip 仍未取得，不能用新生成的代码冒充旧原件。
