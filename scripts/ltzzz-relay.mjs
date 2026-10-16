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
 if(command==='status'&&/^[1-9]\d*$/.test(action||'')&&!rest.length)return ['api','--method','GET',`repos/${REPOSITORY}/issues/${action}`];
 throw Error('usage: node scripts/ltzzz-relay.mjs submit qianwen_inspect task.txt | status ISSUE_NUMBER');
}
const ghOptions={encoding:'utf8',shell:false,timeout:30000,maxBuffer:4*1024*1024};
// Override presentation only: a forced TTY can color even piped API JSON.
// Preserve the inherited authentication, proxy and host settings unchanged.
const readOptions=()=>({...ghOptions,env:{...process.env,GH_FORCE_TTY:'',NO_COLOR:'1',CLICOLOR_FORCE:'0',CLICOLOR:'0'}});
export function readFailure(error,phase){
 const details=String(error?.stderr||'')+' '+String(error?.message||'');
 let reason='网络、代理或 API 读取失败，具体原因未验证';
 if(error?.code==='ENOENT')reason='当前终端找不到 gh；不代表其他电脑没有安装';
 else if(error instanceof SyntaxError||error?.message==='invalid_comments')reason='REST 响应格式不完整或无效，不能据此生成回执';
 else if(/403|forbidden/i.test(details))reason='当前 GitHub 读取请求被拒绝（403/Forbidden）；不能仅据此认定 Token 失效';
 else if(/401|unauthorized|authentication|gh auth login/i.test(details))reason='当前终端的 GitHub 认证未通过或未配置';
 else if(/404|not found/i.test(details))reason='工单不存在或当前账号不可见（404），尚不能区分';
 else if(/ETIMEDOUT|timed? ?out|timeout/i.test(details)||error?.signal)reason='读取超时或被中断，回执未完整取得';
 return new Error(`接力查询失败（${phase}）：${reason}。未取得完整回执，不等于远端执行失败；未修改登录、权限或 Token。请在同一终端核验 gh api user --jq .login，并提供不含凭证的原始错误。`);
}
export function readRelayStatus(number,{run=execFileSync}={}){
 const issueArgs=ghArguments(['status',number]);
 let issue,comments;
 try{issue=JSON.parse(run('gh',issueArgs,readOptions()));}catch(error){throw readFailure(error,'工单 REST GET');}
 if(String(issue.number)!==number||typeof issue.title!=='string'||!['open','closed'].includes(issue.state))throw Error('接力查询失败：工单 REST 响应格式或编号不匹配；未取得完整回执。');
 // @json gives one JSON value per line across all pages, including multiline bodies.
 // Unlike --slurp, it does not require a recent GitHub CLI version.
 const commentArgs=['api','--method','GET',`repos/${REPOSITORY}/issues/${number}/comments?per_page=100`,'--paginate','--jq','.[] | @json'];
 try{
  const text=run('gh',commentArgs,readOptions());
  comments=text.split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line));
  if(comments.some(comment=>!Number.isSafeInteger(comment.id)||typeof comment.body!=='string'))throw Error('invalid_comments');
 }catch(error){throw readFailure(error,'评论 REST GET（含分页）');}
 // Both reads must succeed before any result is emitted. Do not infer task completion
 // from an open/closed issue or from unverified prose in a comment.
 const sections=[`# #${issue.number} ${issue.title}`,`工单状态：${issue.state}\n来源：https://github.com/${REPOSITORY}/issues/${number}\n读取方式：GitHub REST GET（只读；评论含分页）\n说明：工单状态与评论是原始记录，不自动等同于执行或审核已成功。`,issue.body||'（工单正文为空）',`## 评论（${comments.length} 条）`];
 for(const comment of comments)sections.push(`### ${comment.user?.login||'未知作者'} · ${comment.created_at||'时间未知'}\n${comment.html_url||''}\n\n${comment.body}`);
 return sections.join('\n\n')+'\n';
}
export function runRelay(args,{run=execFileSync,read}={}){
 const command=ghArguments(args,read);
 if(args[0]==='status')return readRelayStatus(args[1],{run});
 const options=typeof command.at(-1)==='object'?command.pop():{};
 return run('gh',command,{...ghOptions,input:options.stdin});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.stdout.write(runRelay(process.argv.slice(2)));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
