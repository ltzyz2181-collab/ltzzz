export function substantiveClaim(line){
  const s=line.trim().replace(/^[-*]\s*/, '');
  return s.length>20&&!/^(#|\||```|<!--)/.test(s)&&! /^(mode|writer|执行者|生成时间|日期|时间|status|run_id|source_commit|执行ID|读取范围)\s*[:：]/i.test(s);
}
export function candidateImpact(claim){return /泄露|截断|资金|权限|退款|结算|私钥|guardian|blocked|失败|错误|risk|payment/i.test(claim)?'high':'low';}
