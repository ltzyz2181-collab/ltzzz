import {loadPiSdk, openPiSession, PI_VERSION} from './lib/pi-cloud.mjs';

// This checks the actual installed package/API and tool settings. It never calls prompt().
const root = process.env.PI_RUNTIME_ROOT || process.cwd();
const sdk = await loadPiSdk(root);
const opened = await openPiSession({sdk, root,
  selected: {route_id: 'ltzzz-pi-initialization-test', provider: 'deepseek', model: 'deepseek-reasoner',
    base: 'https://api.deepseek.com/v1', key: 'dummy-initialization-test-not-a-provider-key'}});
try {
  const result = {sdk_package: '@earendil-works/pi-coding-agent', sdk_version: PI_VERSION,
    session_created: true, active_tool_count: opened.session.getActiveToolNames().length,
    credential_store_modify_calls: opened.diagnostics.credential_store_modify_calls,
    provider_retries: opened.settings.getProviderRetrySettings().maxRetries,
    agent_retry_enabled: opened.settings.getRetryEnabled(), cache_warming: opened.settings.getCacheWarmingMode(),
    persistent_session: false, disk_auth_store: false, model_requests: 0, financial_execution: false};
  if (result.active_tool_count !== 0 || result.credential_store_modify_calls !== 0 || result.provider_retries !== 0 || result.agent_retry_enabled || result.cache_warming !== 'off') throw Error('pi_sdk_initialization_contract_failed');
  console.log(JSON.stringify(result));
} finally {
  opened.session.dispose(); await opened.runtime.removeRuntimeApiKey('ltzzz-pi-initialization-test');
}
