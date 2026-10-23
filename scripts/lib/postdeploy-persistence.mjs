import {execFileSync} from 'node:child_process';
import {EVIDENCE_BRANCH,EVIDENCE_DIR} from './postdeploy-verification.mjs';
export function persistDeploymentEvidence(cwd){
 const git=args=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 git(['add','--',EVIDENCE_DIR]);
 const staged=git(['diff','--cached','--name-only']).split('\n').filter(Boolean);
 if(!staged.length)return {changed:false};
 if(staged.some(file=>!new RegExp('^'+EVIDENCE_DIR+'/(?:index|DEPLOY-\\d+-\\d+(?:\\.v2|\\.review(?:-reservation|-started)?)?)\\.json$').test(file)))throw Error('non_evidence_staged_change_refused');
 const mutations=git(['diff','--cached','--name-only','--diff-filter=MDRCT']).split('\n').filter(file=>file&&file!==EVIDENCE_DIR+'/index.json');
 if(mutations.length)throw Error('immutable_deployment_evidence_change_refused');
 git(['-c','user.name=ltzzz-postdeploy-observer','-c','user.email=bot@ltzzz.local','commit','-m','Record independent deployment observation without modifying main']);
 git(['push','origin','HEAD:refs/heads/'+EVIDENCE_BRANCH]);
 return {changed:true,commit:git(['rev-parse','HEAD']),branch:EVIDENCE_BRANCH};
}
