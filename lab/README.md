# LTZZZ Lab

**观 → 行深 → 实验 → 结果**

这里是 LTZZZ 的长期记忆、任务池、能力地图与实验资产入口，也是 AI 长任务的固定事实源入口。

## AI 开始任务前：固定读取顺序

1. `MEMORY.md` — 当前事实、已验证链路、已知坑
2. `DECISIONS.md` — 已拍板结论；没有新决策不要擅自改方向
3. `tasks.md` — 当前任务状态；AI 只能建议，不擅自结案
4. `CAPABILITY_MAP.md` — 分工、权限与禁区
5. `ASSETS.md` — 代码、页面、部署结果等资产索引
6. `experiments/` — 需要复用历史实验时再读对应实验卡

## 核心文件
- [MEMORY.md](./MEMORY.md) — 长期事实与已知坑
- [DECISIONS.md](./DECISIONS.md) — 已拍板决策
- [tasks.md](./tasks.md) — 当前任务池
- [CAPABILITY_MAP.md](./CAPABILITY_MAP.md) — AI 分工与禁区
- [ASSETS.md](./ASSETS.md) — 资产登记
- [experiments/](./experiments/) — 可引用实验卡
- [DEPLOYMENT_CHECK.md](./DEPLOYMENT_CHECK.md) — 部署核查记录

## 长任务交接协议

每次长任务结束必须留下四项：

- 本次变更：改了什么文件 / 部署了什么 / 实测了什么
- 未完成：仍缺什么外部操作或验证
- 下一步：下一次先做哪一个动作
- 建议写入记忆：最多 3 条，明确属于 MEMORY 还是 DECISIONS

## 完成定义

任何“完成”都必须能回到一个结果和一个资产路径。失败同样是资产：记录错误、原因、修正和以后如何避免。

外部部署若当前环境无法访问线上端点，只能标记为“代码已入 main / 待线上核验”，不得写成“线上已验证”。

## 协作原则
AI 负责读取、分析、提议和整理；人负责最终合并、部署、域名、资金与密钥。

## 海外线
LTZZZ Lab 的英文内容以可验证实验和失败复盘为主，与中文实验室共享同一事实源。
