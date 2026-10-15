import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
test('retired pilot has no execution credentials, auto/supply/withdraw calls or cron',()=>{
  const source=fs.readFileSync('.github/workflows/treasury-migration-and-pilot.yml','utf8');
  assert.doesNotMatch(source,/schedule:|LTZZZ_WALLET_PRIVATE_KEY|CLOUDFLARE_API_TOKEN|treasury-migration\.mjs|AAVE_ACTION:\s*(auto|supply|withdraw)\b/);
  assert.match(source,/name: Commit all inspection receipts\n\s+if: always\(\)/);assert.match(source,/actions\/upload-artifact/);
});
test('failed snapshot remains visible in a saved inspection receipt, without pretending earlier pilot failed',()=>{
  fs.mkdirSync('work',{recursive:true});const dir=fs.mkdtempSync(path.resolve('work/inspection-test-'));
  try{
    const run=spawnSync(process.execPath,[path.resolve('scripts/record-treasury-inspection.mjs')],{cwd:dir,env:{...process.env,GITHUB_RUN_ID:'fixture',GITHUB_RUN_ATTEMPT:'2',TREASURY_DIAGNOSE_OUTCOME:'success',TREASURY_SNAPSHOT_OUTCOME:'failure',TREASURY_RECONCILE_OUTCOME:'success'},encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);const report=JSON.parse(fs.readFileSync(path.join(dir,'knowledge/results/migrations/inspection-fixture-2.json'),'utf8'));
    assert.equal(report.status,'inspection_blocked');assert.equal(report.checks.snapshot,'failure');assert.equal(report.signed,false);assert.equal(report.broadcast,false);assert.ok(report.historical_pilot_source);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('WEP3 auditor receives both Kimi queue credentials; recovery channel adds no paid schedule',()=>{
  const workflow=fs.readFileSync('.github/workflows/deploy-wep3.yml','utf8');
  const step=workflow.split('      - name: Audit actual provider delivery')[1].split('      - name:')[0];
  assert.match(step,/MOONSHOT_API_KEY_CN: \$\{\{ secrets\.MOONSHOT_API_KEY_CN \}\}/);
  assert.match(step,/LTZZZ_AGENT_TOKEN: \$\{\{ secrets\.LTZZZ_AGENT_TOKEN \}\}/);
  const daily=fs.readFileSync('.github/workflows/deepseek-daily.yml','utf8');assert.doesNotMatch(daily,/schedule:|cron:/);assert.match(daily,/name: Commit and push the daily entry\n\s+if: always\(\)/);
});
