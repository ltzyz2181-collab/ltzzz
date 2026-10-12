import {isIP} from 'node:net';
export function ipv4FromMessage(message) {
  return [...new Set((String(message||'').match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)||[]).filter(x=>isIP(x)===4))];
}
export async function observeRunnerEgress(fetcher=fetch) {
  const observations=[];
  for(const url of ['https://api.ipify.org','https://checkip.amazonaws.com']){
    try{
      const r=await fetcher(url,{signal:AbortSignal.timeout(10000)});
      const ip=(await r.text()).trim();
      if(r.ok&&isIP(ip)===4)observations.push({source:url,ipv4:ip});
    }catch{}
  }
  return {at:new Date().toISOString(),executor:'github_actions_runner',static_ip:false,observations,
    ipv4_candidates:[...new Set(observations.map(x=>x.ipv4))],
    note:'Observation endpoints show this run only; an OKX-reported peer IP is preferred. GitHub hosted runners can change IP on the next run.'};
}
