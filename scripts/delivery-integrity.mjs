export function assessDelivery({output='',finish_reason=null}){
  const text=String(output).trim();
  if(!text)return {status:'incomplete',reason:'empty_output'};
  if(['length','max_tokens','content_filter'].includes(finish_reason))return {status:'incomplete',reason:'provider_'+finish_reason};
  if(!['stop','end_turn'].includes(finish_reason))return {status:'unverified',reason:'missing_or_unknown_finish_reason'};
  if(!text.endsWith('【交付结束】'))return {status:'incomplete',reason:'completion_marker_missing'};
  return {status:'structurally_complete',reason:'normal_stop_and_completion_marker',accepted:false};
}
