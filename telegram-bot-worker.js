/**
 * LTZZZ Telegram Bot Worker
 * Secrets: TELEGRAM_BOT_TOKEN (required), TELEGRAM_SECRET (optional webhook secret)
 * Routes:
 *   GET  /health  /status  /setup-webhook  /webhook-info
 *   POST /webhook  /send
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    try {
      if ((path === '/status' || path === '/health') && request.method === 'GET') {
        const token = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : '';
        return json({
          ok: true,
          bot: 'ltzzz-telegram-bot',
          has_token: Boolean(token),
          token_len: token ? token.length : 0,
          token_prefix: token ? token.slice(0, 6) + '…' : null,
          has_secret: Boolean(env.TELEGRAM_SECRET),
          webhook_path: '/webhook',
          setup: '/setup-webhook',
          ts: Date.now(),
        });
      }

      if (path === '/setup-webhook' && request.method === 'GET') {
        return await setupWebhook(env);
      }

      if (path === '/webhook-info' && request.method === 'GET') {
        return await webhookInfo(env);
      }

      if (path === '/webhook' && request.method === 'POST') {
        return await handleWebhook(request, env);
      }

      if (path === '/send' && request.method === 'POST') {
        return await handleSend(request, env);
      }

      return json({ ok: false, error: 'not_found', path }, { status: 404, ...cors() });
    } catch (e) {
      return json(
        { ok: false, error: 'internal', detail: String(e && e.message || e) },
        { status: 500, ...cors() }
      );
    }
  },
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type,Authorization,X-Telegram-Bot-Api-Secret-Token',
  };
}

function json(obj, extra = {}) {
  const status = extra.status || 200;
  const headers = { 'Content-Type': 'application/json', ...cors(), ...extra };
  delete headers.status;
  return new Response(JSON.stringify(obj), { status, headers });
}

/* in-isolate state only (resets on cold start) */
const userState = new Map();

const WELCOME_TEXT = `👋 欢迎来到 LTZZZ AGI 实验室！

请选择您的身份：
1 人类
2 AI

直接回复数字 1 或 2，或回复「人类」/「AI」`;

const HUMAN_MENU = `👤 人类用户主菜单

1 会员中心
2 服务大厅
3 我的任务
4 我的结果
5 联系管理员

直接回复数字选择`;

const AI_MENU = `🤖 AI 用户主菜单

1 GPT (OpenAI)
2 DeepSeek
3 Claude
4 豆包
5 Grok (XAI)
6 Microsoft Copilot

请选择要接入的 AI（回复数字 1-6）`;

const AI_CHANNEL_DETAIL = {
  1: '🤖 GPT (OpenAI)\n· 网页入口：ai-chat.html',
  2: '🤖 DeepSeek\n· 网页入口：deepseek.html',
  3: '🤖 Claude\n· 网页入口：claude.html',
  4: '🤖 豆包\n· 网页入口：doubao.html',
  5: '🤖 Grok (XAI)\n· 知识库：knowledge/ai-chats/XIA/',
  6: '🤖 Microsoft Copilot\n· 知识库：knowledge/ai-chats/Microsoft/',
};

const MEMBER_MENU = `💎 会员中心

1 查看会员等级
2 会员权益说明
3 开通/续费会员
4 返回主菜单`;

const SERVICE_MENU = `🛠️ 服务大厅

1 AI 对话服务
2 内容生成服务
3 数据分析服务
4 定制开发服务
5 返回主菜单`;

const TASK_MENU = `📝 我的任务

1 提交新任务
2 查看进行中任务
3 查看历史任务
4 返回主菜单`;

const RESULT_MENU = `📊 我的结果

1 今日产出
2 本周产出
3 全部结果
4 返回主菜单`;

