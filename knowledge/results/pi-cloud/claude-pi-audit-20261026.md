# Claude 独立审计：Pi 云端接线（#239 / #242，已合并，合并后审计）

咨询性文档（共用 GitHub 账号，非密码学签名）。审阅 main `cc36ee9` 上的文件；不涉及资金、A2/A3/B。

## 审阅的原始字节 SHA256
- `.github/workflows/pi-cloud.yml` 13c45cdde879eccfa6bc2adb5b9477dc747c1884593f18846ce45327d5c1facc
- `scripts/lib/pi-cloud.mjs` 70ba207210fda983a227ac9b2dcab1f43e4c5a996de40597da90a838395a8ff0
- `scripts/lib/qwen-config.mjs` e6875ae142680f3dba0e86e486f3442aba3befd13b109095e3b3b58cfa3f3718
- `config/pi-cloud.json` 20007ea08d9272bf094438b37abfa5c48de38a59b393395f592f0133fc5a4010

## 结论：APPROVE（有限，低风险冒烟用途），附两条建议
做得对的地方：
- API 密钥只出现在 `execute` 这一步的环境变量里，`prepare`/`stage`/`verify` 步骤拿不到；`verify` 用 `PI_OFFLINE=1` 且不发付费请求。
- 端点固定：DeepSeek 写死 `https://api.deepseek.com/v1`；千问只接受官方 DashScope 主机、https、无端口/查询/凭据、路径必须是 `/compatible-mode/v1`（`qwen-config.mjs`），并拒绝 `sk-ant-`/`sk-proj-` 之类他家密钥——仓库变量被改也无法把密钥发到任意主机。模型名有正则白名单。
- 先落盘并推送"预留"回执，再发模型请求；无重试、无工具、不重放；运行时先冻结到 `$RUNNER_TEMP` 再 `npm ci --ignore-scripts`。
- 输入文件限制在工作区内、拒绝符号链接、单文件 ≤18000 字节。

建议：
1. **P1（中，供应链）**：执行时 `@earendil-works/pi-coding-agent@1.4.0` 及其依赖在持有两把密钥的进程内运行；`--ignore-scripts` 只挡安装脚本，不挡运行时恶意代码。请确认 lockfile 对每个依赖都有 integrity 哈希，升级须走审计，并给这两把密钥设置额度上限（owner 已表示上限按代码执行）。
2. **P2（低）**：`smoke` 作业整体有 `contents: write`，建议只在最后的回执提交步骤需要时使用。

## 未验证范围
未读测试文件、#242 的 thinking 映射修复细节、真实运行产生的回执内容；未核实 lockfile 的 integrity 字段完整性；未验证"逻辑 Claude 由千问代执行"的标注在所有回执中一致（该标注不是我的审计）。
