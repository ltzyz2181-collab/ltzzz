import {articleEligibility} from './wechat-article-eligibility.js';
import {reply as channelReply} from './channels/bot-content.mjs';
/**
 * LTZZZ WeChat Publisher Worker
 * 公众号每日图文发布：读 R2 当日 AI 产物 → 组装图文 → 建草稿（人工过目）→（配置开启后）群发
 * 2026-10-02 追加：/wechat 消息与事件回调端点（服务器配置验签 GET + 事件/文本回复 POST）
 *
 * 端点：
 *   GET  /health           健康检查
 *   POST /publish?mode=draft|mass   手动触发（默认 draft，不群发）
 *   GET  /wechat           服务器配置验签（echostr）
 *   POST /wechat           接收消息/菜单事件 → 按关键词模板回复文本
 *   cron：每天 20:00 CST（0 12 * * * UTC）自动建草稿
 *
 * Secrets（只进 Secret，不入库）：
 *   WECHAT_APP_ID     公众号 AppID
 *   WECHAT_APP_SECRET 公众号 AppSecret
 *   WECHAT_TOKEN      服务器配置 Token（owner 在 mp.weixin.qq.com 基本配置里填同一值）
 *   （可选）AUTO_MASS=1 时草稿通过后自动群发；默认 0=只建草稿等人工
 *
 * 内容源：R2 bucket `ltzzz-memory`，key 前缀 `knowledge/daily/`
 *   → 取当天各 AI 产物（xia/gpt/doubao/deepseek/kimi…）组装一篇日报图文
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "ltzzz-wechat-publisher",
        app_id: !!env.WECHAT_APP_ID,
        expected_account_matches: !!env.WECHAT_EXPECTED_APP_ID && env.WECHAT_APP_ID===env.WECHAT_EXPECTED_APP_ID,
        has_secret: !!env.WECHAT_APP_SECRET,
        has_token: !!env.WECHAT_TOKEN,
        r2: !!env.MEMORY_BUCKET,
        auto_mass: env.AUTO_MASS === "1",
      });
    }
    if(url.pathname==="/draft-diagnostics" && request.method==="GET"){
      if(!env.BOT_ADMIN_TOKEN || request.headers.get("Authorization")!=="Bearer "+env.BOT_ADMIN_TOKEN)return json({error:"unauthorized"},401);
      const date=url.searchParams.get("date")||todayCN();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:"invalid_date"},400);
      const result={ok:false,date,app_id_matches:env.WECHAT_APP_ID===url.searchParams.get("expected_app_id"),app_id_suffix:String(env.WECHAT_APP_ID||"").slice(-6),draft_found:false,read_only:true};
      try{
        const saved=await env.MEMORY_BUCKET.get("wechat/publish/"+date+".json");
        const receipt=saved?JSON.parse(await saved.text()):{};
        if(!receipt.draft_id)return json({...result,error:"No stored draft ID"},404);
        const token=await getAccessToken(env);
        const draft=await wxCall("draft/get",token,{media_id:receipt.draft_id});
        return json({...result,ok:true,draft_found:true,draft_id:receipt.draft_id,titles:(draft.news_item||[]).map(x=>x.title),source_article_hash:receipt.article_hash||null});
      }catch(e){return json({...result,error:e.platform||{message:"Read-only draft query failed"}},500);}
    }
    if(url.pathname==='/article-readiness'&&request.method==='GET'){
      const date=url.searchParams.get('date')||todayCN();if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({ok:false,error:'invalid_date'},422);
      try{const article=await buildArticle(env,date);return json({ok:true,date,status:article.eligibility?.status||'NO_CONTENT',draft_eligible:article.eligibility?.draft_eligible===true,article_sha256:article.eligibility?.article_sha256||null,publication_checked:false,read_only:true});}catch{return json({ok:false,date,status:"READINESS_UNAVAILABLE",draft_eligible:false,read_only:true},503);}
    }
    if (url.pathname === "/publish" && request.method === "POST") {
      if(!env.BOT_ADMIN_TOKEN || request.headers.get("Authorization")!=="Bearer "+env.BOT_ADMIN_TOKEN)return json({error:"unauthorized"},401);
      const mode = url.searchParams.get("mode") || "draft";
      if (!["draft","publish"].includes(mode)) return json({ok:false,error:"invalid_mode"},400);
      const date = url.searchParams.get("date") || todayCN();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ok:false,error:"invalid_date"},400);
      const out = await publish(env, mode, date);
      return json(out, out.ok ? 200 : 500);
    }
    // —— 微信服务器配置验签（GET）——
    if (url.pathname === "/wechat" && request.method === "GET") {
      const token = env.WECHAT_TOKEN;
      if (!token) return json({ ok: false, msg: "WECHAT_TOKEN missing in secrets" }, 500);
      const timestamp = url.searchParams.get("timestamp");
      const nonce = url.searchParams.get("nonce");
      const signature = url.searchParams.get("signature");
      const echostr = url.searchParams.get("echostr");
      const ok = await verifySignature(token, timestamp, nonce, signature);
      if (!ok) {
        return json({ ok: false, msg: "signature mismatch" }, 403);
      }
      return new Response(echostr || "", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    // —— 微信消息/事件回调（POST）——
    if (url.pathname === "/wechat" && request.method === "POST") {
      const token = env.WECHAT_TOKEN;
      if (!token) return json({ ok: false, msg: "WECHAT_TOKEN missing in secrets" }, 500);
      const timestamp = url.searchParams.get("timestamp");
      const nonce = url.searchParams.get("nonce");
      const signature = url.searchParams.get("signature");
      const ok = await verifySignature(token, timestamp, nonce, signature);
      if (!ok) {
        return json({ ok: false, msg: "bad signature" }, 403);
      }
      const xml = await request.text();
      if(xml.includes("<Encrypt>"))return json({error:"encrypted_callback_not_supported"},422);
      const replyXml = await handleWechatMessage(xml);
      return new Response(replyXml, {
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      });
    }
    return json({ ok: false, msg: "unknown endpoint" }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(publish(env, "draft"));
  },
};

/** 微信服务器配置验签：sha1(token,timestamp,nonce 字典序拼接) === signature */
function verifySignature(token, timestamp, nonce, signature) {
  if (!token || !timestamp || !nonce || !signature) return false;
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join("");
  return crypto.subtle.digest("SHA-1", new TextEncoder().encode(str)).then((buf) => {
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex === signature;
  });
}

