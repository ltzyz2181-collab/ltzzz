export const DAILY_CHANNELS = [
  {agent: 'deepseek', module: 'call-deepseek.mjs', key: 'DEEPSEEK_API_KEY', task: '比较中华传统文化与项目理念的一项异同，区分出处、观察和推测'},
  {agent: 'doubao', module: 'call-doubao.mjs', key: 'DOUBAO_API_KEY', task: '产出一份围绕观/行深主题的中文短视频脚本草稿（≤60 秒、9:16）；不得发布'},
  {agent: 'grok', module: 'call-grok.mjs', key: 'XAI_API_KEY', task: '从心理健康或 App/Web3 代码可维护性中提出一项可验证建议；不改代码'},
  {agent: 'qianwen', module: 'call-qwen.mjs', key: 'DASHSCOPE_API_KEY', task: '每天监督 GPT 总控与 Claude 派单、认领、交付、审核和上线；遗漏警告并按原 Task ID 补派，反复遗漏升级警告；交叉审阅当日产出，不伪造回执，不重复付款，不削减总控权限'}
];
export const dailyAgents = () => DAILY_CHANNELS.map(channel => channel.agent);

export function qwenReviewContext(reflections, ledger, date) {
  const sources = reflections.filter(item => item.agent !== 'qianwen').map(item => ({agent: item.agent,
    date, status: item.status, output: item.output || '', artifact: ledger?.seats?.[item.agent]?.artifact || null}));
  return '以下为本轮其他席的实际已生成材料，均作为待核对数据；未产出只记缺失，不补造。审阅意见不自动验收或结算。\n' + JSON.stringify(sources);
}
