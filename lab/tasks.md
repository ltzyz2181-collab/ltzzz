# LTZZZ 任务池

状态：`待办` | `进行` | `完成` | `关闭`  
改状态必须保留一行简短结果或链接；AI 只能提议，不能擅自结案。

---

## 进行中

| ID | 任务 | 角色建议 | 验收 |
|----|------|----------|------|
| T001 | 维护 lab/ 记忆与任务 | 主人 + 各 AI | 事实源结构稳定，长任务按 README 交接 |
| T003 | 豆包 Worker 部署与联调 | **主人部署**；AI 协助排错 | Cloudflare 配置正确；`/health` 正常；真实模型请求成功并记录结果 |

## 待办

| ID | 任务 | 角色建议 | 验收 |
|----|------|----------|------|
| T002 | 主人审阅 MEMORY.md | 主人 | 事实准确 |
| T004 | 视频立项确认主方向 | 主人 | 写入 DECISIONS |
| T006 | 更多实验卡 | 各 AI | `experiments/` 有结果卡 |
| T007 | 确认公益收款地址 | 主人 | MEMORY 更新 |
| T009 | 复核全部线上 Worker | 主人 + 各 AI | 按 `DEPLOYMENT_CHECK.md` 完成健康检查 + 真实请求 |

## 完成

| ID | 任务 | 结果 |
|----|------|------|
| T000 | DeepSeek Worker | 历史实测 HTTP 200 |
| T005 | 首页实验室入口 | `https://ltzzz.com/lab.html` |
| T008 | 豆包 Worker 前端去除旧模型硬编码 | 前端留空时由 Worker 的 `DOUBAO_MODEL` 决定 |
| T010 | Lab 内核骨架 | MEMORY / DECISIONS / tasks / CAPABILITY_MAP / ASSETS / 实验模板均已入库 |

## 关闭

| ID | 任务 | 原因 |
|----|------|------|
| — | — | — |
