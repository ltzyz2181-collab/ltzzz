# DeepSeek 代理（本地）

网站 `ai-chat.html` 不保存 API Key。请在本机或自有服务器运行代理。

## 步骤

1. 复制 `deepseek-proxy.example.js` 为 `deepseek-proxy.js`（不要把含 Key 的文件推到公开仓库）。
2. 设置环境变量：

```bash
export DEEPSEEK_API_KEY=你的key
# 可选
export DEEPSEEK_BASE_URL=https://api.deepseek.com
export PORT=8787
```

3. 启动：

```bash
node deepseek-proxy.js
```

4. 打开网站 `ai-chat.html`，代理地址填：`http://127.0.0.1:8787`

5. DeepSeek 账户需有余额，否则会返回 402 / Insufficient Balance。

Windows PowerShell 示例：

```powershell
$env:DEEPSEEK_API_KEY="你的key"
node deepseek-proxy.js
```
