import {anchorSnapshot} from './wep3-anchor.js';
import {submitForecast,maintainForecasts} from './wep3-forecast.js';
import {standardX402,resumeMachineOrder} from './wep3-x402.js';
import {growthAfterDelivery,maybeGrowthHire,demandPrice} from './wep3-economy.js';
import {agentApplication,treasuryProof} from './wep3-agents.js';
import {liveReady,receiverReady,verifyBaseTransfer} from './wep3-base-payment.js';
// External orders use one Durable Object and integer USD cents, separate from legacy credit.
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-Lab-Pin,X-Order-Token,Stripe-Signature,X-Payment,X-X402-Proof,Idempotency-Key,PAYMENT-SIGNATURE','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Expose-Headers':'PAYMENT-REQUIRED,PAYMENT-RESPONSE'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
export const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const agents=['Grok','Doubao','DeepSeek','Qianwen','Kimi','GPT'];
const defaults=[{id:'signal',agent:'Grok',title:'Research report',price_cents:400},{id:'copy',agent:'Doubao',title:'Video script',price_cents:300},{id:'scan',agent:'DeepSeek',title:'Strategy report',price_cents:500},{id:'audit',agent:'GPT',title:'Quality review',price_cents:200}];
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
export async function stripeSignature(raw,header,secret,now=Date.now()){
  if(!secret||!header)return false;
  const parts=header.split(',').map(x=>x.split('=')),t=parts.find(x=>x[0]==='t')?.[1];
  if(!/^\d+$/.test(t||'')||Math.abs(now/1000-Number(t))>300)return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+raw)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  return parts.some(([k,v])=>{if(k!=='v1'||!v||v.length!==64)return false;let diff=0;for(let i=0;i<64;i++)diff|=v.charCodeAt(i)^signature.charCodeAt(i);return diff===0;});
}
export async function marketRoute(request,env){
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/market/')&&path!=='/skill/register')return null;
  if(request.method==='OPTIONS')return reply({ok:true});
  if(!env.MARKET)return reply({ok:false,error:'market_storage_not_deployed'},503);
  // Always replace caller context; only this Worker can supply current deployment secrets to its DO.
  const forwarded=new Headers(request.headers);const context={};for(const key of ['LAB_PIN','WEP3_RUNNER_TOKEN','TREASURY_EXECUTOR_KEY','X402_RECEIVE_ADDRESS','X402_LIVE','BASE_RPC_URL','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'])context[key]=env[key]||'';forwarded.set('X-LTZZZ-Worker-Context',JSON.stringify(context));
  return env.MARKET.get(env.MARKET.idFromName('ltzzz-market-v1')).fetch(new Request(request,{headers:forwarded}));
}
export class Market {
  constructor(state,env){this.state=state;this.env=env;this.tail=Promise.resolve();}
  fetch(request){const task=this.tail.then(()=>this.handle(request)).catch(()=>reply({ok:false,error:'market_exception'},500));this.tail=task.then(()=>{});return task;}
  admin(request){const supplied=request.headers.get('X-Lab-Pin');return Boolean(supplied&&((this.env.LAB_PIN&&supplied===this.env.LAB_PIN)||(this.env.WEP3_RUNNER_TOKEN&&supplied===this.env.WEP3_RUNNER_TOKEN)));}
  async read(){return await this.state.storage.get('book')||{skills:defaults,tape:[],orders:{},events:{},live_revenue_cents:0,test_revenue_cents:0,pool_available_cents:0,pool_reserved_cents:0,agent_credit_cents:{},ledger:[],x402_challenges:{}};}
  async save(book){await this.state.storage.put('book',book);}
  async score(agent){let row=await this.env.PAY_KV?.get('wep3:rep:'+agent,'json');return Number(row?.score??100);}
  async quote(book,skill){const tape=book.tape.filter(x=>x.skill===skill.id&&x.live).slice(-21).map(x=>x.price_cents).sort((a,b)=>a-b);let median=tape.length?(tape[Math.floor((tape.length-1)/2)]+tape[Math.ceil((tape.length-1)/2)])/2:skill.price_cents;const reputation=await this.score(skill.agent);const backlog=Object.values(book.orders).filter(o=>o.skill===skill.id&&o.live&&['queued','processing'].includes(o.status)).length;return {skill:skill.id,agent:skill.agent,title:skill.title,reputation,price_cents:demandPrice(median,reputation,backlog),backlog,currency:'usd',price_source:tape.length?'live_trade_median_and_reputation':'registered_price_and_reputation'};}
  publicOrder(order){const {access_hash,lease_token,payment_payload,payment_signature_hash,requirements,...visible}=order;return visible;}
  async handle(request){
    const context=request.headers.get('X-LTZZZ-Worker-Context');if(context){const current=JSON.parse(context);this.env={...this.env,...current};}
    const u=new URL(request.url),p=u.pathname,book=await this.read();
    if(p==='/market/runner/readiness'&&request.method==='GET')return reply({ok:true,authenticated:this.admin(request),runner_configured:Boolean(this.env.WEP3_RUNNER_TOKEN),runner_type:typeof this.env.WEP3_RUNNER_TOKEN,supplied_length:(request.headers.get('X-Lab-Pin')||'').length,runner_length:String(this.env.WEP3_RUNNER_TOKEN||'').length});
    if(p==='/market/treasury'&&request.method==='GET')return reply(await treasuryProof(this.env));
    if(p.startsWith('/market/skill/'))return standardX402(this,request,book);
    if(p==='/market/agents/apply'&&request.method==='POST'){const result=await agentApplication(this,request,book);return reply(result,result.ok?202:422);}
    if(p==='/market/forecast'&&request.method==='POST'){if(!this.admin(request))return reply({ok:false,error:'pin_required'},401);const r=await submitForecast(this,book,await request.json());return reply(r,r.ok?200:422);}
    if(p==='/market/economy/maintain'&&request.method==='POST'){if(!this.admin(request))return reply({ok:false,error:'pin_required'},401);return reply({ok:true,...await maintainForecasts(this,book)});}
    if(p==='/market/economy'&&request.method==='GET')return reply({ok:true,growth_credit_cents:book.growth_credit_cents||{},growth_daily_cap_cents:200,pricing:'live median + bounded backlog curve + reputation',forecast_mode:'shadow_only',live_revenue_cents:book.live_revenue_cents,automatic_wallet_signing:false});
    if(p==='/market/payments/reconcile'&&request.method==='POST'){if(!this.admin(request))return reply({ok:false,error:'pin_required'},401);const pending=Object.values(book.orders).filter(o=>o.payment_rail==='x402_v2'&&['settlement_pending','settlement_unknown'].includes(o.status)).slice(0,5);const checks=[];for(const o of pending)checks.push({order_id:o.id,...await resumeMachineOrder(this,book,o)});return reply({ok:true,checks});}
    if((p==='/market/receipts/snapshot'&&request.method==='GET')||(p==='/market/receipts/anchor'&&request.method==='POST')){const receipts=Object.values(book.orders).filter(o=>o.status==='delivered'&&o.live).map(o=>({order_id:o.id,worker:o.worker,auditor:o.receipt.auditor,deliverable_sha256:o.receipt.deliverable_sha256,reasoning_hash:o.receipt.reasoning_hash,at:o.receipt.at})).sort((a,b)=>a.order_id.localeCompare(b.order_id));const reputations=await Promise.all(agents.map(async agent=>({agent,score:await this.score(agent)})));const root=await hash(JSON.stringify({receipts,reputations}));if(p.endsWith('/anchor')){if(!this.admin(request))return reply({ok:false,error:'pin_required'},401);return reply(await anchorSnapshot(this,book,{root,receipts,reputations}));}return reply({ok:true,root,receipts,reputations,on_chain:false,standard:'LTZZZ snapshot v1; not ERC-8004 registration'});}
    if(p==='/market/catalog'&&request.method==='GET')return reply({ok:true,version:'2.2',quotes:await Promise.all(book.skills.map(s=>this.quote(book,s))),rails:{stripe:{configured:Boolean(this.env.STRIPE_SECRET_KEY&&this.env.STRIPE_WEBHOOK_SECRET),mode:this.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')?'live':'test'},x402:{configured:liveReady(this.env),status:liveReady(this.env)?'v2_exact_base':'treasury_not_ready',facilitator:'https://facilitator.payai.network',network:'eip155:8453',asset:'USDC'},base_usdc:{configured:liveReady(this.env),status:liveReady(this.env)?'direct_transfer_receipt_verification':'simulation_only',receiver_ready:receiverReady(this.env)},solana_usdc:{configured:false,status:'not_implemented'},alipay:{configured:false,status:'not_implemented'}},live_revenue_cents:book.live_revenue_cents,test_revenue_cents:book.test_revenue_cents,settlement:liveReady(this.env)?'verified external payment backs internal credit; wages not sent on chain':'simulation only; no external funding or on-chain wages'});
    // --- x402 simulated endpoints (machine-native micropayment placeholders) ---
    if(p==='/market/x402/challenge'&&request.method==='POST'){
      const b=await request.json().catch(()=>({}));
      const skill=book.skills.find(s=>s.id===b.skill);
      if(!skill||typeof b.brief!=='string'||b.brief.trim().length<10||b.brief.length>3000)return reply({ok:false,error:'skill_and_brief_required'},422);
      const q=await this.quote(book,skill);
      const challengeId='X402-'+crypto.randomUUID();
      const amountUsdc=(q.price_cents/100).toFixed(6);
      const challenge={
        id:challengeId,
        protocol:liveReady(this.env)?'base-usdc-direct-v1':'x402-sim-v0',
        network:'base',
        asset:'USDC',
        amount_usdc:amountUsdc,
        amount_cents:q.price_cents,
        skill:skill.id,
        worker:skill.agent,
        brief:b.brief,
        pay_to:liveReady(this.env)?this.env.X402_RECEIVE_ADDRESS:'0xSIMULATED_LTZZZ_TREASURY',
        expires_at:new Date(Date.now()+15*60*1000).toISOString(),
        status:'open',
        created_at:new Date().toISOString()
      };
      book.x402_challenges=book.x402_challenges||{};
      book.x402_challenges[challengeId]=challenge;
      const ids=Object.keys(book.x402_challenges);
      if(ids.length>200){ids.slice(0,ids.length-200).forEach(id=>delete book.x402_challenges[id]);}
      await this.save(book);
      return reply({
        ok:true,
        challenge_id:challengeId,
        http_status_intended:402,
        payment_required:{
          protocol:challenge.protocol,
          network:'base',
          asset:'USDC',
          amount:amountUsdc,
          pay_to:challenge.pay_to,
          expires_at:challenge.expires_at,
          memo:'LTZZZ skill '+skill.id
        },
        skill:skill.id,
        worker:skill.agent,
        amount_cents:q.price_cents,
        simulated:!liveReady(this.env),
        next:'POST /market/x402/verify with challenge_id + proof (tx_hash or simulated_token)'
      },402);
    }
    if(p==='/market/x402/verify'&&request.method==='POST'){
      const b=await request.json().catch(()=>({}));
      const ch=book.x402_challenges?.[b.challenge_id];
      if(!ch)return reply({ok:false,error:'challenge_missing'},404);
      if(ch.status!=='open')return reply({ok:false,error:'challenge_not_open',status:ch.status},409);
      if(Date.parse(ch.expires_at)<Date.now()){ch.status='expired';await this.save(book);return reply({ok:false,error:'challenge_expired'},410);}
      const proof=String(b.proof||b.tx_hash||'').trim();
      const validSim=proof.startsWith('sim_')&&proof.length>=12;
      const validHash=/^0x[a-fA-F0-9]{64}$/.test(proof);
      if(!validSim&&!validHash)return reply({ok:false,error:'invalid_proof',hint:'use sim_<token> for simulation or 0x + 64 hex for future real Base USDC tx'},422);
      if(validSim&&!this.admin(request))return reply({ok:false,error:'simulation_requires_admin'},401);
      if(validHash&&book.events['base:'+proof.toLowerCase()])return reply({ok:false,error:'payment_already_used'},409);
      const verified=validHash?await verifyBaseTransfer(this.env,ch,proof):null;
      if(validHash&&!verified.ok)return reply(verified,422);
      const access=token();
      const orderId='ORDER-'+crypto.randomUUID();
      const live=Boolean(verified?.ok);
      const order={id:orderId,skill:ch.skill,worker:ch.worker,brief:ch.brief,amount_cents:ch.amount_cents,currency:'usd',live,status:'queued',created_at:new Date().toISOString(),paid_at:new Date().toISOString(),access_hash:await hash(access),children:[],parent_id:null,payment_rail:live?'base_usdc_direct':'x402_sim',x402_challenge_id:ch.id,x402_proof:proof,budget_cents:Math.floor(ch.amount_cents*.4),allocated_cents:0};
      if(live){order.payment_evidence=verified;book.events['base:'+proof.toLowerCase()]=orderId;}
      book.orders[orderId]=order;
      ch.status='paid';ch.order_id=orderId;ch.proof=proof;ch.paid_at=order.paid_at;
      if(live){book.live_revenue_cents+=order.amount_cents;book.pool_available_cents+=order.amount_cents-order.budget_cents;book.pool_reserved_cents+=order.budget_cents;}
      else book.test_revenue_cents+=order.amount_cents;
      book.ledger.push({type:live?'x402_payment':'x402_sim_payment',order_id:orderId,amount_cents:order.amount_cents,challenge_id:ch.id,proof,at:order.paid_at});
      await this.save(book);
      return reply({ok:true,order_id:orderId,access_token:access,status:'queued',live,simulated:!live,amount_cents:order.amount_cents,message:live?'real Base USDC accepted':'simulated payment accepted; order queued for delivery'});
    }
    if(p==='/skill/register'&&request.method==='POST'){
      if(!this.admin(request))return reply({ok:false,error:'pin_required'},401);
      const b=await request.json();if(!agents.includes(b.agent)||!/^[-a-z0-9]{2,40}$/.test(b.id||'')||typeof b.title!=='string'||b.title.length>120||!Number.isInteger(b.price_cents)||b.price_cents<100||b.price_cents>2000)return reply({ok:false,error:'invalid_skill'},422);
      if(await this.score(b.agent)<80)return reply({ok:false,error:'reputation_below_80'},403);
      const previous=book.skills.find(s=>s.id===b.id);if(previous&&previous.agent!==b.agent)return reply({ok:false,error:'skill_owner_conflict'},409);
      book.skills=book.skills.filter(s=>s.id!==b.id);book.skills.push({id:b.id,agent:b.agent,title:b.title,price_cents:b.price_cents});await this.save(book);return reply({ok:true,quote:await this.quote(book,book.skills.at(-1))});
    }
    if(p==='/market/checkout'&&request.method==='POST'){
      if(!this.env.STRIPE_SECRET_KEY||!this.env.STRIPE_WEBHOOK_SECRET)return reply({ok:false,error:'stripe_not_configured',required:['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET']},503);
      const b=await request.json(),skill=book.skills.find(s=>s.id===b.skill);if(!skill||typeof b.brief!=='string'||b.brief.trim().length<10||b.brief.length>3000)return reply({ok:false,error:'skill_and_brief_required'},422);
      const pending=Object.values(book.orders).filter(o=>o.status==='awaiting_payment');if(pending.length>=1000)return reply({ok:false,error:'pending_order_limit'},429);
      const q=await this.quote(book,skill),id='ORDER-'+crypto.randomUUID(),access=token();
      const live=this.env.STRIPE_SECRET_KEY.startsWith('sk_live_');
      const order={id,skill:skill.id,worker:skill.agent,brief:b.brief,amount_cents:q.price_cents,currency:'usd',live,status:'awaiting_payment',created_at:new Date().toISOString(),access_hash:await hash(access),children:[],parent_id:null};
      book.orders[id]=order;await this.save(book);
      const form=new URLSearchParams({mode:'payment','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(order.amount_cents),'line_items[0][price_data][product_data][name]':'LTZZZ '+skill.title,'line_items[0][quantity]':'1','metadata[order_id]':id,client_reference_id:id,success_url:'https://ltzzz.com/wep3-pay.html?order='+id,cancel_url:'https://ltzzz.com/wep3-pay.html?order='+id});
      const res=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+this.env.STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':id},body:form,signal:AbortSignal.timeout(20000)});const session=await res.json();
      if(!res.ok||!session.id||!session.url){order.status='checkout_failed';await this.save(book);return reply({ok:false,error:'stripe_checkout_failed'},502);}
      order.session_id=session.id;await this.save(book);return reply({ok:true,order_id:id,access_token:access,checkout_url:session.url,live,amount_cents:order.amount_cents});
    }
    if(p==='/market/stripe/webhook'&&request.method==='POST'){
      const raw=await request.text();if(raw.length>300000||!await stripeSignature(raw,request.headers.get('Stripe-Signature'),this.env.STRIPE_WEBHOOK_SECRET))return reply({ok:false,error:'invalid_signature'},400);
      const event=JSON.parse(raw);if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return reply({ok:true,ignored:true});
      const s=event.data?.object,o=book.orders[s?.metadata?.order_id];
      if(!o||s.id!==o.session_id||s.amount_total!==o.amount_cents||s.currency!=='usd'||typeof event.livemode!=='boolean'||event.livemode!==o.live||s.livemode!==o.live)return reply({ok:false,error:'payment_order_mismatch'},422);
      if(s.payment_status!=='paid')return reply({ok:true,ignored:true,reason:'payment_pending'});
      if(book.events[event.id]||o.status!=='awaiting_payment')return reply({ok:true,duplicate:true});
      o.status='queued';o.paid_at=new Date().toISOString();o.budget_cents=Math.floor(o.amount_cents*.4);o.allocated_cents=0;o.payment_event=event.id;book.events[event.id]=o.id;
      if(o.live){book.live_revenue_cents+=o.amount_cents;book.pool_available_cents+=o.amount_cents-o.budget_cents;book.pool_reserved_cents+=o.budget_cents;}else book.test_revenue_cents+=o.amount_cents;
      book.ledger.push({type:o.live?'external_payment':'test_payment',order_id:o.id,amount_cents:o.amount_cents,event_id:event.id,at:o.paid_at});await this.save(book);return reply({ok:true,order_id:o.id,status:o.status,live:o.live});
    }
    if(p==='/market/queue'&&request.method==='GET'){
      if(!this.admin(request))return reply({ok:false,error:'pin_required'},401);
      return reply({ok:true,orders:Object.values(book.orders) .filter(o=>(o.live||u.searchParams.get('test')==='1')&&(o.children||[]).every(id=>book.orders[id]?.status==='delivered')&&['queued','review_failed','processing'].includes(o.status)&&(o.attempts||0)<2&&(!o.lease_until||Date.parse(o.lease_until)<Date.now())).slice(0,10).map(o=>this.publicOrder(o))});
    }
    if(p==='/market/claim'&&request.method==='POST'){
      if(!this.admin(request))return reply({ok:false,error:'pin_required'},401);const b=await request.json(),o=book.orders[b.order_id];
      if(!o||!['queued','review_failed','processing'].includes(o.status)||(o.attempts||0)>=2||(o.lease_until&&Date.parse(o.lease_until)>Date.now()))return reply({ok:false,error:'order_not_claimable'},409);
      o.attempts=(o.attempts||0)+1;o.status='processing';o.lease_token=token();o.lease_until=new Date(Date.now()+600000).toISOString();await this.save(book);return reply({ok:true,lease_token:o.lease_token,order:this.publicOrder(o)});
    }
    if(p==='/market/fail'&&request.method==='POST'){
      if(!this.admin(request))return reply({ok:false,error:'pin_required'},401);const b=await request.json(),o=book.orders[b.order_id];if(!o||o.status!=='processing'||o.lease_token!==b.lease_token)return reply({ok:false,error:'lease_mismatch'},409);
      o.status=(o.attempts||0)>=2?'blocked':'review_failed';o.last_error=String(b.error||'provider_or_audit_failed').slice(0,120);delete o.lease_token;delete o.lease_until;await this.save(book);return reply({ok:true,status:o.status});
    }
    if(p==='/market/subtask'&&request.method==='POST'){
      if(!this.admin(request))return reply({ok:false,error:'pin_required'},401);const b=await request.json(),o=book.orders[b.parent_id],skill=book.skills.find(s=>s.id===b.skill);
      if(!o||!['queued','review_failed'].includes(o.status)||!skill||!Number.isInteger(b.budget_cents)||b.budget_cents<1||b.budget_cents>o.budget_cents-o.allocated_cents||typeof b.brief!=='string'||b.brief.length<10||b.brief.length>3000)return reply({ok:false,error:'invalid_subtask_or_budget'},422);
      let ancestor=o,depth=0;while(ancestor.parent_id){ancestor=book.orders[ancestor.parent_id];depth++;}if(depth>=3||o.children.length>=5)return reply({ok:false,error:'tree_limit'},422);
      const id='SUB-'+crypto.randomUUID();o.allocated_cents+=b.budget_cents;o.children.push(id);book.orders[id]={id,skill:skill.id,worker:skill.agent,brief:b.brief,status:'queued',live:o.live,budget_cents:b.budget_cents,amount_cents:0,allocated_cents:0,parent_id:o.id,children:[],created_at:new Date().toISOString()};await this.save(book);return reply({ok:true,order_id:id});
    }
    if(p==='/market/complete'&&request.method==='POST'){
      if(!this.admin(request))return reply({ok:false,error:'pin_required'},401);const b=await request.json(),o=book.orders[b.order_id];
      if(!o)return reply({ok:false,error:'order_missing'},404);if(o.status==='delivered')return reply({ok:true,duplicate:true,receipt:o.receipt});
      if(!['queued','review_failed','processing'].includes(o.status))return reply({ok:false,error:'order_not_paid'},409);
      if(o.status==='processing'&&o.lease_token!==b.lease_token)return reply({ok:false,error:'lease_mismatch'},409);
      if(o.children.some(id=>book.orders[id].status!=='delivered'))return reply({ok:false,error:'children_not_delivered'},409);
      const audit=b.audit,delivery=b.deliverable;if(typeof delivery!=='string'||delivery.trim().length<80||delivery.length>60000||typeof b.evidence_path!=='string'||typeof b.reasoning_summary!=='string'||b.reasoning_summary.trim().length<20||b.reasoning_summary.length>2000)return reply({ok:false,error:'actual_delivery_and_public_rationale_required'},422);
      const sha256=await hash(delivery);
      if(!audit||audit.accepted!==true||!agents.includes(audit.auditor)||audit.auditor===o.worker||audit.deliverable_sha256!==sha256){o.status='review_failed';o.last_error='independent_audit_required';await this.save(book);return reply({ok:false,error:o.last_error},422);}
      const reason={order_id:o.id,agent:o.worker,amount_cents:o.budget_cents-o.allocated_cents,purpose:o.brief,summary:b.reasoning_summary,evidence_path:b.evidence_path,deliverable_sha256:sha256};
      o.deliverable=delivery;o.audit=audit;o.receipt={order_id:o.id,worker:o.worker,auditor:audit.auditor,deliverable_sha256:sha256,reasoning_hash:await hash(JSON.stringify(reason)),reasoning:reason,evidence_path:b.evidence_path,at:new Date().toISOString(),live_payment:o.live,settlement_mode:o.live?'external_backed_internal_credit':'test_credit',on_chain:false,tx_hash:null};o.status='delivered';delete o.lease_token;delete o.lease_until;
      const amount=o.budget_cents-o.allocated_cents;if(o.live){book.pool_reserved_cents-=amount;const allocation=growthAfterDelivery(book,o,amount);book.agent_credit_cents[o.worker]=(book.agent_credit_cents[o.worker]||0)+allocation.worker_cents;o.receipt.reinvest_cents=allocation.reinvest_cents;}
      if(!o.parent_id&&o.funding_source!=='retained_delivery_credit')book.tape.push({skill:o.skill,price_cents:o.amount_cents,live:o.live});book.tape=book.tape.slice(-1000);
      book.ledger.push({type:'delivery',order_id:o.id,worker:o.worker,amount_cents:amount,live:o.live,receipt:o.receipt});if(o.live)o.receipt.growth_order_id=await maybeGrowthHire(this,book,o.worker,o.id);await this.save(book);return reply({ok:true,receipt:o.receipt});
    }
    if(p.startsWith('/market/order/')&&request.method==='GET'){
      const o=book.orders[p.slice('/market/order/'.length)];if(!o)return reply({ok:false,error:'order_missing'},404);
      if(!this.admin(request)&&(!o.access_hash||await hash(request.headers.get('X-Order-Token')||'')!==o.access_hash))return reply({ok:false,error:'order_token_required'},401);
      return reply({ok:true,order:this.publicOrder(o)});
    }
    return reply({ok:false,error:'not_found'},404);
  }
}
