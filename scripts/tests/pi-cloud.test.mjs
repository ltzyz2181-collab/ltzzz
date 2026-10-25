import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateConfig, readInputs, route, reservation, executeReservation, sha256, callPi, redact, runtimeManifest, stageRuntime, RUNTIME_PATHS} from '../lib/pi-cloud.mjs';
import {main} from '../pi-cloud.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../../config/pi-cloud.json', import.meta.url), 'utf8'));
const source = 'a'.repeat(40);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-pi-test-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const p of config.input_paths) { fs.mkdirSync(path.dirname(path.join(root, p)), {recursive: true}); fs.writeFileSync(path.join(root, p), 'trusted source ' + p); }
  fs.mkdirSync(path.join(root, 'config'), {recursive: true});
  fs.writeFileSync(path.join(root, 'config/pi-cloud.json'), JSON.stringify(config));
  fs.mkdirSync(path.join(root, 'data/model-routing'), {recursive: true});
  fs.writeFileSync(path.join(root, 'data/model-routing/latest.json'), JSON.stringify({seats: {deepseek: {model: 'deepseek-v4-pro'}}}));
  for (const file of RUNTIME_PATHS) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) { fs.mkdirSync(path.dirname(full), {recursive: true}); fs.writeFileSync(full, 'trusted runtime fixture ' + file); }
  }
  return root;
}
const env = {DEEPSEEK_API_KEY: 'fake-test-deepseek', DASHSCOPE_API_KEY: 'fake-test-qwen'};

test('smoke cannot enable unsafe capabilities, read arbitrary paths, or use same provider', () => {
  assert.equal(validateConfig(config), config);
  for (const name of ['paid_schedule', 'automatic_merge', 'automatic_deploy', 'financial_execution', 'native_claude_call']) assert.throws(() => validateConfig({...config, [name]: true}), /not_accepted/);
  assert.throws(() => validateConfig({...config, tools: ['bash']}), /untrusted_input_or_tools/);
  assert.throws(() => validateConfig({...config, input_paths: ['.env']}), /untrusted_input_or_tools/);
  assert.throws(() => validateConfig({...config, input_paths: [...config.input_paths].reverse()}), /untrusted_input_or_tools/);
  assert.throws(() => validateConfig({...config, reviewer_provider: 'deepseek'}), /distinct_official_providers/);
});

test('route only accepts official endpoint and configured route, not model self-identification', () => {
  assert.equal(route('deepseek', env, {seats: {deepseek: {model: 'deepseek-v4-pro'}}}).model, 'deepseek-v4-pro');
  assert.equal(route('qianwen', env).provider, 'aliyun_dashscope');
  assert.throws(() => route('qianwen', {...env, DASHSCOPE_BASE_URL: 'https://example.com/v1'}), /official_endpoint/);
  assert.throws(() => route('deepseek', {...env, DEEPSEEK_MODEL: '!curl attacker'}), /invalid_model/);
  assert.throws(() => route('claude', env), /provider_not_accepted/);
});

test('source inputs use exact bytes and reject symlink escape', t => {
  const root = fixture(t), inputs = readInputs(root, config);
  assert.equal(inputs[0].sha256, sha256(fs.readFileSync(path.join(root, config.input_paths[0]))));
  fs.unlinkSync(path.join(root, config.input_paths[0]));
  fs.symlinkSync('/etc/hostname', path.join(root, config.input_paths[0]));
  assert.throws(() => readInputs(root, config), /outside_workspace/);
});

test('durable prepare is idempotent across run IDs and source commit changes for identical input', async t => {
  const root = fixture(t), output = path.join(root, 'output');
  const r = await main({phase: 'prepare', root, receiptRoot: root, env: {GITHUB_RUN_ID: '123', GITHUB_SHA: source, GITHUB_OUTPUT: output}});
  assert.equal(r.execute, true);
  const duplicate = await main({phase: 'prepare', root, receiptRoot: root, env: {GITHUB_RUN_ID: '124', GITHUB_SHA: 'b'.repeat(40)}});
  assert.equal(duplicate.execute, false);
  assert.equal(r.idempotency_key, duplicate.idempotency_key);
  assert.equal(fs.readFileSync(output, 'utf8'), 'execute=true\n');
});

test('tampered inputs, prior uncertain state and wrong run ID cannot issue a provider call', async t => {
  const root = fixture(t), receipt = reservation({root, config, sourceCommit: source, runId: '123'});
  let calls = 0;
  const call = async () => { calls++; return {ok: true}; };
  for (const value of [{...receipt, run_id: '999'}, {...receipt, status: 'provider_calls_reserved_uncertain_until_final'}, {...receipt, inputs: []}]) {
    await assert.rejects(executeReservation({root, config, receipt: value, runId: '123', env, sdk: {}, call}), /binding_invalid/);
  }
  fs.appendFileSync(path.join(root, config.input_paths[0]), ' tamper');
  await assert.rejects(executeReservation({root, config, receipt, runId: '123', env, sdk: {}, call}), /binding_invalid/);
  assert.equal(calls, 0);
});