/** 解析微信 XML（消息/事件），返回要回复的文本；无回复返回 "success" */
async function handleWechatMessage(xml) {
  const g = (tag) => {
    const m = xml.match(new RegExp("<" + tag + "><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></" + tag + ">"));
    if (m) return m[1];
    const m2 = xml.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">"));
    return m2 ? m2[1] : "";
  };
  const from = g("FromUserName").replace(/\]\]>/g,""); // 粉丝 openid
  const to = g("ToUserName").replace(/\]\]>/g,"");     // 公众号原始 ID
  const msgType = g("MsgType");
  const event = g("Event");
  const eventKey = g("EventKey");
  const content = (g("Content") || "").trim();

  let reply = "";
  // 菜单 click 事件：按 EventKey 回复
  if (msgType === "event" && event === "CLICK") {
    reply = await channelReply(eventKey);
  } else if (msgType === "event" && event === "subscribe") {
    reply = await channelReply("start");
  } else if (msgType === "text" && content) {
    reply = await channelReply(content);
  }

  if (!reply) return "success";
  const ts = Math.floor(Date.now() / 1000);
  return (
    "<xml>" +
    "<ToUserName><![CDATA[" + from + "]]></ToUserName>" +
    "<FromUserName><![CDATA[" + to + "]]></FromUserName>" +
    "<CreateTime>" + ts + "</CreateTime>" +
    "<MsgType><![CDATA[text]]></MsgType>" +
    "<Content><![CDATA[" + reply + "]]></Content>" +
    "</xml>"
  );
}

