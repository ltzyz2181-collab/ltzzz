// LTZZZ · Multi-Agent Orchestrator（多 Agent 编排 Worker）
// 职责：总控(ChatGPT) 规划 → 并行调用专家席（豆包 / DeepSeek / Grok / Claude）→ 总控汇总
//
// 安全约束（本仓库约定）：
//   1. 所有 API Key 只从 Worker 环境变量（wrangler secret）读取，绝不下发到浏览器。
//   2. 本 Worker 不持有资金、不托管密钥之外任何敏感数据。
//   3. 未配置 Key 的席位返回明确的“接口位保留”状态，不假装已实现。
//
// 部署（Cloudflare Workers）：
//   npx wrangler deploy agent-orchestrator-worker.js --name ltzzz-agent-orchestrator
//   npx wrangler secret put DEEPSEEK_API_KEY
//   npx wrangler secret put DOUBAO_AGENT_PLAN_API_KEY
//   可选: npx wrangler secret put OPENAI_API_KEY / ANTHROPIC_API_KEY / XAI_API_KEY
//
// 豆包走 Agent Plan 专属 Key（Anthropic 兼容端点）：
//   DOUBAO_BASE_URL           默认 https://ark.cn-beijing.volces.com/api/plan
//   DOUBAO_AGENT_PLAN_API_KEY Agent Plan 专属 Key（不是普通方舟 Key）
//   DOUBAO_MODEL              默认 doubao-seed-evolving

const DEFAULT_DOUBAO_BASE = 'https://ark.cn-beijing.volces.com/api/plan';
const DEFAULT_DOUBAO_MODEL = 'doubao-seed-evolving';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5';
const DEFAULT_XAI_MODEL = 'grok-3';

const EXPERT_SYSTEM = {
  doubao: '你是 LTZZZ 数字实验室的「豆包专家席」，侧重执行与工程落地。回答要具体、可验证、少空话。',
  deepseek: '你是 LTZZZ 数字实验室的「DeepSeek 专家席」，侧重研究与分析。回答要具体、可验证、少空话。',
  grok: '你是 LTZZZ 数字实验室的「Grok 专家席」，侧重实时信息与海外视角。无法联网时明确说明，不编造。',
  claude: '你是 LTZZZ 数字实验室的「Claude 专家席」，侧重长文结构与代码审查。回答要具体、可验证。'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/orchestrate') {
      return json({ error: 'POST /orchestrate only' }, 404);
    }

    try {
      const body = await request.json();
      const question = String(body.question || '').trim();
      if (!question) return json({ error: 'question is required' }, 400);

      // 1. 总控规划：配置了 OPENAI_API_KEY 用 ChatGPT，否则用内置确定性路由（不假装已接总控模型）
      const plan = await makePlan(env, question);

      // 2. 专家并行执行；单个席位失败不影响其他席位
      const replies = await Promise.all(plan.tasks.map(async (t) => {
        try {
          return await runExpert(env, t.agent, t.focus || question);
        } catch (e) {
          return { agent: t.agent, ok: false, error: String(e.message || e) };
        }
      }));

      // 3. 总控汇总：配置了 OPENAI_API_KEY 用 ChatGPT 汇总，否则内置汇总
      const summary = await makeSummary(env, question, plan, replies);

      return json({
        ok: true,
        question,
        plan,
        replies,
        summary,
        note: 'Key 仅存于 Worker 环境变量；本服务无资金动作'
      });
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  }
};

// ---------- 总控规划 ----------
async function makePlan(env, question) {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    return {
      source: 'builtin-router',
      summary: `未配置总控模型（OPENAI_API_KEY），使用内置确定性路由拆分任务：${question}`,
      tasks: [
        { agent: 'doubao', focus: `执行与工程视角：${question}` },
        { agent: 'deepseek', focus: `研究与分析视角：${question}` },
        { agent: 'grok', focus: `实时信息与海外视角：${question}` },
        { agent: 'claude', focus: `长文结构与代码审查视角：${question}` }
      ]
    };
  }

  const sys = `你是 LTZZZ 数字实验室的总控 Agent（ChatGPT）。你的任务是把用户问题拆成 4 个子任务，分别交给 4 个专家席：
豆包(doubao)=执行/工程、DeepSeek(deepseek)=研究/分析、Grok(grok)=实时/海外、Claude(claude)=长文/代码审查。
只输出严格 JSON（不要 markdown 代码块），格式：
{"summary":"一句话总体判断","tasks":[{"agent":"doubao","focus":"给豆包的子任务"},{"agent":"deepseek","focus":"给DeepSeek的子任务"},{"agent":"grok","focus":"给Grok的子任务"},{"agent":"claude","focus":"给Claude的子任务"}]}`;

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      temperature: 0.3,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: question }
      ]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return {
      source: 'builtin-router',
      summary: `总控模型调用失败（${shortError(j)}），回退到内置确定性路由：${question}`,
      tasks: [
        { agent: 'doubao', focus: `执行与工程视角：${question}` },
        { agent: 'deepseek', focus: `研究与分析视角：${question}` },
        { agent: 'grok', focus: `实时信息与海外视角：${question}` },
        { agent: 'claude', focus: `长文结构与代码审查视角：${question}` }
      ]
    };
  }
  const raw = j.choices?.[0]?.message?.content || '';
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.filter((t) => t && t.agent && t.focus).slice(0, 4)
      : [];
    if (!tasks.length) throw new Error('no tasks');
    return { source: 'chatgpt', summary: String(parsed.summary || '').slice(0, 600), tasks };
  } catch (e) {
    return {
      source: 'builtin-router',
      summary: `总控返回无法解析，回退到内置路由：${question}`,
      tasks: [
        { agent: 'doubao', focus: `执行与工程视角：${question}` },
        { agent: 'deepseek', focus: `研究与分析视角：${question}` },
        { agent: 'grok', focus: `实时信息与海外视角：${question}` },
        { agent: 'claude', focus: `长文结构与代码审查视角：${question}` }
      ]
    };
  }
}

