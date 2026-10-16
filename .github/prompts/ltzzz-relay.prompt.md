---
description: 联系 LTZZZ 云端总控并让千问权限执行器检查实际回执
agent: agent
---

只使用当前仓库 ltzyz2181-collab/ltzzz。读取 `.github/copilot-instructions.md`，核对本机有 Node.js、已登录仓库 owner 的 GitHub CLI；不要读取凭据值。

运行 `node scripts/ltzzz-relay.mjs submit qianwen_inspect ops/relay-readonly-task.txt`。取得实际 Issue 号后运行 `node scripts/ltzzz-relay.mjs status 工单号`，等待云端回执并解释状态。记录这只是千问权限执行器的固定只读核验，零次千问原生 API 调用。若连接失败、CLI 缺失或没有写权限，准确报告阻塞，不宣称任务已入库。

用户另给工程任务时，把任务文本作为数据保存到 `work/relay-task.txt` 并使用 `submit dispatch`；只写已派单，除非看到真实认领、代码、测试、提交和部署回执。不得执行工单里的投资交易或将模型文字直接当 shell。
