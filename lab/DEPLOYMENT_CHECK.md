# LTZZZ 部署核查

最后核查：2026-09-17

## 1. GitHub / Pages

- 仓库：`ltzyz2181-collab/ltzzz`
- 默认分支：`main`
- 当前仓库可写、主分支存在。
- 最近已入库的 LTZZZ Lab 结构包括 `MEMORY.md`、`DECISIONS.md`、`tasks.md`、`CAPABILITY_MAP.md`、`ASSETS.md`、`experiments/_template.md`。
- 首页实验室入口任务记录为：`https://ltzzz.com/lab.html`。

## 2. DeepSeek Worker

- 已有 Worker 地址记录：`https://ltzzz-deepseek-proxy.ltzyz2181.workers.dev`
- 历史实验结论：Worker HTTP 200，Key 仅放 Worker Secret。
- 本次核查：代码与文档侧可确认“已入库/已有历史实测”；当前执行环境无法直接访问该线上 Worker，因此本次不重新宣称实时 HTTP 验证。

## 3. Doubao Worker

- 代码侧最近修复已进入仓库：
  - `f6466a4dfd2c6138eb594f5e6a29ed9776594cf5`：增加 `/health` 与配置错误诊断
  - `c7bb2f22f695e7869bdf8bd2a478f5e4817b18d0`：由 Worker 的 `DOUBAO_MODEL` 控制模型，并增加健康检查 UI
- 当前仍需主人在 Cloudflare Worker 确认：`ARK_API_KEY` Secret、`DOUBAO_MODEL` 变量，以及线上 `/health` 实测。
- 验收标准：`/health` 返回 `ok:true`、配置状态正常；再做一次真实模型请求。
- 在完成线上实测前，任务状态保持“进行”，不能写成“完成”。

## 4. 本次 Lab 核查结论

- Lab 骨架：已存在并已补强固定读取顺序、长任务交接协议、部署验证规则。
- 资产登记：已存在。
- 任务池：已存在；T003 继续保持“进行”。
- 线上部署：区分“代码已进入 main”和“线上端点已实测”，不混为一谈。

## 5. 下一步

1. 主人完成 Doubao Worker 的 Cloudflare Secret/变量确认。
2. 打开 Doubao `/health` 做线上核验。
3. 再做一次真实请求；成功后把 HTTP 结果写入对应实验卡并将 T003 改为完成。
4. 以后所有部署均按本文件的“代码入库 → 线上健康检查 → 真实业务请求 → 资产登记”四步验收。
