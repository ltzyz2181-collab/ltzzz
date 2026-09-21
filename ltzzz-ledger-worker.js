/** Read-only-first ledger. No transfers. Prefix ledger: */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/health') {
      return json({
        ok: true,
        service: 'ltzzz-ledger',
        kv_bound: Boolean(env.LTZZZ_LEDGER_KV),
        kv_id: '63c6bb670cfc42b18b4d232605d5bcad',
        prefix: 'ledger:',
        note: 'shared KV until dedicated LTZZZ_LEDGER_KV id is provided',
        transfer: false,
      });
    }
    if (!env.LTZZZ_LEDGER_KV) return json({ ok: false, error: 'kv_unbound' }, 503);
    if (path === '/ledger/list' && request.method === 'GET') {
      const listed = await env.LTZZZ_LEDGER_KV.list({ prefix: 'ledger:', limit: 50 });
      const rows = [];
      for (const k of listed.keys) {
        const raw = await env.LTZZZ_LEDGER_KV.get(k.name);
        if (raw) rows.push({ key: k.name, value: JSON.parse(raw) });
      }
      return json({ ok: true, count: rows.length, rows });
    }
    if (path === '/ledger/append' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (env.LTZZZ_AGENT_TOKEN && auth !== 'Bearer ' + env.LTZZZ_AGENT_TOKEN) {
        return json({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await request.json().catch(() => ({}));
      const id = 'led_' + Date.now().toString(36);
      const row = {
        id,
        time: new Date().toISOString(),
        asset: body.asset || '',
        amount: body.amount || '',
        network: body.network || '',
        from: body.from || '',
        to: body.to || '',
        txid: body.txid || '',
        fee: body.fee || '',
        status: body.status || 'recorded',
        purpose: body.purpose || '',
        human_confirm: Boolean(body.human_confirm),
      };
      await env.LTZZZ_LEDGER_KV.put('ledger:' + id, JSON.stringify(row));
      return json({ ok: true, row });
    }
    return json({ ok: false, error: 'not_found' }, 404);
  },
};