test('one real draft plus hash-bound different-provider review keeps logical delegation explicit', async t => {
  const root = fixture(t), receipt = reservation({root, config, sourceCommit: source, runId: '123'}), calls = [], saved = [];
  const result = await executeReservation({root, config, receipt, runId: '123', env, sdk: {}, persist: r => saved.push(structuredClone(r)),
    call: async args => { calls.push(args); return {ok: true, output: calls.length === 1 ? 'draft data fake-test-deepseek' : 'review fake-test-qwen', finish_reason: 'stop'}; }});
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(x => x.selected.provider), ['deepseek', 'aliyun_dashscope']);
  assert.equal(result.executions[1].logical_seat, 'claude');
  assert.match(result.executions[1].delegation, /not native Claude/);
  assert.equal(result.executions[1].native_claude_call, false);
  assert.equal(result.executions[1].reviewed_output_sha256, sha256('draft data [REDACTED]'));
  assert.equal(result.accepted, false);
  assert.equal(result.paid, false);
  assert.equal(result.financial_execution, false);
  assert.equal(result.status, 'two_provider_drafts_delivered_pending_independent_acceptance');
  assert.ok(!JSON.stringify(saved).includes('fake-test-deepseek'));
  assert.ok(!JSON.stringify(saved).includes('fake-test-qwen'));
  assert.match(calls[1].prompt, /output_sha256=/);
  assert.equal(saved[1].calls_attempted, 1);
});

test('missing credential performs zero requests and interrupted author never calls reviewer or retries', async t => {
  const root = fixture(t), receipt = reservation({root, config, sourceCommit: source, runId: '123'});
  let calls = 0;
  const call = async () => { calls++; return {ok: false, status: 'provider_incomplete_or_uncertain'}; };
  const blocked = await executeReservation({root, config, receipt, runId: '123', env: {}, sdk: {}, call});
  assert.equal(blocked.calls_attempted, 0); assert.equal(calls, 0);
  const uncertain = await executeReservation({root, config, receipt, runId: '123', env, sdk: {}, call});
  assert.equal(calls, 1); assert.equal(uncertain.status, 'author_incomplete_no_review_no_retry');
});

test('SDK setup disables discovery/tools/disk auth, provider retries, cache warming and stores raw route identity', async () => {
  const seen = {}, runtime = {
    registerProvider: (name, definition) => { seen.definition = definition; }, setRuntimeApiKey: async () => {},
    getModel: () => ({id: 'qwen-plus'}), removeRuntimeApiKey: async () => {}
  };
  const session = {state: {messages: [{role: 'assistant', content: [{type: 'text', text: 'ok secret-key'}], stopReason: 'stop', usage: {totalTokens: 10}}]},
    subscribe: () => {}, prompt: async () => {}, dispose: () => {seen.disposed = true;}};
  const sdk = {
    ModelRuntime: {create: async opts => { seen.runtime = opts; return runtime; }},
    SettingsManager: {inMemory: opts => {seen.settings = opts; return opts;}},
    SessionManager: {inMemory: () => ({})}, createExtensionRuntime: () => ({}),
    createAgentSession: async opts => {seen.session = opts; return {session};}
  };
  const r = await callPi({sdk, root: '/tmp', selected: {route_id: 'ltzzz-qianwen', provider: 'aliyun_dashscope', model: 'qwen-plus', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: 'secret-key'}, prompt: 'fixed'});
  assert.equal(seen.runtime.modelsPath, null); assert.equal(seen.runtime.allowModelNetwork, false);
  assert.equal(await seen.runtime.credentials.read('x'), undefined);
  await assert.rejects(seen.runtime.credentials.modify(), /disk_write_disabled/);
  assert.deepEqual(seen.session.tools, []); assert.equal(seen.session.noTools, 'all');
  assert.deepEqual(seen.session.resourceLoader.getExtensions().extensions, []);
  assert.equal(seen.settings.retry.enabled, false); assert.equal(seen.settings.retry.provider.maxRetries, 0);
  assert.equal(seen.settings.cacheWarming, 'off'); assert.equal(seen.disposed, true);
  assert.equal(r.output, 'ok [REDACTED]'); assert.match(r.model_source, /not_raw_provider_response/);
  assert.equal(r.usage_cost_is_verified, false);
});

