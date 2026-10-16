import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {REPOSITORY,PREFIX,relayBody} from './lib/control-relay.mjs';

export function ghArguments(args,read=filename=>fs.readFileSync(filename,'utf8')){
 const [command,action,...rest]=args;
 if(command==='submit'){
  if(rest.length!==1)throw Error('usage: submit inspect|qianwen_inspect|dispatch task-file.txt');
  const body=relayBody(action,read(rest[0]));
  return ['issue','create','--repo',REPOSITORY,'--title',PREFIX+' '+action,'--body-file','-',{stdin:body}];
 }
 if(command==='status'&&/^[1-9]\d*$/.test(action||'')&&!rest.length)return ['issue','view',action,'--repo',REPOSITORY,'--comments'];
 throw Error('usage: node scripts/ltzzz-relay.mjs submit qianwen_inspect task.txt | status ISSUE_NUMBER');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const args=ghArguments(process.argv.slice(2)),options=typeof args.at(-1)==='object'?args.pop():{};
  const output=execFileSync('gh',args,{input:options.stdin,encoding:'utf8',shell:false,timeout:30000,maxBuffer:1024*1024});process.stdout.write(output);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
