import fs from 'node:fs';
import {sha256,validatePreflight} from './lib/workpool-policy.mjs';
// Workflow checks out trusted BASE only; PR body is JSON data, never executable code.
const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
const body=String(event.pull_request?.body||'');
const blocks=[...body.matchAll(/<!-- LTZZZ_WORKPOOL_PREFLIGHT -->\s*```json\s*([\s\S]*?)```/g)];
if(blocks.length!==1||blocks[0][1].length>16000)throw Error('one_preflight_record_required');
const record=JSON.parse(blocks[0][1]);
const errors=validatePreflight(record,{coreHash:sha256(fs.readFileSync('CORE-VIEW.md')),sourceCommit:event.pull_request.base.sha});
if(errors.length)throw Error(errors.join(','));
console.log('preflight_structure_verified_not_truth_or_authorization');
