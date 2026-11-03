import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync('.github/workflows/aave-owner-funding.yml','utf8');
const retired=readFileSync('scripts/aave-owner-funding.mjs','utf8');

test('retired funding workflow has no schedule, secrets, writes or live executor',()=>{
 assert.doesNotMatch(workflow,/^\s*schedule:/m);
 assert.doesNotMatch(workflow,/\$\{\{\s*secrets\./);
 assert.doesNotMatch(workflow,/FUNDING_EXECUTOR_KEY|FUNDING_EXECUTE/);
 assert.doesNotMatch(workflow,/node\s+scripts\/aave-owner-funding\.mjs/);
 assert.doesNotMatch(workflow,/git\s+push|wrangler\s+deploy/);
 assert.match(workflow,/permissions:\s*\{contents:\s*read\}/);
 assert.match(workflow,/node --test scripts\/tests\/funding-plan\.test\.mjs/);
 assert.match(workflow,/node invest-channel\/tests\/funding\.test\.cjs/);
 assert.match(retired,/denyLegacyFinancialExecution\('scripts\/aave-owner-funding\.mjs'\)/);
});
