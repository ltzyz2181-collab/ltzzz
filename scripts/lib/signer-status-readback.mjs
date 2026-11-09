import {classifySignerResponse,fundingGate} from './signer-readiness.mjs';

export async function readSignerStatus({base,token,sourceCommit,fetcher=fetch,requestTimeoutMs=20000,sourceCommitMatcher=null}) {
  const rows=[];
  for(const scope of ['aave_supply','snapshot_anchor']) {
    const url=base+'/market/aave/status?capability='+scope;
    const read=async auth=>{const r=await fetcher(url,{method:'GET',redirect:'error',headers:auth?{'X-Lab-Pin':auth}:{},signal:AbortSignal.timeout(requestTimeoutMs)});let body;try{body=await r.json();}catch{body=null;}return {http:r.status,body};};
    const anonymous=await read(null),wrong=await read('invalid-status-observer'),correct=await read(token),b=correct.body;
    const expected={schema:'ltzzz.treasury-signer-status.v1',revision:'wep3-signer-status-v1',scope,chain_id:8453};
    const gate=classifySignerResponse({http:correct.http,body:b,expected});
    let sourceCommitMatch=b?.source_commit===sourceCommit?'exact':'mismatch';
    if(sourceCommitMatch==='mismatch'&&typeof sourceCommitMatcher==='function'){try{if(sourceCommitMatcher(b?.source_commit)===true)sourceCommitMatch='producer_code_equivalent';}catch{}}
    const verified=anonymous.http===401&&wrong.http===401&&correct.http===200&&b?.ok===true&&Object.entries(expected).every(([k,v])=>b[k]===v)&&(sourceCommitMatch==='exact'||sourceCommitMatch==='producer_code_equivalent')&&b.configured===false&&b.control_verified===null&&b.control_evidence===null&&b.transaction_adapter_ready===false&&b.signed===false&&b.transactions===0&&b.on_chain_executed===false&&b.paid===false&&b.tx_hash===null&&!fundingGate(gate).allowed;
    // An allowlist prevents accidental publication of future private fields.
    const observed=Object.fromEntries(['schema','revision','scope','chain_id','source_commit','configured','configured_basis','control_verified','control_evidence','transaction_adapter_ready','status','signed','transactions','on_chain_executed','paid','tx_hash'].map(k=>[k,b?.[k]??null]));
    rows.push({scope,anonymous_http:anonymous.http,wrong_token_http:wrong.http,authenticated_http:correct.http,observed,source_commit_match:sourceCommitMatch,gate,verified});
  }
  return {ok:rows.length===2&&rows.every(r=>r.verified),requests:6,method:'GET',new_signatures:0,transactions:0,rows};
}


// Cloudflare can briefly serve the previous Worker version at some edge locations
// immediately after deployment. Poll only this read-only six-GET contract check,
// with a strict attempt/time bound; never retry funding preflight or mutations.
export async function readSignerStatusWithPropagation({
  base, token, sourceCommit, fetcher=fetch, requestTimeoutMs=8000, sourceCommitMatcher=null,
  attempts=4, delayMs=5000, pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  now=()=>new Date().toISOString()
}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 6) throw new Error('invalid_signer_status_poll_attempts');
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 20000) throw new Error('invalid_signer_status_timeout');
  const startedAt=now(), history=[];
  let result;
  for (let attempt=1; attempt<=attempts; attempt++) {
    result=await readSignerStatus({base,token,sourceCommit,fetcher,requestTimeoutMs,sourceCommitMatcher});
    history.push({attempt,at:now(),ok:result.ok});
    if (result.ok) break;
    if (attempt<attempts) await pause(delayMs);
  }
  return {...result, propagation:{started_at:startedAt,attempts:history,verified_attempt:history.find(x=>x.ok)?.attempt??null,complete:result.ok}};
}
