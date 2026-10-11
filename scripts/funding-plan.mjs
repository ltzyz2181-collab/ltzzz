// Raw USDC integer units only. First lifetime funding is a 1 USDC receipt test.
export function fundingAmount({balance,target=100000000n,dailyPulled,grantRemaining,lifetimePulled}){
  for(const value of [balance,target,dailyPulled,grantRemaining,lifetimePulled])if(typeof value!=='bigint'||value<0n)throw Error('invalid_raw_amount');
  if(target>100000000n)throw Error('target_exceeds_100_USDC');
  if(balance>=target)return {amount:0n,status:'no_refill_needed'};
  if(dailyPulled>=200000000n)return {amount:0n,status:'daily_limit_wait'};
  if(grantRemaining===0n)return {amount:0n,status:'grant_exhausted'};
  const pilot=lifetimePulled===0n,cap=pilot?1000000n:100000000n;
  const amount=[target-balance,200000000n-dailyPulled,grantRemaining,cap].reduce((a,b)=>a<b?a:b);
  return {amount,status:'ready',stage:pilot?'first_1_USDC_test':'refill'};
}
