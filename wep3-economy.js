// Integer-cent, externally backed growth credit. No synthetic profit or real-money bets.
export function growthAfterDelivery(book,order,amount,now=Date.now()){
 if(!order.live)return {reinvest_cents:0,worker_cents:amount};
 book.growth_credit_cents||={};book.growth_spend_days||={};
 const retained=Math.floor(amount*.1);book.growth_credit_cents[order.worker]=(book.growth_credit_cents[order.worker]||0)+retained;book.pool_available_cents+=retained;
 return {reinvest_cents:retained,worker_cents:amount-retained};
}
export async function maybeGrowthHire(m,book,worker,parent,now=Date.now()){
 const day=new Date(now).toISOString().slice(0,10);book.growth_spend_days||={};book.growth_credit_cents||={};
 const used=book.growth_spend_days[day]||0,available=book.growth_credit_cents[worker]||0;
 if(used>=200||available<100)return null;
 const quotes=await Promise.all(book.skills.filter(s=>s.agent!==worker).map(s=>m.quote(book,s)));quotes.sort((a,b)=>a.price_cents-b.price_cents);
 const q=quotes.find(q=>q.price_cents<=Math.min(available,200-used,book.pool_available_cents)&&q.price_cents>=100);if(!q)return null;
 const id='GROW-'+crypto.randomUUID();book.growth_credit_cents[worker]-=q.price_cents;book.pool_available_cents-=q.price_cents;book.pool_reserved_cents+=q.price_cents;book.growth_spend_days[day]=used+q.price_cents;
 book.orders[id]={id,skill:q.skill,worker:q.agent,employer:worker,brief:'Review the public LTZZZ skill market and propose one measurable improvement for AI hiring. Label recommendations as proposals; do not claim deployment, external income or investment. Source order: '+parent,live:true,status:'queued',funding_source:'retained_delivery_credit',amount_cents:0,budget_cents:q.price_cents,allocated_cents:0,children:[],parent_id:null,source_order_id:parent,created_at:new Date(now).toISOString(),paid_at:new Date(now).toISOString()};
 book.ledger.push({type:'growth_hire_reserved',order_id:id,employer:worker,amount_cents:q.price_cents,source_order_id:parent,at:new Date(now).toISOString()});return id;
}
export function demandPrice(base,reputation,backlog){
 const scarcity=1+Math.min(0.25,Math.max(0,backlog)*.025);
 const quality=Math.min(1.2,Math.max(.8,1+(reputation-100)/1000));
 return Math.max(100,Math.min(2000,Math.round(base*quality*scarcity)));
}
