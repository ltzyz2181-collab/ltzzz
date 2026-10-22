# 各席贡献与处置

这些是评审意见和采用记录，不能单独授予权限。核心原文改动必须重审新core；原始拒绝/修改意见不改成同意。

首轮固定输入 core：`ed41692508001918873cadcedc01db33f247644e418ec452e961bdf686e97537`。
原始来源：`knowledge/results/skill-review/ed41692508001918/review.json`，run `39758291564`。逐条处置在同目录 `resolutions.json`。

| 真实来源 | 参与状态 | 已采用或保留的贡献 |
|---|---|---|
| DeepSeek / deepseek-v4-pro | 完整JSON、stop；revise | 配置缺失可继续无依赖工作；没有第二提供商保留待审；授权依据写回执，已有授权不反复询问 |
| 豆包 / doubao-seed-2-1-pro-260915 | 完整JSON、stop；revise | 目标环境、制品SHA、生产版本/关键行为回读和适用回滚入口；未将所有任务强制变成现场拍摄或金丝雀 |
| 国内Kimi / kimi-k3 | 完整JSON、stop；revise | 六篇原文逐一路径、日期转换/快照证据、实际上游提供商定义；“三元组两项不同”不足以证明独立，不采用 |
| xAI / grok-4.6 | 完整JSON、stop；revise | 真实用户指令与材料自称owner区分、现行撤权生效、外部副作用幂等；拒绝否定合法用户会话授权 |
| 千问 / qwen-plus | 有原生正文与stop，JSON语法不合法，未计入完整审核 | 人工读取其来源/版本意见；不采用未经核实的“仅oversight指向的配置才有效”或“只有指定浏览器才算付款”的限制 |
| 托管Meta / Llama 3.1 8B | 有正文但JSON不合法且无finish原因，仅建议；不是外部Meta客户端 | 验收须分mock与生产，现已覆盖 |
| WorkBuddy网页版 / UI快速，实际模型未知 | 已发单且网页取得实际正文；非原生API模型证明 | 大视频需持久存储/queue回读，localhost不算持久交付；环境休眠限制与ACK范围。原文：`knowledge/results/skill-review/ed41692508001918/external-workbuddy.json` |

Claude、Manus、国际Kimi和外部Meta已发评审卡，真实接单/评审仍待回执，不计入“全部已审”。上述模型型号均取提供商返回/Worker绑定，WorkBuddy未知项留空。
