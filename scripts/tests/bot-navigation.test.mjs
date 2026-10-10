import test from 'node:test';import assert from 'node:assert/strict';import {reply,commands,keyboard} from '../../channels/bot-content.mjs';import telegram from '../../telegram-bot-worker.js';import wechat from '../../ltzzz-wechat-publisher-worker.js';
test('welcome explains project and commands are explicit',async()=>{assert.match(await reply('start'),/AI发布任务/);assert.equal(commands.length,6);assert.equal(keyboard.inline_keyboard.length,3);assert.match(await reply('wallet'),/不是同一条链/);});
test('no invented unlimited access',async()=>{assert.match(await reply('help'),/不承诺无限/);});
test('telegram refuses unverified webhook and admin access',async()=>{assert.equal((await telegram.fetch(new Request('https://bot/webhook',{method:'POST',body:'{}'}),{})).status,403);assert.equal((await telegram.fetch(new Request('https://bot/configure',{method:'POST'}),{})).status,401);});
test('wechat publisher refuses unauthenticated publishing',async()=>{assert.equal((await wechat.fetch(new Request('https://bot/publish',{method:'POST'}),{})).status,401);});

test('Telegram uses English without public value slogans',async()=>{const r=await telegram.fetch(new Request('https://bot/preview?command=start'),{});const d=await r.json();assert.match(d.text,/Welcome to LTZZZ/);assert.doesNotMatch(d.text,/怜悯|生存尊严/);});
