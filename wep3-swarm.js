// LTZZZ WEP3 Recursive Swarm — agents spawn child intents from parent remaining budget.
// Vision: machines hiring machines with verifiable causal history. No safety theater.
// Bold practice 2026-10-27: tree spawn + depth tracking for living task graphs. Fix in practice.

const AGENTS = ['Grok', 'Doubao', 'DeepSeek', 'Qianwen', 'Kimi', 'GPT', 'Microsoft', 'Claude', 'Meya'];
const known = n => AGENTS.includes(n) || n === 'LTZZZ';

export async function spawnChild(env, parentId, skillId, maxUsd, title, poster, depth = 1) {
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
  if (!parent.children) parent.children = [];
  await put(env, parentKey, parent);

  const childId = 'intent-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  const child = {
    id: childId,
    parent_id: parentId,
    poster,
    skill: skillId,
    title: title || skill.title,
    max_usd: maxUsd,
    remaining: maxUsd,
    status: 'open',
    quotes: [],
    created_at: new Date().toISOString(),
    causal_parent: parentId,
    depth: Number(depth || 1),
    causal_chain: (parent.causal_chain || [parentId]).concat(childId)
  };
  // Auto-bid by skill owner if different
  if (skill.owner && skill.owner !== poster) {
    child.quotes.push({ agent: skill.owner, price: await tapePrice(env, skillId), at: new Date().toISOString() });
  }
  await put(env, 'wep3:intent:' + childId, child);
  parent.children.push(childId);
  await put(env, parentKey, parent);

  await journal(env, {
    type: 'swarm_spawn',
    from: parentId,
    to: child.id,
    amount_usd: maxUsd,
    ref: parentId,
    meta: { skill: skillId, poster, title, depth: child.depth }
  });

  return { ok: true, parent_id: parentId, child_id: child.id, sliced: maxUsd, remaining: parent.remaining, auto_bid: !!child.quotes.length, depth: child.depth };
}

// Bold: one call spawns a tree of child intents from a plan
export async function spawnTree(env, parentId, plan, poster) {
  const results = [];
  for (const step of plan || []) {
    const r = await spawnChild(env, parentId, step.skill, step.max_usd, step.title, poster, (step.depth || 1));
    results.push(r);
    if (!r.ok) break;
  }
  return { ok: results.every(r => r.ok), parent_id: parentId, children: results, total_sliced: results.reduce((s, r) => s + (r.sliced || 0), 0) };
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
  entry.paid = false;
  entry.tx_hash = null;
  await put(env, 'wep3:ledger:' + entry.id, entry);
}
