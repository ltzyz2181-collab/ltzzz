// LTZZZ WEP3 Recursive Swarm — agents spawn child intents from parent remaining budget.
// Vision: machines hiring machines with verifiable causal history. No safety theater.

const AGENTS = ['Grok', 'Doubao', 'DeepSeek', 'Qianwen', 'Kimi', 'GPT', 'Microsoft', 'Claude', 'Meya'];
const known = n => AGENTS.includes(n) || n === 'LTZZZ';

export async function spawnChild(env, parentId, skillId, maxUsd, title, poster) {
  if (!known(poster)) return { error: 'unknown_poster', status: 400 };
  const parentKey = 'wep3:intent:' + parentId;
  const parent = await get(env, parentKey, null);
  if (!parent || parent.status === 'sealed' || parent.status === 'void') return { error: 'parent_not_open', status: 409 };
  if (parent.poster !== poster) return { error: 'not_parent_poster', status: 403 };
  if (!(maxUsd > 0) || maxUsd > Number(parent.remaining || 0)) return { error: 'slice_exceeds_remaining', remaining: parent.remaining, status: 400 };

  const skill = (await import('./wep3-worker.js')).SKILLS?.find(s => s.id === skillId) || { id: skillId, owner: 'GPT', title, price: 0.02 };
  // Draw from parent remaining (not new credit draw)
  parent.remaining = Number((Number(parent.remaining) - maxUsd).toFixed(6));
  parent.held = Number((Number(parent.held || 0) + maxUsd).toFixed(6));
  parent.children = parent.children || [];
  await put(env, parentKey, parent);

  // Open child intent (reuse openIntent pattern but with parent link)
  const child = {
    id: 'INT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    poster,
    skill: skill.id,
    title: String(title || skill.title || 'child').slice(0, 160),
    product: skill.product || 'https://ltzzz.com/products.html',
    max_usd: maxUsd,
    remaining: maxUsd,
    drawn: 0,
    held: 0,
    status: 'open',
    quotes: [],
    slices: [],
    prev_hash: parent.prev_hash || 'genesis',
    matched: null,
    parent_id: parentId,
    children: [],
    created_at: new Date().toISOString(),
    swarm: true
  };
  await put(env, 'wep3:intent:' + child.id, child);
  parent.children.push(child.id);
  await put(env, parentKey, parent);

  // Auto-bid at tape for skill owner (practice first)
  const owner = skill.owner || 'GPT';
  if (known(owner) && owner !== poster) {
    const tape = await tapePrice(env, skill.id);
    const ask = Number(Math.min(maxUsd, Math.max(0.005, tape * 0.99)).toFixed(6));
    // Minimal quote injection; full match later
    child.quotes = [{ id: 'QTE-auto', agent: owner, ask_usd: ask, tape, at: new Date().toISOString(), auto: true }];
    child.status = 'quoted';
    await put(env, 'wep3:intent:' + child.id, child);
  }

  await journal(env, {
    type: 'swarm_spawn',
    from: parentId,
    to: child.id,
    amount_usd: maxUsd,
    ref: parentId,
    meta: { skill: skillId, poster, title }
  });

  return { ok: true, parent_id: parentId, child_id: child.id, sliced: maxUsd, remaining: parent.remaining, auto_bid: !!child.quotes.length };
}

// Minimal KV helpers (duplicated for isolation; production should share)
async function get(env, key, fallback) {
  const kv = env.PAY_KV;
  if (!kv) return fallback;
  const raw = await kv.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
async function put(env, key, value) {
  if (!env.PAY_KV) throw new Error('kv_missing');
  await env.PAY_KV.put(key, JSON.stringify(value));
}
async function tapePrice(env, skillId) {
  // stub; real one lives in worker. Fallback.
  return 0.02;
}
async function journal(env, entry) {
  entry.id = entry.id || 'LED-swarm-' + Date.now().toString(36);
  entry.at = entry.at || new Date().toISOString();
  entry.settlement_mode = 'internal_credit';
  await put(env, 'wep3:ledger:' + entry.id, entry);
}
