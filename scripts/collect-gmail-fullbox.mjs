#!/usr/bin/env node
// Full-mailbox intake for ltzyz2181@gmail.com (owner decision 2026-11-17:
// the agent must read the whole Gmail box, not only Agent Mail).
//
// This script never posts a message: it is read-only metadata intake. It uses
// the Gmail REST API with an OAuth refresh token held only in the executor
// environment. When the credentials are absent it fails closed and writes the
// reason instead of pretending the box was read. Message bodies are never
// persisted: only id, thread id, labels, date, sender domain, short subject and
// a snippet hash go to disk.
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR='knowledge/results/deep-superagent/mail-fullbox';
const OUT=path.join(OUT_DIR,'latest.json');
const USER=process.env.GMAIL_USER||'ltzyz2181@gmail.com';
const DAYS=Number(process.env.GMAIL_LOOKBACK_DAYS||30);
const FAIL=3;

function write(payload){fs.mkdirSync(OUT_DIR,{recursive:true});fs.writeFileSync(OUT,JSON.stringify(payload,null,1)+'\n');}
function base(reason,extra={}){return {schema:'ltzzz.mail-fullbox.v1',at:new Date().toISOString(),mailbox:USER,lookback_days:DAYS,status:reason,provider:'gmail_api',read_only:true,bodies_persisted:false,count:0,open_count:0,messages:[],...extra};}
function die(reason,extra={}){write(base(reason,extra));console.log(reason);process.exit(FAIL);}

const clientId=process.env.GMAIL_CLIENT_ID,clientSecret=process.env.GMAIL_CLIENT_SECRET,refreshToken=process.env.GMAIL_REFRESH_TOKEN;
if(!clientId||!clientSecret||!refreshToken)die('creds_missing',{required_env:['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN'],note:'full-mailbox read is fail-closed until the OAuth refresh token is supplied; Agent Mail stays the only readable channel meanwhile'});

const cutoff=new Date(Date.now()-DAYS*86400000);
const q=`after:${cutoff.getUTCFullYear()}/${String(cutoff.getUTCMonth()+1).padStart(2,'0')}/${String(cutoff.getUTCDate()).padStart(2,'0')} -in:spam -in:trash`;

async function token(){
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})});
  const d=await r.json().catch(()=>null);
  if(!r.ok||!d?.access_token)throw Error('gmail_oauth_token_failed');
  return d.access_token;
}
async function get(t,url){
  const r=await fetch(url,{headers:{Authorization:'Bearer '+t}});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Error('gmail_api_'+r.status);
  return d;
}
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(v=>v.toString(16).padStart(2,'0')).join('');

try{
  const t=await token();const ids=[];let pageToken=null;
  for(let page=0;page<12;page++){
    const url='https://gmail.googleapis.com/gmail/v1/users/'+encodeURIComponent(USER)+'/messages?'+new URLSearchParams({q,maxResults:'100',...(pageToken?{pageToken}:{})});
    const d=await get(t,url);for(const m of d.messages||[])if(!ids.includes(m.id))ids.push(m.id);
    pageToken=d.nextPageToken||null;if(!pageToken)break;
  }
  const messages=[];
  for(const id of ids.slice(0,300)){
    const d=await get(t,'https://gmail.googleapis.com/gmail/v1/users/'+encodeURIComponent(USER)+'/messages/'+id+'?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date');
    const h=Object.fromEntries((d.payload?.headers||[]).map(x=>[x.name.toLowerCase(),x.value]));
    const from=h.from||'';const labels=d.labelIds||[];
    const unread=labels.includes('UNREAD');
    messages.push({id,thread_id:d.threadId||null,internal_date:d.internalDate?new Date(Number(d.internalDate)).toISOString():null,from_domain:(from.match(/@([^\s>]+)/)||[])[1]||null,subject_short:(h.subject||'').slice(0,60),subject_sha256:await sha(h.subject||''),snippet_sha256:await sha(d.snippet||''),labels,unread});
  }
  const open=messages.filter(m=>m.unread||m.labels.includes('INBOX'));
  write(base('ok',{count:messages.length,open_count:open.length,messages}));
  console.log(JSON.stringify({status:'ok',count:messages.length,open_count:open.length}));
}catch(e){die(e.message||'gmail_read_failed');}
