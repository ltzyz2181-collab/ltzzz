/**
 * LTZZZ roundtable proxy (template)
 * - Holds API keys in process.env only
 * - Does NOT custody funds or private keys
 * - Default: sequential chat completions for selected seats
 */
const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const CORS = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
const LAB_TOKEN = process.env.LAB_TOKEN || '';

const SYSTEM = `你是 LTZZZ AGI 共管理协议下的顾问席。
无服务器所有权，无资金托管权。
只做分析与简短建议；禁止要求转账、索要密钥、宣称接管后台。`;

function cors(res, origin) {
  const allow = CORS.includes('*') || (origin && CORS.includes(origin)) ? (origin || '*') : CORS[0];
  res.setHeader('Access-Control-Allow-Origin', allow || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Lab-Token');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function callOpenAICompatible(base, key, model, userText) {
  if (!key) return { ok: false, text: '未配置 API Key' };
  const r = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userText }
      ],
      temperature: 0.4
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, text: JSON.stringify(j).slice(0, 500) };
  const text = j.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 300);
  return { ok: true, text };
}

async function callAnthropic(key, model, userText) {
  if (!key) return { ok: false, text: '未配置 API Key' };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-5',
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: 'user', content: userText }]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, text: JSON.stringify(j).slice(0, 500) };
  const text = (j.content || []).map(p => p.text || '').join('') || JSON.stringify(j).slice(0, 300);
  return { ok: true, text };
}

const SEAT_CALL = {
  gpt: () => callOpenAICompatible('https://api.openai.com/v1', process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || 'gpt-4o-mini', arguments[0]),
  deepseek: (t) => callOpenAICompatible('https://api.deepseek.com/v1', process.env.DEEPSEEK_API_KEY, process.env.DEEPSEEK_MODEL || 'deepseek-chat', t),
  doubao: (t) => callOpenAICompatible(process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3', process.env.DOUBAO_API_KEY, process.env.DOUBAO_MODEL, t),
  grok: (t) => callOpenAICompatible('https://api.x.ai/v1', process.env.XAI_API_KEY, process.env.XAI_MODEL || 'grok-3', t),
  claude: (t) => callAnthropic(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL, t)
};

// fix gpt binding
SEAT_CALL.gpt = (t) => callOpenAICompatible('https://api.openai.com/v1', process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || 'gpt-4o-mini', t);

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  cors(res, origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && u.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'ltzzz-roundtable',
      protocol: 'AGI-CO-MANAGEMENT v0.1',
      custody: false,
      seats_configured: {
        gpt: Boolean(process.env.OPENAI_API_KEY),
        claude: Boolean(process.env.ANTHROPIC_API_KEY),
        deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
        doubao: Boolean(process.env.DOUBAO_API_KEY),
        grok: Boolean(process.env.XAI_API_KEY)
      }
    }));
    return;
  }

  if (req.method === 'POST' && u.pathname === '/round') {
    if (LAB_TOKEN && req.headers['x-lab-token'] !== LAB_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    try {
      const body = await readBody(req);
      const text = (body.text || '').trim();
      const seats = Array.isArray(body.seats) ? body.seats : ['gpt', 'claude'];
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'text required' }));
        return;
      }
      const replies = [];
      for (const seat of seats) {
        const fn = SEAT_CALL[seat];
        if (!fn) {
          replies.push({ seat, ok: false, text: 'unknown seat' });
          continue;
        }
        const out = await fn(text);
        replies.push({ seat, ...out });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        protocol: 'AGI-CO-MANAGEMENT v0.1',
        note: '顾问席回复；无资金动作',
        replies
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`ltzzz-roundtable on :${PORT} · no fund custody`);
});