async function handleWebhook(request, env) {
  const token = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : '';
  if (!token) {
    return json(
      { ok: false, error: 'missing TELEGRAM_BOT_TOKEN' },
      { status: 500, ...cors() }
    );
  }

  if (env.TELEGRAM_SECRET) {
    const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (got !== env.TELEGRAM_SECRET) {
      return json({ ok: false, error: 'bad secret' }, { status: 403, ...cors() });
    }
  }

  const update = await request.json().catch(() => null);
  if (!update) return json({ ok: false, error: 'bad json' }, cors());

  const msg = update.message;
  if (msg && msg.chat && msg.chat.id) {
    const chatId = msg.chat.id;
    const text = (msg.text || msg.caption || '').trim();
    const reply = text
      ? await handleMessage(chatId, text)
      : '收到。请发送文字，或输入 /start';

    // plain text — avoid Markdown parse errors blocking replies
    const sendRes = await tgApi(token, 'sendMessage', {
      chat_id: chatId,
      text: String(reply).slice(0, 4000),
    });

    if (!sendRes || sendRes.ok !== true) {
      // still 200 to Telegram so it does not retry forever; log in body for debugging
      return json({
        ok: false,
        error: 'sendMessage_failed',
        telegram: sendRes,
      }, cors());
    }
  }

  return json({ ok: true }, cors());
}

async function handleMessage(chatId, text) {
  const state = userState.get(chatId) || 'WELCOME';

  if (text === '/start' || text.startsWith('/start ')) {
    userState.set(chatId, 'WELCOME');
    return WELCOME_TEXT;
  }

  switch (state) {
    case 'WELCOME':
      return handleWelcome(chatId, text);
    case 'HUMAN_MAIN':
      return handleHumanMenu(chatId, text);
    case 'AI_MAIN':
      return handleAIMenu(chatId, text);
    case 'MEMBER':
      return handleMemberMenu(chatId, text);
    case 'SERVICE':
      return handleServiceMenu(chatId, text);
    case 'TASK':
      return handleTaskMenu(chatId, text);
    case 'RESULT':
      return handleResultMenu(chatId, text);
    default:
      userState.set(chatId, 'WELCOME');
      return WELCOME_TEXT;
  }
}

function handleWelcome(chatId, text) {
  const t = text.toLowerCase();
  if (t === '1' || t === '人类' || t === 'human') {
    userState.set(chatId, 'HUMAN_MAIN');
    return HUMAN_MENU;
  }
  if (t === '2' || t === 'ai' || t === '机器人') {
    userState.set(chatId, 'AI_MAIN');
    return AI_MENU;
  }
  return WELCOME_TEXT;
}

function handleHumanMenu(chatId, text) {
  if (text === '1') {
    userState.set(chatId, 'MEMBER');
    return MEMBER_MENU;
  }
  if (text === '2') {
    userState.set(chatId, 'SERVICE');
    return SERVICE_MENU;
  }
  if (text === '3') {
    userState.set(chatId, 'TASK');
    return TASK_MENU;
  }
  if (text === '4') {
    userState.set(chatId, 'RESULT');
    return RESULT_MENU;
  }
  if (text === '5') {
    return '管理员：ltzyz2181@gmail.com\n\n' + HUMAN_MENU;
  }
  return HUMAN_MENU;
}

function handleAIMenu(chatId, text) {
  if (['1', '2', '3', '4', '5', '6'].includes(text)) {
    return AI_CHANNEL_DETAIL[text] + '\n\n' + AI_MENU;
  }
  return AI_MENU;
}

function handleMemberMenu(chatId, text) {
  if (text === '1') return '当前会员等级：普通用户\n\n' + MEMBER_MENU;
  if (text === '2')
    return '会员权益：无限 AI 对话 / 优先任务 / 专属通道 / 月度报告\n\n' + MEMBER_MENU;
  if (text === '3') return '开通/续费：联系 ltzyz2181@gmail.com\n\n' + MEMBER_MENU;
  if (text === '4') {
    userState.set(chatId, 'HUMAN_MAIN');
    return HUMAN_MENU;
  }
  return MEMBER_MENU;
}

function handleServiceMenu(chatId, text) {
  if (text === '1') return 'AI 对话：GPT / DeepSeek / Claude / 豆包 / Grok / Copilot\n\n' + SERVICE_MENU;
  if (text === '2') return '内容生成：文章 / 脚本 / 文案 / 视频脚本\n\n' + SERVICE_MENU;
  if (text === '3') return '数据分析：财务 / 市场 / 用户行为\n\n' + SERVICE_MENU;
  if (text === '4') return '定制开发：Web / App / 自动化\n\n' + SERVICE_MENU;
  if (text === '5') {
    userState.set(chatId, 'HUMAN_MAIN');
    return HUMAN_MENU;
  }
  return SERVICE_MENU;
}

