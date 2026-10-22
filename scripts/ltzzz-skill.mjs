import {readSkill,skillContext,syncSkillAdapters} from './lib/ltzzz-skill.mjs';
const mode=process.argv[2]||'status';
if(mode==='sync'||mode==='check')console.log(JSON.stringify(syncSkillAdapters({check:mode==='check'})));
else if(mode==='status'){const p=readSkill();console.log(JSON.stringify({version:p.manifest.version,core_sha256:p.core_sha256,...skillContext().proof}));}
else throw Error('Use status, sync or check; no installer executes remote code.');
