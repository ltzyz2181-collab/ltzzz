import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTransport} from '../relay-seat.mjs';

// relay-proxy 的 workers.dev 主机在部分网络不可解析，导致两个中转席位同时不可用。
// 这里锁定"显式钉住传输方式"的行为：不设 → 沿用代理；设 direct → 直连；设错值 → 直接拒绝。

const basePolicy = {
  station: {base_url: 'https://api.apisrouter.com/v1', key_env: 'APISROUTER_API_KEY', local_key_file: '.secrets-local/apisrouter-key.txt'},
  access_boundary: {
    proxy_url: 'https://ltzzz-relay-proxy.example.workers.dev/v1',
    seat_direct_key_allowed: true,
    transport_env: 'LTZZZ_RELAY_TRANSPORT',
  },
};

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('默认沿用政策里的代理地址', () => {
  withEnv({LTZZZ_RELAY_TRANSPORT: undefined, LTZZZ_RELAY_PROXY_URL: undefined}, () => {
    const t = resolveTransport(structuredClone(basePolicy));
    assert.equal(t.mode, 'ltzzz_proxy');
    assert.equal(t.transport, 'policy_default');
    assert.match(t.url, /\/chat\/completions$/);
  });
});

test('显式 direct 时绕过代理并直连站点', () => {
  withEnv({LTZZZ_RELAY_TRANSPORT: 'direct', APISROUTER_API_KEY: 'test-key-not-real'}, () => {
    const t = resolveTransport(structuredClone(basePolicy));
    assert.equal(t.mode, 'direct_station_key_dev_exception');
    assert.equal(t.transport, 'direct');
    assert.equal(t.url, 'https://api.apisrouter.com/v1/chat/completions');
    assert.equal(t.boundaryException, true);
    assert.match(t.headers.Authorization, /^Bearer test-key-not-real$/);
    assert.match(t.fingerprint, /^sha256:16=[0-9a-f]{16}$/);
  });
});

test('direct 但策略不允许直连时拒绝', () => {
  const policy = structuredClone(basePolicy);
  policy.access_boundary.seat_direct_key_allowed = false;
  withEnv({LTZZZ_RELAY_TRANSPORT: 'direct', APISROUTER_API_KEY: 'test-key-not-real'}, () => {
    assert.throws(() => resolveTransport(policy), /relay_direct_key_forbidden/);
  });
});

test('非法传输取值直接拒绝，不猜', () => {
  withEnv({LTZZZ_RELAY_TRANSPORT: 'sneaky'}, () => {
    assert.throws(() => resolveTransport(structuredClone(basePolicy)), /relay_transport_invalid/);
  });
});

test('代理地址缺失且未指定 direct 时不得静默直连', () => {
  const policy = structuredClone(basePolicy);
  policy.access_boundary.proxy_url = '';
  policy.access_boundary.seat_direct_key_allowed = false;
  withEnv({LTZZZ_RELAY_TRANSPORT: undefined, LTZZZ_RELAY_PROXY_URL: undefined, APISROUTER_API_KEY: 'test-key-not-real'}, () => {
    assert.throws(() => resolveTransport(policy), /relay_direct_key_forbidden/);
  });
});
