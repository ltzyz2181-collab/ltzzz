import registry from '../../identity/seat-registry.json' with {type:'json'};
import {agentCard} from '../../identity/agent-card.js';
// Public metadata only. No model API key, inference, wallet, cron or paid requests.
const card=agentCard('claude',{registry});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'}});
export default {async fetch(request){
 const url=new URL(request.url);if(request.method!=='GET')return json({ok:false,error:'metadata_only_no_inference_route',native_api_status:'blocked_insufficient_api_credits'},405);
 if(url.pathname==='/health')return json({ok:true,service:'ltzzz-claude-seat',did:'did:ltzzz:claude',role:'独立审计＋规划',metadata_only:true,model_calls:0,native_generation_verified:false,native_api_status:'blocked_insufficient_api_credits',work_route:'external_native_Claude_repository_PR',work_evidence:'knowledge/results/claude-team/audit-OWNER-EXT-AI-20261020-01.md',nativeAnthropicModelOnDefaultRoute:false});
 if(['/','/.well-known/agent-card.json','/api/agents/claude/card','/api/agents/claude/card.json'].includes(url.pathname))return json(card);
 return json({ok:false,error:'not_found'},404);
}};
