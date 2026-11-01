// Isolated Chromium regression; no user browser profile, credentials or write endpoints.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {compareUiSource} from './lib/ui-source-comparison.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const output = process.env.UI_EVIDENCE_DIR || '/tmp/ltzzz-ui-browser';
fs.mkdirSync(output, {recursive: true});
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright-core');
const browser = await chromium.launch({headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {}),
  args: ['--no-sandbox']});
const sourceDir = process.env.UI_SOURCE_DIR || '.';
const files = Object.fromEntries(['wep3.html', 'treasury-dashboard.html'].map(file => [file, fs.readFileSync(path.join(sourceDir, file))]));
const report = {at_utc: new Date().toISOString(), browser: browser.version(),
  source_commit: process.env.GITHUB_SHA || null,
  source_files: Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, sha(bytes)])),
  fixture_results: [], production_results: [], non_get_requests: [], blocked_external_get_requests: [], paid: false, tx_hash: null};
const payload = '<img src=x onerror="globalThis.PWNED=1">';
const failedReceipt = {status: 'live_contract_check_failed', paid: false, tx_hash: null,
  worker_generation: {status: 'success', tokens_used: 0, error: 'TEST_ONLY_SECRET'},
  live_checks: [null, {id: 'TREASURY', path: '/market/treasury', passed: false,
    comparison: {fields: [null, {key: 'controlled', expected: true, actual: false, matched: false}]}}]};
