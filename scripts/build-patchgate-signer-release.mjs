// Public source inventory, not deployment. Does not generate or touch any key.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {signerSourceDigest} from '../patchgate-signer-source.mjs';
export async function sourceRelease({sourceCommit,read}){
 if(!/^[a-f0-9]{40}$/.test(sourceCommit||''))throw Error('fixed_main_commit_required');
 const source=await signerSourceDigest(read);
 return {schema:'ltzzz.patchgate.signer-source-candidate.v1',task_id:'PLAN-PATCHGATE-ESCROW-20261023',source_commit:sourceCommit,signer_source_sha256:source.sha256,files:source.files,status:'source_inventory_only_not_deployment_or_registration',production_deployment:false,signing_keys_registered:false,private_key_access:false,model_calls:0,paid:false,tx_hash:null};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const out=process.argv[2];if(!out||process.argv.length!==3)throw Error('output_path_required');
 const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const report=await sourceRelease({sourceCommit:sha,read:p=>execFileSync('git',['show',sha+':'+p])});
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,source_commit:sha,signer_source_sha256:report.signer_source_sha256,private_key_access:false}));
}
