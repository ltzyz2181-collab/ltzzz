import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 合并邮件摄入产物是每日流水线的输入，CI 只校验落盘结果的结构与脱敏约束，
// 不重跑采集（CI 无收信凭据，也不允许把正文带进仓库）。
const ARTIFACT='knowledge/results/deep-superagent/mail-intake/latest.json';
const raw=fs.existsSync(ARTIFACT)?fs.readFileSync(ARTIFACT,'utf8'):'';
const doc=raw?JSON.parse(raw):null;

test('mail intake artifact exists and is parseable',()=>{
  assert.ok(doc,'mail-intake/latest.json 缺失：流水线第一步产物必须落盘');
  assert.equal(doc.schema,'ltzzz.mail-intake.v1');
});

test('mail intake never claims success when a channel failed',()=>{
  assert.ok(['ok','partial','failed'].includes(doc.status));
  const gmailOk=doc.gmail_fullbox?.status==='ok';
  const agentOk=doc.agent_mail?.run_code===0;
  const expected=gmailOk&&agentOk?'ok':(gmailOk||agentOk?'partial':'failed');
  assert.equal(doc.status,expected,'status 必须由两条通道的真实结果推导，不得写死 ok');
});

test('mail intake persists no bodies and no credentials',()=>{
  assert.equal(doc.bodies_persisted,false);
  assert.equal(doc.read_only,true);
  const text=raw.toLowerCase();
  for(const forbidden of ['app_password','password','client_secret','refresh_token','authorization']){
    assert.ok(!text.includes(forbidden),`产物不得包含凭据字段：${forbidden}`);
  }
});

test('open items carry only desensitized fields',()=>{
  const allowed=new Set(['channel','ref','status','age_days','subject_short','has_dispatch_wording']);
  for(const item of doc.open_items||[]){
    for(const key of Object.keys(item))assert.ok(allowed.has(key),`多余字段 ${key}：待办项只允许脱敏字段`);
    assert.ok(['agent_mail','gmail_fullbox'].includes(item.channel));
    assert.ok(String(item.subject_short||'').length<=72,'短标题不得超过 72 字');
  }
  assert.ok((doc.open_items||[]).length<=200,'待办清单必须有上限');
});
