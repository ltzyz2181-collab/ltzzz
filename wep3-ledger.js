// One Durable Object owns all WEP3 balances, invoices and delivery deduplication.
// KV is a read-only legacy source; new writes must never go back to it.
export class Wep3Ledger {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const staged = new Map();
        const storage = this.ctx.storage;
        const legacy = this.env.PAY_KV;
        const adapter = {
          get: async key => {
            if (staged.has(key)) return staged.get(key);
            const saved = await storage.get(key);
            if (saved !== undefined) return saved;
            if (!legacy) throw new Error('legacy_kv_not_configured');
            const value = await legacy.get(key);
            // Persist missing keys too, so stale KV cannot resurrect a delivery.
            staged.set(key, value);
            return value;
          },
          put: async (key, value) => { staged.set(key, value); },
          list: async ({prefix, limit = 80, cursor: offset}) => {
            const keys = new Set((await storage.list({prefix})).keys());
            if (!legacy) throw new Error('legacy_kv_not_configured');
            let cursor;
            do {
              const page = await legacy.list({prefix, limit: 1000, cursor});
              for (const key of page.keys) keys.add(key.name);
              cursor = page.list_complete === false ? page.cursor : undefined;
            } while (cursor);
            for (const key of staged.keys()) if (key.startsWith(prefix)) keys.add(key);
            const names = [...keys].sort(); const start = Number(offset || 0);
            const end = start + limit;
            return {keys: names.slice(start, end).map(name => ({name})), list_complete: end >= names.length, cursor: end < names.length ? String(end) : undefined};
          }
        };
        const { handleRequest } = await import('./wep3-worker.js');
        const response = await handleRequest(request, {...this.env, PAY_KV: adapter});
        // Business rejection/refund commits; infrastructure failures roll back everything.
        if (response.status < 500 && staged.size) {
          await storage.transaction(async tx => {
            const entries = [...staged];
            for (let i = 0; i < entries.length; i += 128) {
              await tx.put(Object.fromEntries(entries.slice(i, i + 128)));
            }
          });
        }
        return response;
      } catch {
        return new Response(JSON.stringify({ok: false, error: 'ledger_unavailable', retryable: true}), {
          status: 503, headers: {'content-type': 'application/json', 'Access-Control-Allow-Origin': '*'}
        });
      }
    });
  }
}