/** 关键词即命令（对齐 docs/wechat-reply-templates.md 模板） */
function keywordReply(kw) {
  const k = (kw || "").toLowerCase();
  if (k.includes("商品") || k.includes("购买") || k.includes("下单") || k.includes("买")) {
    return "LTZZZ AI Agent Economy Starter Kit（$19）：https://ltzyz.gumroad.com/l/ugyhy\n\n订单号格式 WX-YYYYMMDD-XXXX，支付回执发回本号后自动推送交付链接。";
  }
  if (k.includes("观") || k.includes("今日") || k.includes("实验")) {
    return "今日实验一句话：LTZZZ 多 AI 流水线已跑通（Qwen/Kimi/DeepSeek 直连验证 OK），视频已公开 YT。详见 ltzzz.com/dashboard.html。";
  }
  if (k.includes("状态") || k.includes("health")) {
    return "系统状态：ltzzz.com 在线 · 视频已公开 · Gumroad $19 模板包可购 · 公众号回调已接入。";
  }
  if (k.includes("99")) {
    return "99 元 AI 模板包（国内版）：私聊下单后发支付回执，AI 自动交付链接。海外版走 $19 Gumroad。";
  }
  return "回复关键词：商品 / 观 / 状态 / 99，或访问 ltzzz.com 查看更多。";
}


