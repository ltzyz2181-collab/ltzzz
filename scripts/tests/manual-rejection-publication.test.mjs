import test from 'node:test';
import assert from 'node:assert/strict';
import {publishExistingTarget, TARGET} from '../manual-publish-rejection-20261019.mjs';
const json = data => new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json'}});
const verification = {ok: true, published: true, channel_id: TARGET.channel, privacyStatus: 'public', uploadStatus: 'processed'};
test('already public original returns existing video without processing', async () => {
  let posts = 0;
  const r = await publishExistingTarget({token: 'mock-token', fetchImpl: async (url, init) => {
    if (init.method === 'POST') posts++;
    if (url.includes('/queue/status')) return json({receipt: {video_id: 'aBcDeFgHi_1', video_sha256: TARGET.sha256}});
    if (url.includes('/youtube/verify')) return json(verification);
    throw Error('unexpected_request');
  }});
  assert.equal(posts, 0); assert.equal(r.published, true); assert.equal(r.resumed_existing_publication, true);
});
test('wrong queue bytes abort before publication', async () => {
  let posts = 0;
  await assert.rejects(publishExistingTarget({token: 'mock-token', fetchImpl: async (url, init) => {
    if (init.method === 'POST') posts++;
    if (url.includes('/queue/status')) return json({receipt: null});
    if (url.includes('/youtube/status')) return json({connected: true, channel_id: TARGET.channel});
    if (url.includes('/queue/item')) return json({ok: true, queued: true, video_sha256: '0'.repeat(64), bytes: TARGET.bytes, metadata: {title: TARGET.title}});
    throw Error('unexpected_request');
  }}), /exact_queue_item_not_verified/);
  assert.equal(posts, 0);
});
test('only selected item processed once, then fresh Google verification', async () => {
  let posts = 0;
  const r = await publishExistingTarget({token: 'mock-token', sleep: async () => {}, fetchImpl: async (url, init) => {
    if (url.includes('/queue/status')) return json({receipt: posts ? {video_id: 'aBcDeFgHi_1', video_sha256: TARGET.sha256} : null});
    if (url.includes('/youtube/status')) return json({connected: true, channel_id: TARGET.channel});
    if (url.includes('/queue/item')) return json({ok: true, queued: true, video_sha256: TARGET.sha256, bytes: TARGET.bytes, metadata: {title: TARGET.title}});
    if (url.endsWith('/queue/run')) {posts++; assert.equal(init.method, 'POST'); assert.deepEqual(JSON.parse(init.body), {name: TARGET.name}); return json({scanned: 1, new_upload_attempts: 1, results: [{name: TARGET.name, status: 'published'}]});}
    if (url.includes('/youtube/verify')) return json(verification);
    throw Error('unexpected_request');
  }});
  assert.equal(posts, 1); assert.equal(r.published, true); assert.equal(r.queue_upload_requests, 0);
});
