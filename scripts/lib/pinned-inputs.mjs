import {execFileSync} from 'node:child_process';
import {hash} from './reflection-harness.mjs';
export function pinnedInputs(files,{root='.',commit}={}){
 const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:2*1024*1024});
 commit??=git('rev-parse','HEAD').toString().trim();
 if(!/^[a-f0-9]{40}$/.test(commit))throw Error('full_input_commit_required');
 return files.map(file=>{
  if(typeof file!=='string'||!/^(?:scripts|workers|docs|ltzzz-memory|knowledge\/results\/ans-cycle)\//.test(file)||file.split('/').some(s=>!s||s==='..'||s==='.')||/[\u0000-\u001f\\:?%#]/.test(file))throw Error('input_path_invalid');
  if(!git('ls-tree',commit,'--',file).toString().startsWith('100644 blob '))throw Error('regular_input_blob_required');
  const bytes=git('show',commit+':'+file);
  return {file,text:bytes.toString('utf8'),sha256:hash(bytes),commit};
 });
}
