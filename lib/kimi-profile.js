// Owner-selected quality profile; provider limits remain enforced by the provider.
export const KIMI_PROFILE={revision:'kimi-quality-v2',minimum_output_tokens:3000,default_output_tokens:16384,application_output_ceiling:null,application_concurrency_limit:null,application_min_interval_ms:0,model_policy:'highest_verified_available'};
export function kimiTokens(requested){
 if(requested===undefined||requested===null)return KIMI_PROFILE.default_output_tokens;
 if(!Number.isSafeInteger(requested)||requested<1)throw Error('invalid_kimi_output_budget');
 return Math.max(KIMI_PROFILE.minimum_output_tokens,requested);
}
export function selectKimiModel(ids,requested='auto'){
 if(!Array.isArray(ids)||ids.some(x=>typeof x!=='string'))throw Error('invalid_model_catalogue');
 if(requested!=='auto'){if(!ids.includes(requested))throw Error('requested_model_not_available');return requested;}
 // Explicit capability order, verified against this account's official catalogue.
 const model=['kimi-k3','kimi-k2.7-code','kimi-k2.7-code-highspeed','kimi-k2.6','kimi-k2.5','kimi-k2-turbo-preview','kimi-k2-0905-preview','kimi-k2'].find(x=>ids.includes(x));
 if(!model)throw Error('no_supported_model_in_official_catalogue');return model;
}
