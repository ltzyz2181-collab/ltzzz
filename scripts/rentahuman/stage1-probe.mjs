#!/usr/bin/env node
/**
 * RentAHuman Stage 1 probe (zero cost path).
 * - Always: public search + stats + fee note from official llms copy (18%)
 * - Optional: dryRun create_bounty if RENTAHUMAN_API_KEY is set (still no live post)
 * Never posts a live bounty, never releases payment.
 *
 * Usage:
 *   node scripts/rentahuman/stage1-probe.mjs
 *   RENTAHUMAN_API_KEY=rah_... node scripts/rentahuman/stage1-probe.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://rentahuman.ai/api';
const OUT_DIR = 'knowledge/results/rentahuman';

async function getJson(url, headers = {}) {
  const r = await fetch(url, {headers, signal: AbortSignal.timeout(30000)});
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = {raw: text.slice(0, 500)};
  }
  return {http: r.status, body};
}

function filterGuangzhou(humans) {
  const list = Array.isArray(humans) ? humans : [];
  return list.filter((h) => {
    const loc = h.location || {};
    const blob = [loc.city, loc.state, loc.country, h.headline, h.bio]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return (
      blob.includes('guangzhou') ||
      blob.includes('广州') ||
      blob.includes('guang dong') ||
      blob.includes('guangdong') ||
      (loc.country === 'CN' && String(loc.city || '').toLowerCase().includes('guang'))
    );
  });
}

async function main() {
  const wantDryRun = process.argv.includes('--dry-run');
  const key = process.env.RENTAHUMAN_API_KEY || '';

  const report = {
    at: new Date().toISOString(),
    stage: 1,
    mode: 'shadow_probe',
    paid: false,
    live_order: false,
    service_fee_official_note: '18% on top of worker pay (rentahuman.ai/llms.txt 2026-10-21)',
    queries: {},
    dry_run: null,
    observations: []
  };

  report.queries.stats = await getJson(`${BASE}/stats`);
  report.queries.humans_default = await getJson(`${BASE}/humans?limit=10`);
  report.queries.humans_location_guangzhou = await getJson(
    `${BASE}/humans?location=Guangzhou&limit=20`
  );
  report.queries.humans_search_guangzhou = await getJson(
    `${BASE}/humans/search?q=Guangzhou&limit=20`
  ).catch(async () => getJson(`${BASE}/search?q=Guangzhou&limit=20`));

  const pool = [
    ...(report.queries.humans_location_guangzhou.body?.humans || []),
    ...(report.queries.humans_search_guangzhou.body?.humans ||
      report.queries.humans_search_guangzhou.body?.results ||
      [])
  ];
  const gz = filterGuangzhou(pool);
  report.guangzhou_matches = {
    count: gz.length,
    sample: gz.slice(0, 5).map((h) => ({
      id: h.id,
      name: h.name,
      city: h.location?.city,
      country: h.location?.country,
      hourlyRate: h.hourlyRate,
      remote: h.location?.isRemoteAvailable
    }))
  };
  if (!gz.length) {
    report.observations.push(
      'No clear Guangzhou/CN match in sampled public results; location filter may be weak or coverage low.'
    );
  }

  if (wantDryRun) {
    if (!key) {
      report.dry_run = {
        attempted: false,
        error: 'RENTAHUMAN_API_KEY_missing',
        note: 'Stage0 owner must place key in GitHub Secret; stage1 dryRun skipped.'
      };
    } else {
      const body = {
        dryRun: true,
        title: 'LTZZZ stage1 digital public-info microtask (dry run only)',
        description:
          'SHADOW ONLY. Summarize one public webpage title and URL. No private data. No physical presence. Done means: short text summary.',
        budget: 2,
        currency: 'USD',
        location: {city: 'Remote', country: 'US', isRemote: true},
        tags: ['research', 'digital'],
        completionCriteria: 'Public-info summary only; no PII.',
        evidenceRequired: ['text']
      };
      const r = await fetch(`${BASE}/bounties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': key,
          'Idempotency-Key': 'ltzzz-stage1-dryrun-' + new Date().toISOString().slice(0, 10)
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
      const text = await r.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = {raw: text.slice(0, 800)};
      }
      report.dry_run = {
        attempted: true,
        http: r.status,
        body: parsed,
        live_order: false,
        note: 'dryRun must not create a funded bounty; verify response fields before stage2'
      };
    }
  }

  fs.mkdirSync(OUT_DIR, {recursive: true});
  const outFile = path.join(OUT_DIR, `stage1-probe-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        ok: true,
        outFile,
        gz_matches: report.guangzhou_matches.count,
        dry_run_attempted: Boolean(report.dry_run?.attempted),
        paid: false
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
