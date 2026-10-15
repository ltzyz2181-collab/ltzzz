import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {git} from './push-receipt-commit.mjs';
export function syncMemoryManifest({cwd=process.cwd(),attempts=4,beforePush=()=>{}}={}){
 const run=(dir,args)=>{const r=git(dir,args);if(r.status!==0)throw Error('manifest_git_'+args[0]+'_failed');return r.stdout.trim();};
 for(let attempt=0;attempt<attempts;attempt++){
  run(cwd,['fetch','origin','main']);
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-manifest-')),tree=path.join(temporary,'snapshot');
  try{
   run(cwd,['worktree','add','--detach',tree,'origin/main']);
   const built=spawnSync(process.execPath,['tools/build-memory-manifest.mjs'],{cwd:tree,encoding:'utf8'});
   if(built.status!==0)throw Error('manifest_build_failed');
   run(tree,['add','ltzzz-memory/manifest.json']);
   if(git(tree,['diff','--staged','--quiet']).status===0)return {ok:true,changed:false,attempts:attempt+1,commit:run(tree,['rev-parse','HEAD'])};
   run(tree,['commit','-m','chore(memory): refresh manifest from latest main snapshot']);
   beforePush(attempt);
   const push=git(tree,['push','origin','HEAD:main']);
   if(push.status===0)return {ok:true,changed:true,attempts:attempt+1,commit:run(tree,['rev-parse','HEAD'])};
   if(!/non-fast-forward|fetch first|cannot lock ref|failed to update ref/i.test(push.stderr))throw Error('manifest_push_failed_not_a_concurrent_update');
  }finally{git(cwd,['worktree','remove','--force',tree]);fs.rmSync(temporary,{recursive:true,force:true});}
 }
 throw Error('manifest_concurrent_update_retry_limit');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{const r=syncMemoryManifest();console.log(JSON.stringify(r));if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,'MEMORY_SYNC_COMMIT='+r.commit+'\n');}catch(e){console.error(e.message);process.exitCode=1;}