const health = {report: {CODE: 'READY'}};
const fixtureCases = [
  {name: 'contract-failure-and-null-fields', file: 'wep3.html', receipt: failedReceipt,
    check: async page => {
      assert.match(await page.locator('#state').innerText(), /未通过/);
      const detail = JSON.parse(await page.locator('#detail').innerText());
      assert.equal(detail.failed_checks[0].failed_fields[0].actual, false);
      assert.equal(detail.worker_generation.tokens_used, 0);
      assert.doesNotMatch(JSON.stringify(detail), /TEST_ONLY_SECRET/);
    }},
  {name: 'prototype-status', file: 'wep3.html', receipt: {status: 'toString'},
    check: async page => assert.equal(await page.locator('#state').innerText(), 'toString')},
  {name: 'unknown-payment', file: 'wep3.html', receipt: {},
    check: async page => {
      assert.equal(await page.locator('#state').innerText(), '状态未知');
      assert.match(await page.locator('#money').innerText(), /未知/);
    }},
  {name: 'untrusted-text', file: 'wep3.html', receipt: {status: payload, paid: 'false'},
    check: async page => {
      assert.equal(await page.locator('#state').innerText(), payload);
      assert.match(await page.locator('#money').innerText(), /未知/);
      assert.equal(await page.locator('#state img').count(), 0);
    }},
  {name: 'internal-credit-is-not-cash', file: 'wep3.html', receipt: {status: 'internal_credit_settled', paid: false},
    check: async page => {
      assert.match(await page.locator('#state').innerText(), /内部积分/);
      assert.match(await page.locator('#money').innerText(), /付款标记.*否/);
    }},
  {name: 'receipt-http-failure', file: 'wep3.html', status: 503,
    check: async page => assert.match(await page.locator('#state').innerText(), /暂无可读取回执/)},
  {name: 'treasury-unknown-zero-and-escaping', file: 'treasury-dashboard.html',
    dashboard: {today_spend: 0, counts: {pending: 0, success: 1, failed: 0},
      agents: {zero: {used: 0, daily_limit: 200, single_limit: 100, remaining: 200},
        unknown: {}, [payload]: {used: payload, daily_limit: 0}}},
    check: async page => {
      const cards = page.locator('#agents .card');
      assert.match(await cards.nth(0).innerText(), /0/);
      assert.equal(await cards.nth(0).locator('i').getAttribute('style'), 'width:0%');
      assert.match(await cards.nth(1).innerText(), /未知/);
      assert.equal(await cards.nth(1).locator('i').count(), 0);
      assert.equal(await page.locator('#agents img').count(), 0);
      assert.equal(await page.locator('#agents h3').nth(2).innerText(), payload);
    }},
  {name: 'treasury-http-failure', file: 'treasury-dashboard.html', status: 503,
    check: async page => {
      assert.match(await page.locator('#raw').innerText(), /HTTP 503/);
      assert.equal(await page.locator('#stats .card').count(), 0);
    }},
];
const server = createServer((req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1);
  if (req.method !== 'GET' || !Object.hasOwn(files, file)) {res.writeHead(404).end(); return;}
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}).end(files[file]);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  for (const viewport of [{width: 1280, height: 900}, {width: 390, height: 844}]) {
    for (const scenario of fixtureCases) {
      const context = await browser.newContext({viewport, serviceWorkers: 'block'});
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== 'GET') {
          report.non_get_requests.push({method: request.method(), path: url.pathname});
          await route.abort(); return;
        }
        if (url.origin === base && Object.hasOwn(files, url.pathname.slice(1))) {await route.continue(); return;}
        if (url.pathname.endsWith('/knowledge/results/wep3/latest.json')) {
          await route.fulfill({status: scenario.status || 200, json: scenario.receipt || {}}); return;
        }
        if (url.origin === 'https://ltzzz-treasury-v11.ltzyz2181.workers.dev'
            && ['/dashboard', '/health', '/regression'].includes(url.pathname)) {
          const data = url.pathname === '/dashboard' ? scenario.dashboard || {} : health;
          await route.fulfill({status: scenario.status || 200, json: data}); return;
        }
        await route.abort();
      });
      await page.goto(`${base}/${scenario.file}`);
      await page.waitForFunction(file => file === 'wep3.html'
        ? !['', '读取中…'].includes(document.getElementById('state').textContent)
        : document.getElementById('raw').textContent !== 'loading…', scenario.file);
      await scenario.check(page);
      assert.equal(await page.evaluate(() => globalThis.PWNED), undefined);
      assert.deepEqual(errors, []);
      const name = `${scenario.name}-${viewport.width}`;
      if (['contract-failure-and-null-fields', 'treasury-unknown-zero-and-escaping'].includes(scenario.name)) {
        const screenshot = await page.screenshot({fullPage: true});
        fs.writeFileSync(path.join(output, name + '.png'), screenshot);
      }
      report.fixture_results.push({case: name, passed: true});
      await context.close();
    }
  }
  if (process.argv.includes('--production')) {
    for (const file of Object.keys(files)) {
      const context = await browser.newContext({serviceWorkers: 'block'});
      const page = await context.newPage(), errors = [], responses = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (req.method() !== 'GET') {report.non_get_requests.push({method: req.method(), path: url.pathname}); await route.abort(); return;}
        if (!['https://ltzzz.com', 'https://ltzzz-treasury-v11.ltzyz2181.workers.dev'].includes(url.origin)) {
          report.blocked_external_get_requests.push({origin: url.origin, path: url.pathname});
          await route.abort(); return;
        }
        await route.continue();
      });
      page.on('response', response => responses.push({path: new URL(response.url()).pathname, status: response.status()}));
      let response, actualHash;
      const propagation = [];
      const observation = {page: file, passed: false, propagation};
      report.production_results.push(observation);
      for (let attempt = 0; attempt < 12; attempt++) {
        response = await page.goto(`https://ltzzz.com/${file}`, {waitUntil: 'networkidle', timeout: 60000});
        actualHash = sha(await response.body());
        propagation.push({http: response.status(), sha256: actualHash});
        if (response.status() === 200 && compareUiSource(files[file], await response.body()).matched) break;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      const servedBytes = await response.body();
      fs.writeFileSync(path.join(output, `production-${file}-response.html`), servedBytes);
      const headers = response.headers();
      Object.assign(observation, {observed_sha256: actualHash,
        headers: Object.fromEntries(['content-type', 'server', 'etag', 'last-modified', 'cf-cache-status']
          .filter(key => headers[key]).map(key => [key, headers[key]])),
        inline_script_sha256: sha(servedBytes.toString().match(/<script>([\s\S]*?)<\/script>/)?.[1] || ''),
        expected_inline_script_sha256: sha(files[file].toString().match(/<script>([\s\S]*?)<\/script>/)?.[1] || '')});
      observation.external_script_metadata = await page.evaluate(html => {
        const document = new DOMParser().parseFromString(html, 'text/html');
        return Array.from(document.querySelectorAll('script[src]')).map(script => {
          const url = new URL(script.getAttribute('src'), 'https://ltzzz.com');
          let beacon = null;
          try {beacon = JSON.parse(script.getAttribute('data-cf-beacon'));} catch {}
          return {origin: url.origin, path: url.pathname,
            attribute_names: Array.from(script.attributes).map(attribute => attribute.name),
            integrity: script.getAttribute('integrity'), crossorigin: script.getAttribute('crossorigin'),
            type: script.getAttribute('type'),
            beacon_json_keys: beacon && typeof beacon === 'object' ? Object.keys(beacon) : null,
            inline_content_length: script.textContent.length};
        });
      }, servedBytes.toString());
      assert.equal(response.status(), 200);
      observation.source_comparison = compareUiSource(files[file], servedBytes);
      assert.equal(observation.source_comparison.matched, true, 'Production HTML differs beyond permitted Cloudflare analytics injection');
      assert.equal(observation.inline_script_sha256, observation.expected_inline_script_sha256);
      await page.waitForFunction(file => file === 'wep3.html'
        ? !['', '读取中…'].includes(document.getElementById('state').textContent)
        : document.getElementById('raw').textContent !== 'loading…', file);
      assert.deepEqual(errors, []);
      if (file === 'wep3.html') {
        const state = await page.locator('#state').innerText();
        assert.doesNotMatch(state, /暂无可读取回执/);
        const detail = JSON.parse(await page.locator('#detail').innerText());
        if (detail.task_status === 'live_contract_check_failed') {
          assert.match(state, /未通过/); assert.ok(detail.failed_checks.length > 0);
        }
        assert.match(await page.locator('#money').innerText(), /未独立链上核验/);
      } else {
        assert.equal(await page.locator('#stats .card').count(), 6);
        assert.ok(await page.locator('#agents .card').count() > 0);
        assert.ok(JSON.parse(await page.locator('#raw').innerText()).safe);
      }
      const screenshot = await page.screenshot({fullPage: true});
      fs.writeFileSync(path.join(output, `production-${file}.png`), screenshot);
      Object.assign(observation, {passed: true, responses});
      await context.close();
    }
  }
  assert.deepEqual(report.non_get_requests, []);
  report.status = process.argv.includes('--production') ? 'production_browser_verified' : 'fixture_browser_verified';
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
