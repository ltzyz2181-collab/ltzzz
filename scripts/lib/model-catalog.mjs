import {selectKimiModel} from '../../lib/kimi-profile.js';
import {qwenConfig} from './qwen-config.mjs';
export function catalogProviders(env = process.env) {
  let q; try {q=qwenConfig(env);} catch {q={key:'',model:env.DASHSCOPE_MODEL||'qwen-plus',configuration_error:true};}
  return [
    {seat:'qianwen',base:q.base,key:q.key,selected_model:q.model,configuration_error:q.configuration_error},
    {seat:'deepseek',base:'https://api.deepseek.com/v1',key:env.DEEPSEEK_API_KEY,selected_model:env.DEEPSEEK_MODEL||'deepseek-v4-pro'},
    {seat:'doubao',base:'https://ark.cn-beijing.volces.com/api/v3',key:env.DOUBAO_API_KEY||env.ARK_API_KEY,selected_model:env.DOUBAO_MODEL||'doubao-seed-2-1-pro-260915'},
    {seat:'kimi_cn',base:'https://api.moonshot.cn/v1',key:env.MOONSHOT_API_KEY_CN,selected_model:'auto'},
    {seat:'kimi_global',base:'https://api.moonshot.ai/v1',key:env.KIMI_API_KEY,selected_model:env.KIMI_MODEL||'kimi-k2.6'},
    {seat:'grok',base:'https://api.x.ai/v1',key:env.XAI_API_KEY,selected_model:env.XAI_MODEL||null}
  ];
}
export async function inspectCatalog(provider,{fetchImpl=fetch,previous}={}) {
  const row={seat:provider.seat,key_present:!!provider.key,selected_model:provider.selected_model,model_calls:0,generation_verified:false};
  if(provider.configuration_error)return {...row,status:'configuration_error'};
  if(!provider.key)return {...row,status:'missing_secret'};
  try {
    const response=await fetchImpl(provider.base+'/models',{headers:{Authorization:'Bearer '+provider.key},redirect:'error',signal:AbortSignal.timeout(15000)});
    row.models_http=response.status;
    const body=await response.json().catch(()=>null);
    if(!response.ok)return {...row,status:response.status===401?'authentication_error':'catalogue_error'};
    const items=body?.data||body?.items;
    if(!Array.isArray(items))return {...row,status:'invalid_catalogue_response'};
    row.model_ids=[...new Set(items.map(x=>x?.id||x?.model).filter(x=>typeof x==='string'&&!x.includes(provider.key)))].sort();
    row.catalogue_complete=!body.has_more&&!body.next&&!body.next_page_token;
    if(provider.seat==='kimi_cn'&&provider.selected_model==='auto'){try{row.selected_model=selectKimiModel(row.model_ids);row.model_selection_policy='highest_verified_available';}catch{row.selection_blocker='no_supported_model_in_official_catalogue';}}
    row.selected_model_listed=row.selected_model?row.model_ids.includes(row.selected_model):null;
    row.status='catalogue_verified_no_generation';
    row.added_model_ids=previous?.model_ids?row.model_ids.filter(id=>!previous.model_ids.includes(id)):[];
    row.removed_model_ids=row.catalogue_complete&&previous?.catalogue_complete?previous.model_ids.filter(id=>!row.model_ids.includes(id)):[];
    row.comparison=previous?.model_ids?'compared_with_prior_snapshot_not_release_date_order':'first_observation_no_update_claim';
    row.automatic_model_change=false;
  } catch {row.status='network_or_timeout';}
  return row;
}

// Preserve the existing balance probes, without assuming all providers expose one.
export async function inspectBalance(provider,fetchImpl=fetch) {
  if(!provider.key||!['deepseek','kimi_cn'].includes(provider.seat))return {};
  const url=provider.seat==='deepseek'?'https://api.deepseek.com/user/balance':provider.base+'/users/me/balance';
  try {
    const r=await fetchImpl(url,{headers:{Authorization:'Bearer '+provider.key},redirect:'error',signal:AbortSignal.timeout(15000)});
    const b=await r.json().catch(()=>null),result={balance_http:r.status};
    const scalar=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value)?value:null;
    if(r.ok)result.balance=provider.seat==='deepseek'?(Array.isArray(b?.balance_infos)?b.balance_infos.map(x=>({currency:['CNY','USD'].includes(x.currency)?x.currency:null,total_balance:scalar(x.total_balance),granted_balance:scalar(x.granted_balance),topped_up_balance:scalar(x.topped_up_balance)})):[]):{available_balance:scalar(b?.available_balance??b?.data?.available_balance),cash_balance:scalar(b?.cash_balance??b?.data?.cash_balance),voucher_balance:scalar(b?.voucher_balance??b?.data?.voucher_balance)};
    return result;
  }catch{return {balance_status:'network_or_timeout'};}
}
