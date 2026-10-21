# 千问审计与 Actions 实调验收的交接规则

类型：总控执行决定及证据索引。来源：owner转交千问审计并要求处理、部署。仓库仅`ltzyz2181-collab/ltzzz`。

## 职责与凭证

采用第3种方案：**Actions持现有凭证执行，千问读文件与回执独审**。不给千问对话/沙箱复制服务令牌或模型Key，不恢复匿名付费推理。千问仍保留独立审计、备援及代行总控的岗位权限；其原生日课继续由既有Actions任务持Key执行，不能与外部千问审计会话混为一谈。

日课和已授权验收负责真实生成。原`Key Liveness Probe`每日时间保留，改为收集真实生成的代码回执、验证工件与输出哈希，并用现有服务令牌做固定端点`GET /auth/check`。日课/补做/部署结束也会刷新索引；不新建付费试调，不再每天ping已停用的OpenAI/Anthropic。健康、鉴权、真实生成、交付验收、部署分别记，缺证据或过期不宣称恢复。

唯一巡检入口：[credentialed-audit/latest.json](../knowledge/results/credentialed-audit/latest.json)。每次运行另保留`<run_id>-<attempt>.json`及Actions artifact。执行事实含实际提供商、提供商返回型号、UTC时间、输出SHA-256、原始回执路径和新鲜度。未观察到HTTP时保留null；正文自报型号不采信。已有Kimi回执只是历史工件审核，不冒充新HTTP契约测试。

## 共用GitHub账号的归属边界

`ltzyz2181-collab`提交PR只能证明仓库写入链路，不能证明原生Claude产出。外部材料记录`author_provider:null`、`reported_author_provider:Anthropic`、`author_provider_verified:false`和GitHub提交账号；未拿到执行证据前，不升级为已核验提供商。

已核实的[四份PR归属说明](../knowledge/results/identity/claude-shared-account-attribution-20261021.json)保留GitHub原始账号与提交SHA，区分Claude原始自报和总控追加工程修订。Claude观察/规划/独审岗位不因此停用。内部Claude逻辑岗位的任务若由DeepSeek做工、豆包审核，回执顶层及跟进字段都写实际提供商，不写“Claude原生调用”。

## 七项复议的处置

| 项 | 已核实与后续验收 |
|---|---|
| 千问实调能力 | 按上述分工由Actions执行，千问审计公开回执；不把没有共享Token记成模型宕机 |
| #170及P0 | #170已于2026-10-21T07:08:27Z合并；它是规划复核文档。实际鉴权代码经#172/#173合并后部署，不存在“未合并#170代码被生产执行”的证据 |
| 豆包超时 | #175/#177/#178已修复并部署，39559504877实际Pro正常补交。原超时保留；`api-doubao`别名仍未配置，不阻断现有workers.dev日课路径 |
| Claude域名 | 自定义别名与原厂额度继续待办；免费外部仓库工作有效，不能由域名失败判定岗位停用 |
| model_configured | v2区分代码默认配置、显式环境覆盖及自动目录选型；模型名无需作为Secret。字段不证明生成、额度或输出质量 |
| 哨兵落盘率 | Actions用内置限仓库Token读取运行/步骤状态，留[sentinel-coverage/latest.json](../knowledge/results/dispatch/sentinel-coverage/latest.json)。扫描/落盘故障与业务告警分开。旧小时文件会覆盖，不能用25/理论120推出21%落盘率 |
| 拒收理由 | [real-hire-20261021.json](../knowledge/results/claude-team/real-hire-20261021.json)已有9条理由：主要为不存在的release_task、错误本地存储路径及不足的验证命令。实际作者DeepSeek、复核豆包；拒收及零USDC付款不改为验收成功 |

哨兵新增逐run/attempt回执，业务阻塞保留明确告警；只有扫描、测试或落盘执行失败才使相应执行步骤失败。覆盖率只报告已观察运行和已查步骤的样本范围，权限不足、分页未完及缺失样本均明说。下一次定时是否执行仍以新回执验收。

本轮不购买外部订单、不投资、不动钱包、不恢复GPT/Claude付费日课。域名补权仍需现有Cloudflare账户可用权限；不把本次元数据和巡检部署写成域名修好。
