export function inactiveDailySeats(config){
 const tasks=Array.isArray(config?.tasks)?config.tasks:[];
 return tasks.filter(t=>['disabled_by_owner','external_discussion_only','external_daily_return'].includes(t.status)).map(t=>({agent:t.agent,status:t.status,task:t.task,expected_daily_model_delivery:false,native_model_calls:0,output_preview:t.status==='external_discussion_only'?'外部免费讨论席；未收到正式交付，不视为生成失败。':t.status==='external_daily_return'?'每日回归工单等待外部接单；探针不代表原生执行。':'原厂付费日课已按owner决定停用；逻辑总控由国内执行器接续。'}));
}
