# LTZZZ 云端任务中枢（Cloud Hub）

> 状态：架构+代码框架已就绪；Worker 部署待 Cloudflare 授权。
> 任务编号规范：LTZZZ-<任务域>-<序号>，如 LTZZZ-VID-0001。

## 1. 双向任务链

```
电脑 → LTZZZ(云端中枢) → 豆包执行 → GPT / DeepSeek / Claude / Grok → 结果回传
GPT / 其他AI → LTZZZ(云端中枢) → 豆包执行 → 电脑 → 结果回传
```

## 2. 统一结构（每条任务）

| 字段 | 说明 |
|---|---|
| task_id | 唯一 ID（LTZZZ-<域>-<序号>） |
| from / to | 发起方 / 执行方（电脑/豆包/GPT/DeepSeek/Claude/Grok） |
| type | 任务类型（video/文案/研究/代码/发布/支付/审批） |
| payload | 任务内容（不包含密钥） |
| status | queued → running → success / failed / waiting_approval / cancelled |
| retry | 失败重试次数（≤2），指数退避 |
| log | 执行日志（时间/步骤/结果/错误码） |
| result | 结果回传（URL/文件/摘要/数据） |
| budget | 关联预算账户与预计金额（可选） |

## 3. 队列与日志

- 队列：KV 或 SQLite（持久化），支持按域/状态过滤。
- 日志：`/home/user/ltzzz/tasks/logs/<task_id>.json` 或 Worker KV，统一 JSON。
- 失败重试：网络/临时错误自动重试 ≤2 次；业务/权限错误不重试，标记 waiting_approval 并记录原因。

## 4. 接口（Cloudflare Worker：ltzzz-cloud-hub）

| 接口 | 方法 | 说明 |
|---|---|---|
| /task/create | POST | 创建任务，返回 task_id |
| /task/status | POST | 查任务状态 |
| /task/list | POST | 队列列表（按状态/域） |
| /task/cancel | POST | 取消排队任务 |
| /task/result | POST | 执行方回传结果 |
| /health | GET | 存活检查 |

## 5. 安全

- 所有接口 Bearer Token 鉴权（Token 只存 Cloudflare Secret）。
- 任务内容与结果自动脱敏：正则掩码 API Key、私钥、助记词、手机号、卡号后再落日志/仓库。
- 敏感字段（密钥/凭证）永不写入任务 payload 与日志。
