# 千问原生日课接入与每月模型检查

类型：事实／工程验收入口；配置就绪不代替真实调用或正式日课交付。

更新：[PR #143](https://github.com/ltzyz2181-collab/ltzzz/pull/143) 已合并并完成生产验证。147项本地相关测试通过；Pulse实际部署运行39188114435成功，任务板schema3已保存千问独立日课任务。[真实API验收39188198716](https://github.com/ltzyz2181-collab/ltzzz/actions/runs/39188198716)成功：`qwen-plus`、正常stop、96tokens，原始回执在 `knowledge/results/providers/probes/QWEN-KEY-ACCEPTANCE-20261018.json`。[收尾证据](../../knowledge/results/providers/qianwen-deployment-closeout-20261018.json)。首个正式日课和50元充值仍待分别验收。

## 已定位原因

本轮接手时，GitHub 日课只有 DeepSeek、豆包、Grok 三通道，千问配置为外部回归席；`QWEN_API_KEY` 仅登记在现有 Cloudflare Worker，未注入 GitHub 日课。缺少调用模块、环境注入和调用预留，不能简单归因于模型名错误。owner 所贴示例的 `Bearer {apiKey}`、`HTTP {resp.status}` 也缺少模板插值，不能原样部署。整段旧 CHANNELS 会恢复 owner 停用的 OpenAI/Microsoft 调用，本次未采用。

附件 Key 是百炼 `sk-ws-` 新版业务空间格式。阿里云官方说明新版与旧版调用能力一致：[API Key 升级说明](https://help.aliyun.com/en/model-studio/get-api-key)。格式匹配不能证明有效、余额或地域正确。浏览器已实际创建本仓库 Secret `DASHSCOPE_API_KEY` 并看到成功提示；值未写入仓库。仅使用百炼官方域名，兼容旧同提供商别名 `QWEN_API_KEY`；不借用其他模型 Key。

## 运行方式

- 复用 `daily-agent-tasks.yml` 原有北京 **06:00 主跑、14:00 兜底**，GitHub 可能延迟；不是示例声称的固定08:00。本次不新增第二个付费日课 cron。
- 默认 `qwen-plus`，可由 `DASHSCOPE_MODEL` 覆盖。它是配置别名，不声称是最新发布或最高档。完整地区/业务空间 Base URL 可由 `DASHSCOPE_BASE_URL` 指定，限定百炼官方地址；新版工作空间域名受支持。
- 认证认领专属 `DAILY-日期-qianwen`，预留先落库，再调用一次。千问排在三个既有席位后，实际读取本轮其他输出、状态和实物哈希；不读取自己作为独立复核材料。
- 新调用结果按真实模型字段、`finish_reason`、token 用量、请求 ID 保存，空输出／截断／鉴权／欠费／限流／网络未知分别记录；无自动跨提供商回退或不确定结果重购。
- Pulse 任务目录升级为 schema3，补入千问日课任务并保留旧认领。现有代理机器人 Key、钱包、五签与发布流程未改。
- 日课写入 `data/memory/qianwen.json`、当日 `data/results/` 和 `knowledge/results/daily-board/`；提交仍待验收，内部积分与实际付款分开。
- 当天结果已经存在时不重跑其他三个席位。接入后首个正式千问日课要以新日期的实际回执确认，不能用验收探针替代。

## 真实 API 验收

在既有 `provider-readiness.yml` 手动选择 `qwen_probe=true`，单号 `QWEN-KEY-ACCEPTANCE-20261018`。先提交预留，再最多发一次128输出token请求，保存至 `knowledge/results/providers/probes/`；同单重复触发不再调用。真实模型按接口实际响应记录。失败若需修复后再验收，要明确新单号及修复原因，不能自动循环重试。

`generation_verified` 表示探针是否真实得到完整答复；这是 API 连接验收，不是正式日课、工程上线或真钱结算。`paid=false / tx_hash=null` 指没有链上工资／转账；模型可能消耗百炼额度，费用以供应商账单为准。

## 月度检查与责任

复用原 `provider-readiness.yml`，每月1日北京09:17自动查询千问、DeepSeek、豆包、国内Kimi、国际Kimi、Grok的 `/models`；保留既有 DeepSeek/国内Kimi余额查询。未配国际 Key 时如实写缺配置，不用未分类的旧 Key 跨区猜测。停用的 OpenAI、Microsoft、Anthropic 不发原厂请求。

保存 `catalogue-latest.json`、`monthly-YYYY-MM.json` 与运行号回执。比较增删和当前配置型号是否出现在目录；分页/网络失败不宣布型号被删除，首次观察不宣布发现更新，不按字符串排序推断发布时间，不自动换模型或购买套餐。**零生成调用**；只有明确的手动验收输入可进入128token探针分支。

千问在既有日课内读目录变更并提出升级建议，Claude 可用时独立审计；不会为月检新增原厂 Claude/GPT API 调用。充值百炼可用于项目 API，不能替千问桌面产品会员或免费聊天客户端充值。

## 付款与未完成项

owner 提出充值50元，官方百炼登录入口已打开；登录、账户余额和实际支付结果必须在原页面回读，未确认前不标记已充值。模型目录200只证明查询成功，Secret存在只证明已保存；真实生成和首个正式日课分别验收。
