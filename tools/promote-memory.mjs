#!/usr/bin/env node
/** Scan memory/daily → append new candidate stubs. Never writes ltzzz-memory long-term. */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {substantiveClaim,candidateImpact} from './memory-candidate-quality.mjs';
import {reconcilePromotionQueue,assertPromotionQueue,recordHash} from './promotion-queue.mjs';

mkdirSync('memory/promote', { recursive: true });
const queuePath = 'memory/promote/queue.json';
const previous = existsSync(queuePath)
  ? JSON.parse(readFileSync(queuePath, 'utf8'))
  : { items: [] };
const at=new Date().toISOString(),evidence='memory/promote/reconciliations/legacy-'+recordHash(previous).slice(0,16)+'.json';
const {queue,changes}=reconcilePromotionQueue(previous,{at,evidence});
if(changes.length){mkdirSync('memory/promote/reconciliations',{recursive:true});if(!existsSync(evidence))writeFileSync(evidence,JSON.stringify({observed_at:at,reason:'one_current_state_per_candidate_id',source_queue_sha256:recordHash(previous),hash_encoding:'UTF-8 JSON.stringify(source_queue), not original file whitespace',source_queue:previous,changes},null,2)+'\n');}
const seen = new Set((queue.items || []).map((i) => i.source + '|' + (i.claim || '').slice(0, 80)));
const claimsSeen=new Set((queue.items||[]).filter(i=>['candidate','applied','reconciliation_required'].includes(i.status)).flatMap(i=>[i.claim,i.source_claim].filter(Boolean).map(s=>s.replace(/\s+/g,''))));
const idsSeen=new Set((queue.items||[]).map(i=>i.id));
for(const item of queue.items||[])if(item.status==='candidate'&&!substantiveClaim(item.claim||'')){item.status='rejected_metadata';item.impact='low';item.review_reason='Operational metadata is not a durable factual claim';}

const dailyDir = 'memory/daily';
if (!process.argv.includes('--reconcile-only') && existsSync(dailyDir)) {
  for (const name of readdirSync(dailyDir).filter((n) => n.endsWith('.md'))) {
    const source = dailyDir + '/' + name;
    const text = readFileSync(source, 'utf8');
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
    const claim = text.split('\n').map((l) => l.trim()).find(substantiveClaim);
    if(!claim||claimsSeen.has(claim.replace(/\s+/g,'')))continue;
    const key = source + '|' + claim.slice(0, 80);
    if (seen.has(key)) continue;
    const id = 'CAND-' + name.replace(/\D/g, '').slice(0, 8) + '-' + createHash('sha256').update(claim).digest('hex').slice(0, 8);
    if(idsSeen.has(id))throw Error('candidate_id_collision_requires_reconciliation');
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
    idsSeen.add(id);
    claimsSeen.add(claim.replace(/\s+/g,''));
  }
}
queue.updated_at = new Date().toISOString();
queue.rule = 'proposed != applied';
queue.applied=queue.items.filter(item=>item.status==='applied').map(item=>item.id);
assertPromotionQueue(queue);
writeFileSync(queuePath, JSON.stringify(queue, null, 2));
console.log(JSON.stringify({records:queue.items.length,unique_ids:idsSeen.size,candidates:queue.items.filter(i=>i.status==='candidate').length,historical_applied:queue.applied.length,reconciled_ids:changes.map(c=>c.id)}));
