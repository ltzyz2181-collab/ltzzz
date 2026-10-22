// Read-only replay of the award gate over blocked tasks.
// Answers one question on real ledger data: would the current award() rule have let these
// tasks through? Runs on an isolated copy so data/agi-econ/state.json is never touched.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {Subnet,MEMORY_GATE} from './subnet.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};

export function replayAward({root = ROOT, limit = Infinity} = {}) {
  const statePath = path.join(root, 'data/agi-econ/state.json');
  if (!fs.existsSync(statePath)) return {ok: false, error: 'state_missing', replay: []};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'award-replay-'));
  try {
    fs.mkdirSync(path.join(tmp, 'data/agi-econ'), {recursive: true});
    fs.copyFileSync(statePath, path.join(tmp, 'data/agi-econ/state.json'));
    // audit() gates on the memory handshake; award() does not, but a full cycle would.
    for (const p of MEMORY_GATE) {
      const f = path.join(tmp, p);
      fs.mkdirSync(path.dirname(f), {recursive: true});
      fs.writeFileSync(f, p);
    }
    const s = new Subnet(tmp);
    const blocked = Object.values(s.state.tasks).filter(t => t.status === 'blocked' && t.bids?.length);
    const replay = [];
    for (const t of blocked.slice(0, limit)) {
      t.status = 'open'; // undo the block so award() can re-decide from the same bids
      t.worker = null;
      try {
        const win = s.award(t.id);
        replay.push({task: t.id, block_reason: t.block_reason ?? null, awardable: true, worker: win.worker,
          tier: t.action_incentive?.tier ?? null, price_usd: win.price_usd,
          probation_cap_usd: t.probation?.cap_usd ?? null, diagnostics: null});
      } catch (e) {
        replay.push({task: t.id, block_reason: t.block_reason ?? null, awardable: false, worker: null,
          tier: null, price_usd: null, probation_cap_usd: null,
          diagnostics: {error: e.message, rejected: e.diagnostics ?? null}});
      }
    }
    const tally = (key) => replay.reduce((m, r) => ({...m, [String(r[key])]: (m[String(r[key])] ?? 0) + 1}), {});
    return {
      ok: true,
      generated_at: new Date().toISOString(),
      source: 'data/agi-econ/state.json',
      readonly: true,
      blocked_with_bids: blocked.length,
      replayed: replay.length,
      awardable: replay.filter(r => r.awardable).length,
      still_rejected: replay.filter(r => !r.awardable).length,
      awardable_by_tier: tally('tier'),
      awardable_by_reason: tally('block_reason'),
      model_calls: 0,
      real_funds_moved: false,
      tx_hash: null,
      replay,
    };
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}

if (path.basename(process.argv[1] || '') === 'award-replay.mjs') {
  const out = replayAward({limit: Number(arg('limit', Infinity))});
  const dest = arg('out', null);
  const body = JSON.stringify(out, null, 2) + '\n';
  if (dest) {
    fs.mkdirSync(path.dirname(path.resolve(dest)), {recursive: true});
    fs.writeFileSync(path.resolve(dest), body);
  }
  process.stdout.write(body);
}
