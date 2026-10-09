const repo='https://github.com/ltzyz2181-collab/ltzzz/blob/main/';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;};
const evidence=(path)=>{const a=el('a',null,'查看记录 ↗');a.href=path?repo+path:'daily.html';return a;};
const time=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'未记录';
let dataset=null;
function renderAgents(filter='all'){
 const target=document.querySelector('#agents');if(!target||!dataset)return;target.replaceChildren();
 const rows=dataset.agents.filter(a=>filter==='all'||a.status===filter);
 for(const a of rows){const card=el('article','agent');const head=el('div','agent-head');head.append(el('h3',null,a.name),el('span','badge '+a.status,a.label));card.append(head,el('p','role',a.role),el('p','detail',a.detail),evidence(a.evidence));target.append(card);}
 if(!rows.length)target.append(el('p','empty','本次记录中没有这个状态的席位。'));
}
async function load(){
 try{
  const response=await fetch('site-status.json',{cache:'no-store'});if(!response.ok)throw Error('status fetch failed');dataset=await response.json();
  for(const target of document.querySelectorAll('[data-metric]')){const values={daily:dataset.summary.daily_success+'/'+dataset.summary.daily_total,memory:dataset.summary.memory_loaded+'/'+dataset.summary.memory_total,seats:dataset.summary.seats,date:dataset.date?.slice(5)||'—'};target.textContent=values[target.dataset.metric]??'—';}
  document.querySelectorAll('[data-observed]').forEach(n=>n.textContent='最近日课 '+(dataset.date||'未知')+' · 页面数据生成 '+time(dataset.generated_at)+' · 非实时监控');
  const projects=document.querySelector('#projects');if(projects){projects.replaceChildren();for(const p of dataset.projects){const card=el('article','project-card');card.append(el('span','badge '+p.status,{verified:'已验证',pending:'待交付',blocked:'受阻'}[p.status]||'待核实'),el('div','category',p.category),el('h3',null,p.name),el('p',null,p.detail),evidence(p.evidence));projects.append(card);}}
  const history=document.querySelector('#history');if(history){history.replaceChildren();for(const h of dataset.history){const item=el('div','bar-item');const bar=el('div','bar');bar.style.height=Math.round((h.total?h.success/h.total:0)*105)+'px';item.append(el('strong',null,h.success+'/'+h.total),bar,el('span',null,h.date.slice(5)));history.append(item);}if(!dataset.history.length)history.append(el('span','note','暂无可核查的日课记录'));}
  const finance=document.querySelector('#finance');if(finance){finance.replaceChildren();const f=dataset.finance;if(f){for(const [label,value] of [['运营钱包 USDC',f.usdc],['Vault aUSDC',f.vault_ausdc],['Base ETH',f.eth?Number(f.eth).toFixed(6):'未知']]){const row=el('div','finance-row');row.append(el('span',null,label),el('strong',null,value??'未知'));finance.append(row);}finance.append(el('p','note','链上快照：'+time(f.observed_at)+' · 区块 '+f.block+'。aUSDC 为供应凭证；不包含个人钱包或其他金库。'),evidence(f.evidence));}else finance.append(el('p','note','尚无独立链上快照，不能显示模拟余额。'));}
  renderAgents();
 }catch{document.querySelectorAll('[data-observed]').forEach(n=>{n.className='error-note';n.textContent='本次未能加载执行记录，请刷新页面或查看仓库。';});document.querySelectorAll('.loading').forEach(n=>n.textContent='数据暂不可用');}
}
document.querySelector('.menu-toggle')?.addEventListener('click',e=>{const open=document.querySelector('.navlinks').classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',String(open));});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderAgents(button.dataset.filter);}));
load();
