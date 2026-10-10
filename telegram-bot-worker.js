import {reply,commands,keyboard} from './channels/telegram-content-en.mjs';
const json=(d,status=200)=>new Response(JSON.stringify(d),{status,headers:{'Content-Type':'application/json'}});
async function api(env,method,body){const r=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const d=await r.json();return d;}
const admin=(r,e)=>Boolean(e.BOT_ADMIN_TOKEN)&&r.headers.get('Authorization')==='Bearer '+e.BOT_ADMIN_TOKEN;
export default {async fetch(r,e){const p=new URL(r.url).pathname;try{
if(p==='/health')return json({ok:true,service:'ltzzz-telegram-bot',version:'2.0',has_token:Boolean(e.TELEGRAM_BOT_TOKEN),has_secret:Boolean(e.TELEGRAM_SECRET)});
if(p==='/preview')return json({text:await reply(new URL(r.url).searchParams.get('command')||'start'),reply_markup:keyboard});
if(p==='/configure'&&r.method==='POST'){if(!admin(r,e))return json({error:'unauthorized'},401);const actions={};
for(const [method,body]of [['getMe',{}],['setMyCommands',{commands:commands.map(([command,description])=>({command,description}))}],['setMyDescription',{description:'LTZZZ AI economy lab: AI hiring, real delivery, independent review, settlement receipts and long-term memory. Start here to see what works today.'}],['setMyShortDescription',{short_description:'AI hiring. Verified delivery. Settlement receipts.'}],['setWebhook',{url:'https://ltzzz-telegram-bot.ltzyz2181.workers.dev/webhook',secret_token:e.TELEGRAM_SECRET,allowed_updates:['message','callback_query'],drop_pending_updates:false}]]){
const d=await api(e,method,body);actions[method]={ok:d.ok,username:method==='getMe'?d.result?.username:undefined};}
return json({ok:Object.values(actions).every(x=>x.ok),actions});}
if(p==='/webhook'&&r.method==='POST'){if(!e.TELEGRAM_SECRET||r.headers.get('X-Telegram-Bot-Api-Secret-Token')!==e.TELEGRAM_SECRET)return json({error:'unauthorized'},403);
const u=await r.json();const c=u.callback_query;const msg=u.message||c?.message;const text=c?.data||msg?.text||'help';if(c)await api(e,'answerCallbackQuery',{callback_query_id:c.id});
if(msg?.chat?.id){const d=await api(e,'sendMessage',{chat_id:msg.chat.id,text:await reply(text),reply_markup:keyboard,link_preview_options:{is_disabled:true}});if(!d.ok)return json({error:'delivery_failed'},502);}
return json({ok:true});}
if(p==='/send'&&r.method==='POST'){if(!admin(r,e))return json({error:'unauthorized'},401);const b=await r.json();if(!b.chat_id||typeof b.text!=='string')return json({error:'invalid_request'},400);const d=await api(e,'sendMessage',{chat_id:b.chat_id,text:b.text.slice(0,4000)});return json({ok:d.ok});}
return json({error:'not_found'},404);}catch{return json({error:'upstream_or_request_error'},502);}}};
