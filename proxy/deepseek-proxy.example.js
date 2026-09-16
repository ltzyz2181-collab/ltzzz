/**
 * DeepSeek 本地代理示例（OpenAI 兼容）
 * 用法：
 *   1. 复制为 deepseek-proxy.js（不要提交含真实 Key 的文件到公开仓库）
 *   2. 设置环境变量 DEEPSEEK_API_KEY
 *   3. node deepseek-proxy.js
 *   4. 网站 ai-chat.html 里把代理地址填 http://127.0.0.1:8787
 *
 * 依赖：Node 18+（内置 fetch）
 */
const http = require('http');
const PORT = process.env.PORT || 8787;
const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const UPSTREAM = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

if (!API_KEY) {
  console.error('请设置环境变量 DEEPSEEK_API_KEY');
  process.exit(1);
}

function send(res, status, body, extraHeaders) {
  const headers = Object.assign({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  }, extraHeaders || {});
  res.writeHead(status, headers);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 204, '');
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    return send(res, 200, { ok: true, service: 'deepseek-proxy' });
  }

  if (req.method === 'POST' && req.url && req.url.startsWith('/v1/chat/completions')) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let payload;
    try {
      payload = JSON.parse(raw || '{}');
    } catch (e) {
      return send(res, 400, { error: { message: 'invalid json' } });
    }

    try {
      const upstream = await fetch(UPSTREAM.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + API_KEY
        },
        body: JSON.stringify(payload)
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(text);
    } catch (e) {
      send(res, 502, { error: { message: String(e.message || e) } });
    }
    return;
  }

  send(res, 404, { error: { message: 'not found' } });
});

server.listen(PORT, () => {
  console.log('DeepSeek proxy listening on http://127.0.0.1:' + PORT);
  console.log('Health: GET /health');
  console.log('Chat: POST /v1/chat/completions');
});
