// Reviewed names and purposes, never credential values or caller-supplied allowances.
const groups = {
  model_inference: ['OPENAI_API_KEY','ANTHROPIC_API_KEY','ARK_API_KEY','DOUBAO_API_KEY','DOUBAO_BASE_URL','DOUBAO_MODEL','DASHSCOPE_API_KEY','QWEN_API_KEY','DEEPSEEK_API_KEY','KIMI_API_KEY','MOONSHOT_API_KEY','MOONSHOT_API_KEY_','MOONSHOT_API_KEY_CN','MOONSHOT_API_KEY_INTL','XAI_API_KEY'],
  cloud_application_publication: ['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN'],
  application_service_authentication: ['LTZZZ_AGENT_TOKEN','META_WORKER_TOKEN','LAB_PIN','MANUS_ACCESS_TOKEN','MANUS_API_KEY'],
  public_metadata_or_configuration: ['MINIPROGRAM_APPID','WECHAT_MINIPROGRAM_APPID','WX_MINIPROGRAM_APPID','X402_RECEIVE_ADDRESS','X402_LIVE'],
  application_object_storage: ['R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'],
  source_repository: ['GITHUB_TOKEN'],
  notification_or_publishing: ['GUARDIAN_WEBHOOK','X_USER_ACCESS_TOKEN']
};
const names = Object.freeze(Object.fromEntries(Object.entries(groups).flatMap(([purpose, values]) => values.map(name => [name, purpose]))));
const cdp = new Set(['CDP_API_KEY_ID','CDP_API_KEY_NAME','CDP_API_KEY_SECRET','COINBASE_API_KEY_ID','COINBASE_API_KEY_SECRET']);
export function workflowCredentialPurpose(name, path) {
  // This binding only admits the reviewed API-only CDP workflow. It never admits
  // a wallet Secret, account creation, or use at a different workflow path.
  if (cdp.has(name)) return path === '.github/workflows/verify-kimi-okx.yml' ? 'CDP_API_only_without_wallet_secret' : null;
  return Object.hasOwn(names, name) ? names[name] : null;
}
// No OKX name is admitted: real exchange read-only API permissions have not
// been verified. Existing workflows stop receiving these Secrets in this patch.
// An allowed name/purpose is not proof of the actual token's IAM scope, nor
// payment, deployment, signature, or automatic-merge authorization.