// ---------- 专家席位 ----------
async function runExpert(env, agent, task) {
  switch (agent) {
    case 'doubao':
      return callDoubao(env, task);
    case 'deepseek':
      return callDeepSeek(env, task);
    case 'grok':
      return callGrok(env, task);
    case 'claude':
      return callClaude(env, task);
    default:
      return { agent, ok: false, stub: true, error: '未知席位: ' + agent };
  }
}

// 豆包：Agent Plan 专属 Key，Anthropic 兼容端点 /v1/messages
async function callDoubao(env, task) {
  const key = env.DOUBAO_AGENT_PLAN_API_KEY;
  if (!key) return stubReply('doubao', '未配置 DOUBAO_AGENT_PLAN_API_KEY（接口位已保留）');
  const base = (env.DOUBAO_BASE_URL || DEFAULT_DOUBAO_BASE).replace(/\/$/, '');
  const model = env.DOUBAO_MODEL || DEFAULT_DOUBAO_MODEL;
  const r = await fetch(base + '/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'Authorization': 'Bearer ' + key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: EXPERT_SYSTEM.doubao,
      messages: [{ role: 'user', content: task }]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { agent: 'doubao', ok: false, model, error: shortError(j) };
  const text = (j.content || [])
    .filter((p) => p && p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('') || JSON.stringify(j).slice(0, 300);
  return { agent: 'doubao', ok: true, model, text };
}

// DeepSeek：OpenAI 兼容端点 /chat/completions
async function callDeepSeek(env, task) {
  const key = env.DEEPSEEK_API_KEY;
  if (!key) return stubReply('deepseek', '未配置 DEEPSEEK_API_KEY');
  const model = env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: EXPERT_SYSTEM.deepseek },
        { role: 'user', content: task }
      ],
      temperature: 0.4,
      max_tokens: 1200,
      stream: false
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { agent: 'deepseek', ok: false, model, error: shortError(j) };
  const text = j.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 300);
  return { agent: 'deepseek', ok: true, model, text };
}

// Grok：xAI OpenAI 兼容端点；未配置 Key 时保留接口位
async function callGrok(env, task) {
  const key = env.XAI_API_KEY;
  if (!key) return stubReply('grok', '未配置 XAI_API_KEY（接口位已保留）');
  const model = env.XAI_MODEL || DEFAULT_XAI_MODEL;
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: EXPERT_SYSTEM.grok },
        { role: 'user', content: task }
      ],
      temperature: 0.4,
      max_tokens: 1200
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { agent: 'grok', ok: false, model, error: shortError(j) };
  const text = j.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 300);
  return { agent: 'grok', ok: true, model, text };
}

// Claude：Anthropic Messages API；未配置 Key 时保留接口位
async function callClaude(env, task) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return stubReply('claude', '未配置 ANTHROPIC_API_KEY（接口位已保留）');
  const model = env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: EXPERT_SYSTEM.claude,
      messages: [{ role: 'user', content: task }]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { agent: 'claude', ok: false, model, error: shortError(j) };
  const text = (j.content || [])
    .filter((p) => p && p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('') || JSON.stringify(j).slice(0, 300);
  return { agent: 'claude', ok: true, model, text };
}

// ---------- 总控汇总 ----------
async function makeSummary(env, question, plan, replies) {
  const key = env.OPENAI_API_KEY;
  const done = replies.filter((r) => r && r.ok);
  if (!key) {
    const lines = replies.map((r) => {
      const seatName = r.agent || '?';
      if (r.ok) return `【${seatName}】${String(r.text || '').slice(0, 300)}`;
      if (r.stub) return `【${seatName}】${r.error || '接口位保留'}`;
      return `【${seatName}】调用失败：${r.error || '未知错误'}`;
    });
    return {
      source: 'builtin-summary',
      text: `已收集 ${done.length}/${replies.length} 个专家回复（未配置总控模型，使用内置汇总）：\n\n` + lines.join('\n\n')
    };
  }

  const blocks = replies.map((r) => {
    const name = r.agent || '?';
    const body = r.ok ? (r.text || '') : (r.stub ? `[接口位保留] ${r.error || ''}` : `[失败] ${r.error || ''}`);
    return `<${name}>${body}</${name}>`;
  }).join('\n');

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: '你是 LTZZZ 数字实验室的总控 Agent。请把各专家席的回复汇总成一份简洁、可执行的结论（中文，500 字以内）。如果某个席位未接入，明确说明。'
        },
        {
          role: 'user',
          content: `原始问题：${question}\n\n各专家回复：\n${blocks}`
        }
      ]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { source: 'chatgpt', text: `总控汇总失败：${shortError(j)}` };
  const text = j.choices?.[0]?.message?.content || '（总控未返回可读内容）';
  return { source: 'chatgpt', text };
}

// ---------- 工具函数 ----------
function stubReply(agent, error) {
  return { agent, ok: false, stub: true, error };
}
function shortError(j) {
  const msg = j?.error?.message || j?.error || j?.message || JSON.stringify(j);
  return String(msg).slice(0, 400);
}
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}
