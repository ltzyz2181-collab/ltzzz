// Trusted-main read-only workflow inventory. Candidate text is never executed.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {checkFinancialInventory,scanWorkflowSecretReferences} from './lib/financial-exit-inventory.mjs';
export function inspectWorkflowTree(root, revision) {
 if(revision!=='HEAD'&&!/^[a-f0-9]{40}$/.test(revision||''))throw Error('fixed_workflow_revision_required');
 const git=args=>execFileSync('git',args,{cwd:root,maxBuffer:8000000});
 const sha=git(['rev-parse','--verify',revision+'^{commit}']).toString().trim();
 const entries=git(['ls-tree','-rz',sha,'--','.github/workflows/']).toString().split('\0').filter(Boolean);
 if(entries.length>1500)throw Error('workflow_tree_bound');
 const sources=[];
 for(const entry of entries){
  const at=entry.indexOf('\t'),meta=entry.slice(0,at).split(' '),file=entry.slice(at+1);
  if(!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(file))throw Error('unexpected_workflow_path');
  if(meta[0]!=='100644'||meta[1]!=='blob')throw Error('workflow_regular_file_required');
  const bytes=git(['show',sha+':'+file]);if(bytes.length>1000000)throw Error('workflow_size_bound');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  sources.push({path:file,sha256:createHash('sha256').update(bytes).digest('hex'),workflow:true,matches:[],secret_references:scanWorkflowSecretReferences(text)});
 }
 return {revision:sha,...checkFinancialInventory({sources,inventory:{schema:'ltzzz.financial-exits.v1',exits:[]},read:()=>{throw Error('no_candidate_executable_read');}})};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{const r=inspectWorkflowTree(process.cwd(),process.argv[2]);console.log(JSON.stringify({status:'trusted_source_workflow_inventory_not_authorization',...r,model_calls:0,financial_execution:false}));if(!r.passed)process.exitCode=1;}
 catch(e){console.error(/^[a-z_]+$/.test(e.message)?e.message:'workflow_inventory_failed');process.exitCode=1;}
}