test('truncated body and tool attempts are not success', async () => {
  for (const [stop, emitTool] of [['length', false], ['stop', true]]) {
    let listener;
    const runtime = {registerProvider() {}, async setRuntimeApiKey() {}, getModel: () => ({}), async removeRuntimeApiKey() {}};
    const session = {state: {messages: [{role: 'assistant', content: [{type: 'text', text: 'body'}], stopReason: stop}]},
      subscribe: fn => {listener = fn;}, prompt: async () => {if (emitTool) listener({type: 'tool_execution_start', toolName: 'bash'});}, dispose() {}};
    const sdk = {ModelRuntime: {create: async () => runtime}, SettingsManager: {inMemory: () => ({})}, SessionManager: {inMemory: () => ({})}, createExtensionRuntime: () => ({}), createAgentSession: async () => ({session})};
    const result = await callPi({sdk, root: '/tmp', selected: {route_id: 'x', provider: 'deepseek', model: 'deepseek-reasoner', base: 'https://api.deepseek.com/v1', key: 'secret'}, prompt: 'x'});
    assert.equal(result.ok, false);
  }
});

test('source metadata and secret strings cannot be printed accidentally', () => {
  assert.throws(() => reservation({root: '.', config, sourceCommit: 'main', runId: '1'}), /invalid_execution_metadata/);
  assert.deepEqual(redact({a: ['a secret b']}, ['secret']), {a: ['a [REDACTED] b']});
});

test('any exact-byte executable or dependency drift blocks model calls', async t => {
  const root = fixture(t);
  for (const file of RUNTIME_PATHS) {
    const original = fs.readFileSync(path.join(root, file));
    const receipt = reservation({root, config, sourceCommit: source, runId: '123'});
    fs.appendFileSync(path.join(root, file), '\n ');
    let calls = 0;
    await assert.rejects(executeReservation({root, config, receipt, runId: '123', env, sdk: {}, call: async () => { calls++; }}), /binding_invalid/);
    assert.equal(calls, 0);
    fs.writeFileSync(path.join(root, file), original);
  }
});

test('missing required runtime file fails closed before SDK load or model requests', async t => {
  const root = fixture(t);
  await main({phase: 'prepare', root, receiptRoot: root, env: {GITHUB_RUN_ID: '123', GITHUB_SHA: source}});
  fs.unlinkSync(path.join(root, 'data/model-routing/latest.json'));
  let sdkLoads = 0;
  await assert.rejects(main({phase: 'execute', root, receiptRoot: root, env: {GITHUB_RUN_ID: '123', GITHUB_SHA: source}, sdkLoader: async () => { sdkLoads++; }}), {code: 'ENOENT'});
  assert.equal(sdkLoads, 0);
  const stored = fs.readdirSync(path.join(root, 'knowledge/results/pi-cloud')).map(file => JSON.parse(fs.readFileSync(path.join(root, 'knowledge/results/pi-cloud', file), 'utf8')));
  assert.equal(stored.length, 1); assert.equal(stored[0].calls_attempted, 0);
  assert.equal(stored[0].status, 'reserved_before_provider_calls');
});

test('a genuine git rebase of receipt transport cannot change frozen verified runtime', async t => {
  const root = fixture(t), frozen = root + '-runtime';
  t.after(() => fs.rmSync(frozen, {recursive: true, force: true}));
  const git = args => execFileSync('git', ['-c', 'user.name=Pi Test', '-c', 'user.email=pi-test@example.invalid', ...args], {cwd: root, stdio: 'pipe', encoding: 'utf8'}).trim();
  git(['init', '-b', 'main']); git(['add', '.']); git(['commit', '-m', 'reviewed baseline']);
  const originalCommit = git(['rev-parse', 'HEAD']);
  const staged = stageRuntime({root, target: frozen});
  const receipt = reservation({root: frozen, config, sourceCommit: originalCommit, runId: '123'});
  git(['checkout', '-b', 'upstream']);
  fs.appendFileSync(path.join(root, 'scripts/lib/pi-cloud.mjs'), '\nchanged-after-reviewed-commit');
  git(['add', '.']); git(['commit', '-m', 'concurrent main runtime change']);
  git(['checkout', '-b', 'receipt-transport', originalCommit]);
  fs.writeFileSync(path.join(root, 'reservation.json'), JSON.stringify(receipt));
  git(['add', 'reservation.json']); git(['commit', '-m', 'reserve model invocation']); git(['rebase', 'upstream']);
  assert.notDeepEqual(runtimeManifest(root), staged.runtime_manifest);
  assert.deepEqual(runtimeManifest(frozen), staged.runtime_manifest);
  let calls = 0;
  const result = await executeReservation({root: frozen, config, receipt, runId: '123', env, sdk: {}, call: async () => { calls++; return {ok: true, output: 'draft', finish_reason: 'stop'}; }});
  assert.equal(calls, 2); assert.equal(result.status, 'two_provider_drafts_delivered_pending_independent_acceptance');
  assert.equal(result.runtime_manifest_sha256, staged.runtime_manifest_sha256);
});
