import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {canonical, evaluate, sha256} from './lib/patchgate.mjs';

const git = args => execFileSync('git',args,{encoding:'utf8',maxBuffer:2*1024*1024,env:{...process.env,GIT_NO_REPLACE_OBJECTS:'1'}});
const ref = s => { if (!/^[a-f0-9]{40}$/.test(s || '')) throw Error('full_commit_sha_required'); return s; };

export function loadBaseConfig({base, read = p => git(['show',ref(base)+':'+p])}) {
  // Crucial: a PR cannot provide its policy, public keys, interpreter, or imports.
  const policy = JSON.parse(read('config/patch-policy.json'));
  const trust = JSON.parse(read('config/patchgate-trust.json'));
  return {policy,trust,policy_sha256:sha256(canonical(policy)),trust_sha256:sha256(canonical(trust))};
}

export function collectSnapshot({base,head,taskId}) {
  ref(base); ref(head);
  const configs = loadBaseConfig({base});
  const raw = git(['diff','--raw','-z','--no-renames',base,head,'--']).split('\0');
  const files = [];
  for (let i=0;i<raw.length && raw[i];i+=2) {
    const bits = raw[i].split(' '), name = raw[i+1];
    if (files.length >= configs.policy.max_files) throw Error('file_limit_exceeded');
    const diff = git(['--literal-pathspecs','diff','--no-ext-diff','--no-textconv','--no-renames','--no-color','--unified=3',base,head,'--',name]);
    files.push({path:name,mode:bits[1]==='000000'?bits[0].slice(1):bits[1],old_mode:bits[0].slice(1)==='000000'?null:bits[0].slice(1),
      binary:diff.includes('Binary files ') || diff.includes('GIT binary patch'),diff});
  }
  return {...configs,snapshot:{repository:configs.policy.repository,task_id:taskId,base_sha:base,head_sha:head,
    policy_sha256:configs.policy_sha256,trust_sha256:configs.trust_sha256,files}};
}

export function main(args) {
  const [mode,base,head,taskId,output] = args;
  if (mode !== 'inspect' || args.length !== 5) throw Error('usage_patchgate_inspect_base40_head40_TASK_ID_output_json');
  const {policy,trust,snapshot} = collectSnapshot({base,head,taskId});
  const result = evaluate({policy,trust,snapshot});
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({...result,at_utc:new Date().toISOString(),attestations_loaded:0,
    authority:'A0_readonly_evaluator_no_mutation_adapters',limitations:['No merge/deploy/signing/model invocation performed.','Missing signed evidence is blocked, not assumed successful.']},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:result.status,risk_class:result.risk_class,reasons:result.reasons,output}));
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
