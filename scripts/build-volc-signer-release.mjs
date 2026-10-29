// Fixed public-source bundle. No key generation, model calls or cloud requests.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {SIGNER_SOURCE_FILES} from '../patchgate-signer-source.mjs';
import {canonical} from '../patchgate-attestation-evidence.mjs';
const CLOUD=['cloud/signer-volc-attest/index.js','cloud/signer-volc-attest/runtime.mjs','cloud/signer-volc-attest/storage.cjs','cloud/signer-volc-attest/package.json'];
export const VOLC_SOURCE_FILES=Object.freeze([...new Set([...SIGNER_SOURCE_FILES,...CLOUD])].sort());
export const BOOTSTRAP="'use strict';\nexports.handler=require('./modules/cloud/signer-volc-attest/index.js').handler;\n";
export const PACKAGE=JSON.stringify({name:'ltzzz-volc-signer-fixed-bundle',private:true,type:'commonjs',main:'index.js'},null,2)+'\n';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function buildVolcSource({sourceCommit,read}){
 if(!/^[a-f0-9]{40}$/.test(sourceCommit||''))throw Error('fixed_source_commit_required');
 const files=Object.fromEntries(VOLC_SOURCE_FILES.map(p=>[p,Buffer.from(read(p))]));
 files['package.json']=Buffer.from('{"type":"module"}\n');files['bootstrap/index.js']=Buffer.from(BOOTSTRAP);files['bootstrap/package.json']=Buffer.from(PACKAGE);
 const rows=Object.keys(files).sort().map(p=>({path:p,sha256:sha(files[p]),bytes:files[p].length}));
 return {files,manifest:{schema:'ltzzz.volc-signer.source.v1',source_commit:sourceCommit,files:rows},source_sha256:sha(canonical(rows))};
}
export function writeVolcBundle(directory,source){
 fs.mkdirSync(directory,{recursive:false,mode:0o700});
 const put=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b,{flag:'wx'});};
 for(const [p,b] of Object.entries(source.files))put(path.join(directory,'modules',p),b);
 put(path.join(directory,'modules/volc-release.json'),JSON.stringify(source.manifest,null,2)+'\n');put(path.join(directory,'index.js'),BOOTSTRAP);put(path.join(directory,'package.json'),PACKAGE);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 if(process.argv.length!==3)throw Error('new_bundle_directory_required');
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const source=buildVolcSource({sourceCommit,read:p=>execFileSync('git',['show',sourceCommit+':'+p])});writeVolcBundle(process.argv[2],source);
 console.log(JSON.stringify({status:'source_bundle_only_not_cloud_deployment',source_commit:sourceCommit,source_sha256:source.source_sha256,files:source.manifest.files.length,private_key_generated:false,model_calls:0}));
}