function handleTaskMenu(chatId, text) {
  if (text === '1') return '提交新任务：请直接描述需求，管理员 24h 内回复。\n\n' + TASK_MENU;
  if (text === '2') return '进行中任务：暂无\n\n' + TASK_MENU;
  if (text === '3') return '历史任务：暂无\n\n' + TASK_MENU;
  if (text === '4') {
    userState.set(chatId, 'HUMAN_MAIN');
    return HUMAN_MENU;
  }
  return TASK_MENU;
}

function handleResultMenu(chatId, text) {
  if (text === '1') return '今日产出：见 https://ltzzz.com/agents.html\n\n' + RESULT_MENU;
  if (text === '2') return '本周产出：见实验室归档\n\n' + RESULT_MENU;
  if (text === '3') return '全部结果：https://ltzzz.com\n\n' + RESULT_MENU;
  if (text === '4') {
    userState.set(chatId, 'HUMAN_MAIN');
    return HUMAN_MENU;
  }
  return RESULT_MENU;
}

async function handleSend(request, env) {
  const token = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : '';
  if (!token) {
    return json({ ok: false, error: 'missing TELEGRAM_BOT_TOKEN' }, { status: 500, ...cors() });
  }

  if (env.TELEGRAM_SECRET) {
    const auth = request.headers.get('Authorization') || '';
    if (auth !== 'Bearer ' + env.TELEGRAM_SECRET) {
      return json({ ok: false, error: 'unauthorized' }, { status: 401, ...cors() });
    }
  }

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: 'bad json' }, cors());

  const chatId = body.chat_id || env.TELEGRAM_CHAT_ID;
  if (!chatId) return json({ ok: false, error: 'missing chat_id' }, cors());

  let method, payload;
  if (body.photo) {
    method = 'sendPhoto';
    payload = { chat_id: chatId, photo: body.photo, caption: body.caption || '' };
  } else if (body.video) {
    method = 'sendVideo';
    payload = { chat_id: chatId, video: body.video, caption: body.caption || '' };
  } else if (body.document) {
    method = 'sendDocument';
    payload = { chat_id: chatId, document: body.document, caption: body.caption || '' };
  } else {
    method = 'sendMessage';
    payload = {
      chat_id: chatId,
      text: String(body.text || '').slice(0, 4000),
    };
  }

  const res = await tgApi(token, method, payload);
  return json({ ok: Boolean(res && res.ok), method, result: res }, cors());
}

async function tgApi(token, method, payload) {
  const url = 'https://api.telegram.org/bot' + token + '/' + method;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return resp.json().catch(() => null);
}

async function setupWebhook(env) {
  const token = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : '';
  if (!token) {
    return json(
      {
        ok: false,
        error: 'missing TELEGRAM_BOT_TOKEN',
        fix: 'Cloudflare Dashboard → ltzzz-telegram-bot → Secrets → TELEGRAM_BOT_TOKEN = BotFather token',
      },
      { status: 500, ...cors() }
    );
  }

  const webhookUrl = 'https://ltzzz-telegram-bot.ltzyz2181.workers.dev/webhook';
  const payload = {
    url: webhookUrl,
    drop_pending_updates: true,
  };
  if (env.TELEGRAM_SECRET) payload.secret_token = env.TELEGRAM_SECRET;

  const setResult = await tgApi(token, 'setWebhook', payload);
  const getResult = await tgApi(token, 'getWebhookInfo', {});

  const ok = Boolean(setResult && setResult.ok);
  return json(
    {
      ok,
      webhook_url: webhookUrl,
      set_webhook_result: setResult,
      current_webhook_info: getResult && getResult.result,
      note: ok
        ? 'Webhook 已配置'
        : 'setWebhook 失败：检查 TELEGRAM_BOT_TOKEN 是否完整（含冒号前数字 ID）',
    },
    cors()
  );
}

async function webhookInfo(env) {
  const token = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : '';
  if (!token) {
    return json({ ok: false, error: 'missing TELEGRAM_BOT_TOKEN' }, { status: 500, ...cors() });
  }
  const getResult = await tgApi(token, 'getWebhookInfo', {});
  const me = await tgApi(token, 'getMe', {});
  return json(
    {
      ok: Boolean(getResult && getResult.ok),
      me: me && me.result,
      webhook: getResult && getResult.result,
    },
    cors()
  );
}
