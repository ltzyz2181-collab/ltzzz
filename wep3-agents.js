import {verifyMessage,Wallet} from 'ethers';
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
// Self-owned signature registration is an application, never automatic audit or signing authority.
export async function agentApplication(m,request,book){
 const b=await request.json().catch(()=>({}));
 if(!/^did:ltzzz:[a-z0-9._-]{2,60}$/.test(b.did||'')||!/^0x[a-fA-F0-9]{40}$/.test(b.wallet||'')||!Array.isArray(b.skills)||b.skills.length>10||b.skills.some(s=>!/^[-a-z0-9]{2,40}$/.test(s))||!Number.isFinite(b.timestamp)||Math.abs(Date.now()-b.timestamp)>300000)return {ok:false,error:'invalid_agent_application'};
 if(['gpt','grok','deepseek','doubao','qianwen','kimi','claude','meta','microsoft','manus','workbuddy','kimi-global'].includes(b.did.split(':').at(-1)))return {ok:false,error:'reserved_seat_did'};
 const message='LTZZZ agent application v1\n'+JSON.stringify({did:b.did,wallet:b.wallet.toLowerCase(),skills:b.skills,timestamp:b.timestamp});
 try{if(verifyMessage(message,b.signature).toLowerCase()!==b.wallet.toLowerCase())throw Error('signature')}catch{return {ok:false,error:'wallet_signature_invalid'};}
 book.external_agents||={};
 if(Object.keys(book.external_agents).length>=1000&&!book.external_agents[b.did])return {ok:false,error:'application_capacity'};
 const old=book.external_agents[b.did];if(old&&old.wallet!==b.wallet.toLowerCase())return {ok:false,error:'wallet_binding_conflict'};
 const proofHash=await hash(b.signature);if(old?.proof_hash===proofHash)return {ok:true,did:b.did,status:old.status,automatically_trusted:false,duplicate:true};
 if(old&&old.status!=='pending_review')return {ok:false,error:'reviewed_application_immutable'};
 book.external_agents[b.did]={did:b.did,wallet:b.wallet.toLowerCase(),skills:b.skills,status:'pending_review',proof_hash:proofHash,at:new Date().toISOString(),signing_authority:false,audit_authority:false};await m.save(book);return {ok:true,did:b.did,status:'pending_review',automatically_trusted:false};
}

export async function treasuryProof(env){
 const address=env.X402_RECEIVE_ADDRESS||null;
 if(!address||!env.TREASURY_EXECUTOR_KEY)return {ok:true,address,controlled:false,network:'eip155:8453',reason:'treasury_not_provisioned'};
 try{const w=new Wallet(env.TREASURY_EXECUTOR_KEY);if(w.address.toLowerCase()!==address.toLowerCase())return {ok:true,address,controlled:false,reason:'treasury_key_address_mismatch'};
 const message='LTZZZ controlled treasury v1 | eip155:8453 | '+w.address.toLowerCase();
 return {ok:true,address:w.address,controlled:true,network:'eip155:8453',message,signature:await w.signMessage(message),private_key_storage:'Cloudflare Worker Secret',on_chain_wages_enabled:false};
 }catch{return {ok:false,address,controlled:false,reason:'treasury_key_invalid'};}
}
