# 豆包辅助执行单：部署验收清单

类型：派单事实，不是交付回执。

- Task ID: `DOUBAO-IDENTITY-CLOSEOUT-20261021`
- 状态：assigned_waiting_native_execution
- 目标：根据本轮真实部署回执，交一张完整验收清单与阻塞交接。
- 输入：`knowledge/results/identity/provider-execution-<本轮run_id>.json`
- 输出：`knowledge/results/dispatch/DOUBAO-IDENTITY-CLOSEOUT-20261021.json`
- 执行：现有原生豆包Key，一次固定派单；GitHub Actions执行已经过代码审核的部署。模型本身不持有部署凭证。
- 验收：正常结束、正文完整、配置与真实生成分开、阻塞可追溯；由总控复核。不得自称已经部署/支付/发布。
- 禁止：重复调用同一任务、替其他AI接单、请求密钥、从模型自述认定身份。模型调用失败必须保留，不能改成成功。

这是一次已授权辅助任务，未增加付费cron；真正执行状态只看上述结构化回执，不把本派单本身算完成。