async function wxCall(endpoint, token, body) {
  const r = await fetch("https://api.weixin.qq.com/cgi-bin/"+endpoint+(token?"?access_token="+encodeURIComponent(token):""), {
    method: body ? "POST" : "GET",
    headers: {"Content-Type":"application/json"},
    ...(body ? {body:JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (!r.ok || j.errcode) {
    const error = new Error("WeChat "+endpoint+" rejected");
    error.platform = {endpoint,http:r.status,errcode:j.errcode ?? null,errmsg:String(j.errmsg || "HTTP error").replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g,"[IP redacted]").slice(0,300)};
    throw error;
  }
  return j;
}
async function publish(env, mode, date=todayCN()) {
  if(env.WECHAT_EXPECTED_APP_ID && env.WECHAT_APP_ID!==env.WECHAT_EXPECTED_APP_ID)return {ok:false,status:"ACCOUNT_MISMATCH",published:false,msg:"Configured WeChat AppID does not match owner confirmed account; no draft created"};
  const key = "wechat/publish/"+date+".json";
  let receipt = {ok:false,date,mode,status:"BLOCKED",published:false,at:new Date().toISOString()};
  try {
    const prior = await env.MEMORY_BUCKET.get(key);
    const accountHash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(env.WECHAT_APP_ID||"")))].map(x=>x.toString(16).padStart(2,"0")).join("");
    if(prior){
      const saved=JSON.parse(await prior.text());
      if(saved.account_hash===accountHash)receipt={...receipt,...saved,mode,at:new Date().toISOString()};
      else{
        await env.MEMORY_BUCKET.put("wechat/publish/archive/"+date+"-"+(saved.account_hash||"legacy")+".json",JSON.stringify(saved));
        receipt.previous_account_draft_preserved=true;
      }
    }
    receipt.account_hash=accountHash;
    if(receipt.published)return {...receipt,ok:true,reused:true};
    const article=await buildArticle(env,date);
    if(article.eligibility?.draft_eligible!==true){receipt={...receipt,ok:false,status:article.eligibility?.status||'ARTICLE_EDITOR_UNVERIFIED',draft_eligible:false,published:false,existing_draft_preserved:!!receipt.draft_id,article_eligibility:article.eligibility};await env.MEMORY_BUCKET.put(key,JSON.stringify(receipt));return receipt;}
    if(!article.content)return {...receipt,ok:false,status:"NO_CONTENT",published:false};
    const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(article.content)))].map(x=>x.toString(16).padStart(2,"0")).join("");
    if(receipt.published)return {...receipt,ok:true,reused:true};
    if(receipt.draft_id && receipt.article_hash!==hash){
      if(receipt.publish_id)return {...receipt,ok:false,status:"NEEDS_RECONCILIATION",msg:"Content changed after publish submit"};
      receipt.legacy_draft_id=receipt.draft_id;
      delete receipt.draft_id;delete receipt.error;
      receipt.status="ARTICLE_READY";
    }
    if(mode==="draft" && receipt.draft_id)return {...receipt,ok:true,reused:true};
    if (receipt.status==="DRAFT_SUBMITTING" || receipt.status==="PUBLISH_SUBMITTING") {
      return {...receipt,ok:false,status:"NEEDS_RECONCILIATION",msg:"Previous request had no confirmed response; do not duplicate automatically"};
    }
    const token = await getAccessToken(env);
    if (!receipt.draft_id) {
      const {title,content,sources} = article;
      if (!content) return {...receipt,msg:"No dated article found",status:"NO_CONTENT"};
      receipt = {...receipt,title,sources,article_hash:hash,status:"DRAFT_SUBMITTING"};
      await env.MEMORY_BUCKET.put(key,JSON.stringify(receipt));
      receipt.draft_id = await addDraft(env,token,title,content);
      receipt.status = "DRAFT_CREATED";
      receipt.ok = true;
      await env.MEMORY_BUCKET.put(key,JSON.stringify(receipt));
    }
    if (mode==="publish") {
      if (!receipt.publish_id) {
        receipt.status = "PUBLISH_SUBMITTING";
        await env.MEMORY_BUCKET.put(key,JSON.stringify(receipt));
        const submitted = await wxCall("freepublish/submit",token,{media_id:receipt.draft_id});
        if (!submitted.publish_id) throw new Error("WeChat submit returned no publish_id");
        receipt.publish_id = submitted.publish_id;
        receipt.status = "PUBLISH_PENDING";
        await env.MEMORY_BUCKET.put(key,JSON.stringify(receipt));
      }
      const check = await wxCall("freepublish/get",token,{publish_id:receipt.publish_id});
      receipt.publish_status = check.publish_status;
      receipt.published = check.publish_status===0;
      receipt.article_id = check.article_id || null;
      receipt.article_urls = (check.article_detail?.item || []).map(x=>x.article_url).filter(Boolean);
      receipt.status = receipt.published ? "PUBLISHED" : check.publish_status===1 ? "PUBLISH_PENDING" : "PUBLISH_FAILED";
      receipt.ok = receipt.published || check.publish_status===1;
    }
  } catch (e) {
    receipt = {...receipt,ok:false,published:false,status:e.platform ? "BLOCKED" : "NEEDS_RECONCILIATION",error:e.platform || {message:"Publishing request failed",type:e.name}};
  }
  try { await env.MEMORY_BUCKET.put(key,JSON.stringify(receipt,null,2)); }
  catch { receipt.receipt_persistence_failed=true;receipt.ok=false; }
  return receipt;
}
async function getAccessToken(env) {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) throw new Error("WECHAT_APP_ID/SECRET missing");
  // Private bucket only: reuse the same account token for the draft and its verification.
  const scope=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.WECHAT_APP_ID));
  const key='wechat/private/token-'+Array.from(new Uint8Array(scope)).map(x=>x.toString(16).padStart(2,'0')).join('')+'.json';
  try{const cached=await env.MEMORY_BUCKET?.get(key);if(cached){const value=JSON.parse(await cached.text());if(value.access_token&&value.expires_at>Date.now()+120000)return value.access_token;}}catch{}
  let last;const deniedIps=new Set();
  for(let attempt=0;attempt<3;attempt++){
    const r=await fetch("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid="+encodeURIComponent(env.WECHAT_APP_ID)+"&secret="+encodeURIComponent(env.WECHAT_APP_SECRET),{signal:AbortSignal.timeout(20000)});
    const j=await r.json();
    if(r.ok&&j.access_token){
      if(env.MEMORY_BUCKET)await env.MEMORY_BUCKET.put(key,JSON.stringify({access_token:j.access_token,expires_at:Date.now()+Math.min(Number(j.expires_in)||7200,7200)*1000}));
      return j.access_token;
    }
    const e=new Error("WeChat token rejected");
    const ip=(String(j.errmsg||"").match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)||[])[0]||null;
    if(j.errcode===40164&&ip)deniedIps.add(ip);
    e.platform={endpoint:"token",http:r.status,errcode:j.errcode??null,whitelist_ip:ip,whitelist_ips:[...deniedIps],static_ip:false,errmsg:String(j.errmsg||"No access_token").replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g,"[IP redacted]").slice(0,300)};
    last=e;if(j.errcode!==40164)break;
  }
  throw last;
}

