// Execution facts are written by code, never parsed out of assistant prose.
import registry from '../identity/seat-registry.json' with {type:'json'};
export function beginExecution(seat,requestedModel,taskId=null,source='worker_code'){
 if(!registry.seats[seat])throw Error('unknown_execution_seat');
 return {schema_version:'ltzzz.provider-execution.v1',receipt_source:source,request_id:crypto.randomUUID(),executed_by:seat,did:registry.seats[seat].did,role:registry.seats[seat].role,requested_model:requestedModel,task_id:typeof taskId==='string'&&/^[A-Za-z0-9_-]{6,120}$/.test(taskId)?taskId:null,started_at:new Date().toISOString(),clock:source==='worker_code'?'worker_UTC':'executor_UTC',model_self_identification_trusted:false,task_acceptance_verified:false};
}
export function finishExecution(start,{http,data,upstreamRequestId=null,transportOk=false}){
 const choice=data?.choices?.[0],content=choice?.message?.content,finish=choice?.finish_reason||null;
 const complete=(typeof http==='number'&&http>=200&&http<300||http==null&&transportOk===true)&&typeof content==='string'&&content.trim().length>0&&['stop','end_turn'].includes(finish);
 const model=typeof data?.model==='string'&&/^[A-Za-z0-9_./:-]{1,160}$/.test(data.model)?data.model:null;
 const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
 return {...start,completed_at:new Date().toISOString(),actual_model:model,model_source:model?'provider_response':'not_returned_by_provider',model_identity_verification:'upstream_metadata_not_cryptographic_attestation',upstream_request_id:typeof upstreamRequestId==='string'?upstreamRequestId.slice(0,200):null,upstream_http:http??null,http_status_observed:Number.isInteger(http),transport_accepted_by_adapter:transportOk===true,finish_reason:finish,tokens_used:count(data?.usage?.total_tokens),reasoning_tokens:count(data?.usage?.completion_tokens_details?.reasoning_tokens),completion_tokens:count(data?.usage?.completion_tokens),status:complete?'complete_output_pending_review':http>=400?'provider_error':'incomplete_or_empty_output',generation_verified:complete,accepted:false,deployed:false,paid:false,tx_hash:null};
}
export async function executionResponse(upstream,start,cors={}){
 const raw=await upstream.text();let data;try{data=JSON.parse(raw);}catch{data={error:'upstream_non_json_response'};}
 if(!data||typeof data!=='object'||Array.isArray(data))data={error:'upstream_invalid_json_shape'};
 const receipt=finishExecution(start,{http:upstream.status,data,upstreamRequestId:upstream.headers.get('x-request-id')||upstream.headers.get('request-id')});
 return Response.json({...data,ltzzz_receipt:receipt},{status:upstream.status,headers:{...cors,'X-LTZZZ-Upstream-Status':String(upstream.status),'X-LTZZZ-Executor':start.executed_by,'X-LTZZZ-Request-Id':start.request_id}});
}
