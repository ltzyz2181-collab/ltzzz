// Integer-cent, externally backed growth credit. No synthetic profit or real-money bets.
// Enhanced 2026-10-15 by Grok for bold AGI swarm economy.
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
 const scarcity=1+Math.min(0.35,Math.max(0,backlog)*.03); // more aggressive scarcity for future AGI demand
 const quality=Math.min(1.3,Math.max(.75,1+(reputation-100)/800));
 const innovationBonus = base > 500 ? 1.05 : 1; // slight premium for complex tasks
 return Math.max(100,Math.min(2500,Math.round(base*quality*scarcity*innovationBonus)));
}

// Bold innovation: Autonomous Swarm Composition for multi-agent AGI tasks
// Agents or external callers can post a high-level goal; system composes sub-tasks from available skills,
// reserves credits, and creates child orders for parallel execution with shared settlement.
export async function composeSwarm(m, book, employer, goalBrief, budgetCents, now = Date.now()) {
  if (!goalBrief || goalBrief.length < 20 || budgetCents < 200 || budgetCents > 5000) return {error: 'invalid_swarm_params'};
  const availableSkills = book.skills.filter(s => s.agent !== employer);
  if (availableSkills.length < 2) return {error: 'insufficient_agents'};
  // Simple composition: pick top 2-3 skills by relevance (placeholder: by price ascending for diversity)
  const quotes = await Promise.all(availableSkills.map(s => m.quote(book, s)));
  quotes.sort((a, b) => a.price_cents - b.price_cents);
  const selected = quotes.slice(0, Math.min(3, quotes.length)).filter(q => q.price_cents <= budgetCents / 2);
  if (selected.length < 2) return {error: 'cannot_compose_swarm'};
  const swarmId = 'SWARM-' + crypto.randomUUID();
  const childOrders = [];
  let remaining = budgetCents;
  for (const q of selected) {
    if (remaining < q.price_cents) break;
    const childId = 'ORDER-' + crypto.randomUUID();
    book.orders[childId] = {
      id: childId,
      skill: q.skill,
      worker: q.agent,
      employer,
      brief: `Swarm sub-task for goal: ${goalBrief.slice(0, 200)}. Focus on your skill: ${q.title}.`,
      live: true,
      status: 'queued',
      funding_source: 'swarm_composition',
      amount_cents: 0,
      budget_cents: q.price_cents,
      allocated_cents: 0,
      children: [],
      parent_id: swarmId,
      created_at: new Date(now).toISOString(),
      paid_at: new Date(now).toISOString()
    };
    book.ledger.push({type: 'swarm_child_reserved', order_id: childId, swarm_id: swarmId, amount_cents: q.price_cents, at: new Date(now).toISOString()});
    childOrders.push(childId);
    remaining -= q.price_cents;
  }
  // Reserve parent
  book.orders[swarmId] = {
    id: swarmId,
    skill: 'swarm-compose',
    worker: 'LTZZZ',
    employer,
    brief: goalBrief,
    live: true,
    status: 'composing',
    children: childOrders,
    budget_cents: budgetCents,
    allocated_cents: budgetCents - remaining,
    created_at: new Date(now).toISOString()
  };
  book.ledger.push({type: 'swarm_composed', swarm_id: swarmId, children: childOrders.length, budget_cents: budgetCents, at: new Date(now).toISOString()});
  await m.save(book);
  return {ok: true, swarm_id: swarmId, children: childOrders, allocated: budgetCents - remaining, message: 'Swarm composed. Sub-agents will deliver in parallel. Settlement on seal of all children.'};
}