// 2026-10-10 Grok Bot：优先使用 Actions 生成的 AI 编辑日报（articles/daily/<date>.md，已脱敏），没有再回退旧拼接
function mdToHtml(md) {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return md.split("\n").filter((l) => !/^# /.test(l)).map((l) => {
    if (/^#{2,3} /.test(l)) return `<h3>${esc(l.replace(/^#+ /, ""))}</h3>`;
    if (/^[-*] /.test(l)) return `<p>• ${esc(l.slice(2))}</p>`;
    return l.trim() ? `<p>${esc(l)}</p>` : "";
  }).join("");
}
async function buildArticle(env, date = todayCN()) {
  // explicit CST date // YYYY-MM-DD
  let src = `https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/content/daily-articles/${date}.md`;
  const remote=await fetch(src,{signal:AbortSignal.timeout(15000)});
  let md=remote.ok?await remote.text():"";
  if(!md){
    src=`articles/daily/${date}.md`;
    const ai=await env.MEMORY_BUCKET.get(src);
    md=ai?await ai.text():"";
  }
  if (md) {
    const t = (md.match(/^# (.+)$/m) || [])[1];
    let metadata=null;try{const r=await fetch('https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/results/publishing/'+date+'.json',{signal:AbortSignal.timeout(15000)});if(r.ok)metadata=await r.json();}catch{}
    const eligibility=await articleEligibility(md,metadata,date);
    if (md.trim()) return { eligibility,title: (t || `LTZZZ 每日实验 · ${date}`).slice(0, 64), content: mdToHtml(md), sources: [src] };
  }
  const prefix = "knowledge/daily/";
  const listed = await env.MEMORY_BUCKET.list({ prefix });
  let parts = [];
  let sources = [];
  for (const obj of listed.objects || []) {
    const name = obj.key.replace(prefix, "");
    if (!name.includes(date)) continue; // 只要当天
    const body = await env.MEMORY_BUCKET.get(obj.key);
    if (!body) continue;
    const text = await body.text();
    const snippet = text.slice(0, 1200);
    parts.push(`【${name.split("/")[0]}】\n${snippet}`);
    sources.push(obj.key);
  }
  if (parts.length === 0) return { title: "", content: "", sources: [] };

  const title = `LTZZZ 每日实验 · ${date}`;
  const content =
    `LTZZZ 数字实验室 — ${date} 各 AI 协作日报\n\n` +
    parts.join("\n\n---\n\n") +
    `\n\n— 由 LTZZZ 多 AI 自动流水线生成 · 数据与产物存于 ltzzz.com`;
  return { title, content, sources,eligibility:{status:'ARTICLE_FALLBACK_RAW',draft_eligible:false,reason:'raw_record_assembly_not_editor_approved'} };
}

async function addDraft(env,token,title,content) {
  if (!env.THUMB_MEDIA_ID) throw new Error("THUMB_MEDIA_ID missing");
  const j=await wxCall("draft/add",token,{articles:[{title,author:"LTZZZ",digest:content.replace(/<[^>]+>/g,"").slice(0,100),content,content_source_url:"https://ltzzz.com",thumb_media_id:env.THUMB_MEDIA_ID,need_open_comment:0,only_fans_can_comment:0}]});
  if (!j.media_id) throw new Error("No draft media_id");
  return j.media_id;
}

function todayCN() {
  const now = new Date();
  const off = 8 * 60;
  const d = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + off * 60000);
  return d.toISOString().slice(0, 10);
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control":"no-store", "Access-Control-Allow-Origin": "*" },
  });
}
