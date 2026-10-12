import {createHash} from 'node:crypto';
export const factsHash=text=>createHash('sha256').update(text).digest('hex');
export function recoverPost(previous,{day,facts}) {
  if(!previous)return {mode:'new'};
  if(['POSTING','POST_UNKNOWN'].includes(previous.status))return {mode:'blocked',reason:'previous_post_outcome_unknown'};
  if(previous.status==='POSTED'&&previous.date===day)return {mode:'done',url:previous.post?.url||null};
  if(previous.status==='FAILED'&&previous.post?.http===402&&previous.facts_sha256===factsHash(facts)&&previous.auditor?.status==='success'&&previous.auditor.accepted===true&&typeof previous.text==='string'&&previous.text.trim()&&previous.text.length<=280)return {mode:'reuse',text:previous.text,auditor:previous.auditor};
  return {mode:'new'};
}

export async function submitAuditedPost({receipt,persist,fetchPost}) {
  receipt.status='POSTING';persist(receipt); // survive process loss after request starts
  try {
    const r=await fetchPost();const j=await r.json().catch(()=>({}));
    const http=Number(j.http||r.status);const id=j?.data?.data?.id;
    receipt.post={http,id:id||null,url:id?`https://x.com/ltinzh1248958/status/${id}`:null,error:id?undefined:(j?.data?.detail||j?.data?.title||j.error||'unknown')};
    receipt.status=id&&http>=200&&http<300?'POSTED':http>=400&&http<500?'FAILED':'POST_UNKNOWN';
  }catch{receipt.status='POST_UNKNOWN';receipt.post={id:null,url:null,error:'transport_or_response_unknown'};}
  persist(receipt);return receipt;
}
