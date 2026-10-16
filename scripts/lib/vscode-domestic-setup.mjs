import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
export const TEMPLATE='config/vscode/deepseek.chatLanguageModels.template.json';
const ENDPOINT='https://api.deepseek.com/v1/chat/completions';
export function validateDomesticTemplate(config){
 if(!Array.isArray(config)||config.length!==1)throw Error('single_provider_template_required');
 const p=config[0],allowedProvider=['name','vendor','apiKey','apiType','models'];
 if(p.vendor!=='customendpoint'||p.apiType!=='chat-completions'||p.apiKey!=='${input:ltzzzDeepSeekApiKey}'||Object.keys(p).some(k=>!allowedProvider.includes(k)))throw Error('secret_reference_and_fixed_provider_required');
 if(!Array.isArray(p.models)||p.models.length!==2||new Set(p.models.map(m=>m.id)).size!==2)throw Error('expected_two_models');
 for(const m of p.models){
  if(!['deepseek-v4-pro','deepseek-flash'].includes(m.id)||m.url!==ENDPOINT)throw Error('official_endpoint_and_model_required');
  if(m.toolCalling!==true||m.vision!==false||m.maxInputTokens!==65536||m.maxOutputTokens!==8192||JSON.stringify(m.modelOptions)!==JSON.stringify({thinking:{type:'disabled'}}))throw Error('bounded_text_tool_profile_required');
  if(Object.keys(m).some(k=>!['id','name','url','toolCalling','vision','maxInputTokens','maxOutputTokens','modelOptions'].includes(k)))throw Error('unsupported_model_override');
 }
 return {provider:p.name,models:p.models.map(m=>m.id),credential_mode:'VS_Code_secret_input_reference',endpoint:ENDPOINT};
}
export function prepareDomesticSetup({root=process.cwd()}={}){
 const raw=fs.readFileSync(path.join(root,TEMPLATE),'utf8'),summary=validateDomesticTemplate(JSON.parse(raw));
 const relative='.ltzzz-tools/vscode-domestic',dir=path.join(root,relative);fs.mkdirSync(dir,{recursive:true});
 const output=path.join(dir,'chatLanguageModels.template.json');
 // Refuse to overwrite any existing file: it could have been edited on the PC.
 let created=true;try{fs.writeFileSync(output,raw,{encoding:'utf8',flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;created=false;}
 const receipt={at:new Date().toISOString(),status:'prepared_not_installed',template_source:TEMPLATE,template_sha256:createHash('sha256').update(raw).digest('hex'),output:relative+'/chatLanguageModels.template.json',output_created:created,existing_output_preserved:!created,...summary,
  current_template_validated:true,existing_output_validated:created,model_calls:0,credentials_read:false,credentials_written:false,VS_Code_user_settings_modified:false,actual_VS_Code_model_selection_verified:false,actual_tool_call_verified:false,native_openai_calls:0,native_anthropic_calls:0,paid:false,tx_hash:null};
 fs.writeFileSync(path.join(dir,'prepare.json'),JSON.stringify(receipt,null,2)+'\n',{encoding:'utf8',mode:0o600});return receipt;
}
