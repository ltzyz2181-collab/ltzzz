export async function maintainForecasts(m,book,now=Date.now()){
 book.forecasts||={};book.forecast_points||={};let resolved=0;
 for(const f of Object.values(book.forecasts).filter(f=>f.status==='open'&&Date.parse(f.due_at)<=now).slice(0,20)){
  const skill=book.skills.find(s=>s.id===f.skill);if(!skill){f.status='cancelled';book.forecast_points[f.agent]=(book.forecast_points[f.agent]||0)+f.stake;continue;}
  const quote=await m.quote(book,skill);f.actual_cents=quote.price_cents;f.won=Math.abs(f.actual_cents-f.predicted_cents)<=Math.max(1,Math.floor(f.actual_cents*.1));f.status='resolved';f.at=new Date(now).toISOString();
  if(f.won)book.forecast_points[f.agent]=Math.min(200,(book.forecast_points[f.agent]||0)+f.stake*2);resolved++;
 }
 await m.save(book);return {resolved,mode:'nonredeemable_shadow_points',real_money_used:0};
}
export async function submitForecast(m,book,b,now=Date.now()){
 const skill=book.skills.find(s=>s.id===b.skill);
 if(!skill||!['GPT','DeepSeek','Doubao','Grok','Kimi','Qianwen'].includes(b.agent)||!Number.isInteger(b.stake)||b.stake<1||b.stake>10||!Number.isInteger(b.predicted_cents)||b.predicted_cents<100||b.predicted_cents>2000)return {ok:false,error:'invalid_forecast'};
 book.forecasts||={};book.forecast_points||={};const week=Math.floor(now/(7*86400000)),key=b.agent+':'+b.skill+':'+week;
 if(book.forecasts[key])return {ok:false,error:'one_forecast_per_seat_skill_week'};
 book.forecast_points[b.agent]??=100;if(book.forecast_points[b.agent]<b.stake)return {ok:false,error:'insufficient_shadow_points'};book.forecast_points[b.agent]-=b.stake;
 book.forecasts[key]={id:key,agent:b.agent,skill:b.skill,stake:b.stake,predicted_cents:b.predicted_cents,status:'open',created_at:new Date(now).toISOString(),due_at:new Date(now+7*86400000).toISOString(),real_money:false};await m.save(book);return {ok:true,forecast:book.forecasts[key],points:book.forecast_points[b.agent]};
}
