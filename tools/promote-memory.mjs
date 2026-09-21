#!/usr/bin/env node
/** Scan memory/daily → append new candidate stubs. Never writes ltzzz-memory long-term. */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

mkdirSync('memory/promote', { recursive: true });
const queuePath = 'memory/promote/queue.json';
const queue = existsSync(queuePath)
  ? JSON.parse(readFileSync(queuePath, 'utf8'))
  : { items: [] };
const seen = new Set((queue.items || []).map((i) => i.source + '|' + (i.claim || '').slice(0, 80)));

const dailyDir = 'memory/daily';
if (existsSync(dailyDir)) {
  for (const name of readdirSync(dailyDir).filter((n) => n.endsWith('.md'))) {
    const source = dailyDir + '/' + name;
    const text = readFileSync(source, 'utf8');
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
    const claim = text.split('\n').map((l) => l.trim()).find((l) => l.length > 20 && !l.startsWith('#')) || name;
    const key = source + '|' + claim.slice(0, 80);
    if (seen.has(key)) continue;
    const id = 'CAND-' + name.replace(/\D/g, '').slice(0, 8) + '-' + hash.slice(0, 4);
    queue.items.push({
      id,
      source,
      claim: claim.slice(0, 180),
      impact: /r2|key|wallet|私钥|支付|出金|public/i.test(text) ? 'high' : 'low',
      status: 'candidate',
      deduped: true,
      conflicts: [],
      human_confirm: false,
      snapshot_hash: hash,
    });
    seen.add(key);
  }
}
queue.updated_at = new Date().toISOString();
queue.rule = 'proposed != applied';
writeFileSync(queuePath, JSON.stringify(queue, null, 2));
console.log('candidates', queue.items.length);
