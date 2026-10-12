#!/usr/bin/env node
/** Scan memory/daily → append new candidate stubs. Never writes ltzzz-memory long-term. */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {substantiveClaim,candidateImpact} from './memory-candidate-quality.mjs';

mkdirSync('memory/promote', { recursive: true });
const queuePath = 'memory/promote/queue.json';
const queue = existsSync(queuePath)
  ? JSON.parse(readFileSync(queuePath, 'utf8'))
  : { items: [] };
const seen = new Set((queue.items || []).map((i) => i.source + '|' + (i.claim || '').slice(0, 80)));
const claimsSeen=new Set((queue.items||[]).filter(i=>i.status==='candidate').map(i=>(i.claim||'').replace(/\s+/g,'')));
for(const item of queue.items||[])if(item.status==='candidate'&&!substantiveClaim(item.claim||'')){item.status='rejected_metadata';item.impact='low';item.review_reason='Operational metadata is not a durable factual claim';}

const dailyDir = 'memory/daily';
if (existsSync(dailyDir)) {
  for (const name of readdirSync(dailyDir).filter((n) => n.endsWith('.md'))) {
    const source = dailyDir + '/' + name;
    const text = readFileSync(source, 'utf8');
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
    const claim = text.split('\n').map((l) => l.trim()).find(substantiveClaim);
    if(!claim||claimsSeen.has(claim.replace(/\s+/g,'')))continue;
    const key = source + '|' + claim.slice(0, 80);
    if (seen.has(key)) continue;
    const id = 'CAND-' + name.replace(/\D/g, '').slice(0, 8) + '-' + createHash('sha256').update(claim).digest('hex').slice(0, 8);
    queue.items.push({
      id,
      source,
      claim: claim.slice(0, 180),
      impact: candidateImpact(claim),
      status: 'candidate',
      deduped: true,
      conflicts: [],
      human_confirm: false,
      snapshot_hash: hash,
    });
    seen.add(key);
    claimsSeen.add(claim.replace(/\s+/g,''));
  }
}
queue.updated_at = new Date().toISOString();
queue.rule = 'proposed != applied';
writeFileSync(queuePath, JSON.stringify(queue, null, 2));
console.log('candidates', queue.items.length);
