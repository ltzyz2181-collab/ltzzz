// Defaults are configuration, not proof of upstream model availability or generation.
export function modelConfiguration(model,{source='worker_default',override=false}={}){
 return {model_configuration_revision:'model-configuration-v2',model_configured:typeof model==='string'&&!!model.trim(),configured_model:model||null,model_config_source:source,model_override_configured:override,generation_verified:false};
}
