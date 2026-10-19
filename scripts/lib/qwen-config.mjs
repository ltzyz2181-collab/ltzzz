export function qwenConfig(env = process.env, suppliedKey) {
  const key = suppliedKey || env.DASHSCOPE_API_KEY || env.QWEN_API_KEY || '';
  const model = env.DASHSCOPE_MODEL || env.QWEN_MODEL || 'qwen-plus';
  const configured = env.DASHSCOPE_BASE_URL || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const url = new URL(configured);
  const standard = ['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'dashscope-us.aliyuncs.com'].includes(url.hostname);
  const workspace = /^[a-z0-9-]+\.(cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/.test(url.hostname);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !(standard || workspace)) throw Error('qwen_official_endpoint_required');
  const basePath = url.pathname.replace(/\/$/, '').replace(/\/chat\/completions$/, '');
  if (basePath !== '/compatible-mode/v1') throw Error('qwen_compatible_base_path_required');
  if (/^sk-(?:ant-|proj-|sp-)/.test(key)) throw Error('qwen_pay_as_you_go_key_required');
  return {key, model, base: url.origin + basePath};
}
