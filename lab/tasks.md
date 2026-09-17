# LTZZZ 任务池

状态：`待办` | `进行` | `完成` | `关闭`

> 规则：AI 只提议；任务由人改变最终状态。标记完成必须写实际结果 + 资产路径 + 下一步/关闭理由。

---

## 进行中
| ID | 任务 | 角色建议 | 验收 |
|---|---|---|---|
| T001 | 维护 lab/ 记忆、任务与实验卡 | GPT 总控 + 各 AI | 每次长任务可交接、可追溯 |
| T003 | 豆包方舟 API + Cloudflare Worker | 主人部署；DeepSeek/Grok 协助排错 | agents 页真实返回模型回复且 Key 不在前端 |

## 待办
| ID | 任务 | 角色建议 | 验收 |
|---|---|---|---|
| T002 | 主人审阅 MEMORY.md 事实 | 主人 | 日期、链路、公开信息准确 |
| T004 | 视频立项确认主方向 | 主人；GPT 汇总 | 决策写入 DECISIONS.md |
| T005 | AGI / 首页增加 lab 入口 | GPT/任意 AI 提议；主人确认 | 访客可进入实验室说明 |
| T007 | 确认公益收款地址仍由本人控制 | 主人 | 写入确认日期与结果；不记录密钥 |

## 完成
| ID | 任务 | 实际结果 | 资产 |
|---|---|---|---|
| T000 | DeepSeek Worker 端到端 | HTTP 200；Key 在 Worker Secret | `lab/experiments/EXP-001-deepseek-worker.md` |
| T006 | 首批实验卡骨架与 3 条历史实验 | 已写入 DeepSeek、钱包只读、错网络三张实验卡 | `lab/experiments/` |
| T008 | LTZZZ Lab 骨架 | MEMORY / DECISIONS / tasks / capability / template 已落库 | `lab/` |
| T009 | 资产登记表 | 代码、网站、文档资产建立索引 | `lab/ASSETS.md` |

## 关闭
| ID | 任务 | 原因 |
|---|---|---|
| — | — | — |
