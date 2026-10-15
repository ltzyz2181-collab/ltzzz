// Only visible answer text is retained. Reasoning deltas are never persisted.
export async function readDeepSeekResponse(response,{requestedModel,onProgress=async()=>{}}){
 const state={model:requestedModel,model_source:'requested_model',request_id:response.headers.get('x-request-id')||response.headers.get('x-ds-request-id')||null,completion_id:null,finish_reason:null,tokens_used:null,partial_output:'',stream_complete:false};
 let checkpointFailed=false;
 const checkpoint=async()=>{try{await onProgress({...state});}catch{checkpointFailed=true;throw Error('checkpoint_failed');}};
 const apply=data=>{
  if(data.error)throw Error('provider_stream_error');
  if(typeof data.model==='string'&&data.model){state.model=data.model;state.model_source='provider_response';}
  if(typeof data.id==='string')state.completion_id=data.id;
  if(Number.isFinite(data.usage?.total_tokens)&&data.usage.total_tokens>=0)state.tokens_used=data.usage.total_tokens;
  const choice=data.choices?.find(c=>(c.index??0)===0);
  if(choice?.finish_reason)state.finish_reason=choice.finish_reason;
  if(typeof choice?.delta?.content==='string')state.partial_output+=choice.delta.content;
 };
 let reader;
 try{
  await checkpoint();
  // Some compatible endpoints return a complete JSON response despite stream:true.
  if(!response.headers.get('content-type')?.includes('text/event-stream')){
   const data=await response.json();apply(data);
   state.partial_output=typeof data.choices?.[0]?.message?.content==='string'?data.choices[0].message.content:'';
   state.stream_complete=true;await checkpoint();
  }else{
   if(!response.body)throw Error('missing_stream_body');
   reader=response.body.getReader();
   const decoder=new TextDecoder();let buffer='',dataLines=[],done=false,totalBytes=0;
   const line=async value=>{
    if(value===''){
     if(!dataLines.length)return;
     const payload=dataLines.join('\n');dataLines=[];
     if(payload==='[DONE]'){done=true;return;}
     apply(JSON.parse(payload));await checkpoint();
    }else if(value.startsWith('data:'))dataLines.push(value.slice(5).replace(/^ /,''));
   };
   while(!done){
    const part=await reader.read();
    if(part.done){buffer+=decoder.decode();break;}
    totalBytes+=part.value.byteLength;if(totalBytes>8*1024*1024)throw Error('stream_size_limit');
    buffer+=decoder.decode(part.value,{stream:true});
    let end;while(!done&&(end=buffer.indexOf('\n'))!==-1){const value=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);await line(value);}
   }
   if(!done){if(buffer)await line(buffer.replace(/\r$/,''));await line('');}
   // An EOF/transport failure after a stop chunk is still incomplete without DONE.
   state.stream_complete=done;await checkpoint();
  }
  const output=state.partial_output.trim(),complete=state.stream_complete&&['stop','end_turn'].includes(state.finish_reason)&&!!output;
  return {...state,ok:complete,status:complete?'success':!state.stream_complete?'stream_incomplete':!output?'empty_output':'incomplete_output',output:complete?output:'',automatic_retry_allowed:false};
 }catch(error){
  // Preserve prior answer text and metadata; never retry an uncertain paid request.
  const result={...state,ok:false,status:checkpointFailed?'checkpoint_failed':'stream_interrupted',stream_complete:false,output:'',automatic_retry_allowed:false,error:checkpointFailed?'checkpoint_failed':error?.message==='provider_stream_error'?'provider_stream_error':'response_read_failed'};
  if(!checkpointFailed){try{await onProgress({...result});}catch{result.status='checkpoint_failed';result.error='checkpoint_failed';}}
  return result;
 }finally{
  if(reader){try{await reader.cancel();}catch{}reader.releaseLock();}
  else{try{await response.body?.cancel();}catch{}}
 }
}
