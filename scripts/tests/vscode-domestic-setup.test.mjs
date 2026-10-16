import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {validateDomesticTemplate,prepareDomesticSetup,TEMPLATE} from '../lib/vscode-domestic-setup.mjs';
const template=()=>JSON.parse(fs.readFileSync(TEMPLATE,'utf8'));
test('template separates engineering and daily models and contains a secure reference rather than a key',()=>{
 const r=validateDomesticTemplate(template());assert.deepEqual(r.models,['deepseek-v4-pro','deepseek-flash']);assert.equal(r.credential_mode,'VS_Code_secret_input_reference');assert.equal(r.endpoint,'https://api.deepseek.com/v1/chat/completions');
});
test('reject credentials, recipient-host changes, hidden headers, unexpected providers and unsafe thinking profiles',()=>{
 const changes=[c=>c[0].apiKey='sk-fake-do-not-send',c=>c[0].url='https://other.invalid',c=>c[0].models[0].url='https://api.deepseek.com.attacker.invalid/v1/chat/completions',c=>c[0].models[0].requestHeaders={Authorization:'Bearer fake'},c=>c[0].models[0].modelOptions={thinking:{type:'enabled'}},c=>c.push(structuredClone(c[0])),c=>c[0].models[1].id='deepseek-v4-pro'];
 for(const mutate of changes){const c=template();mutate(c);assert.throws(()=>validateDomesticTemplate(c));}
});
test('local preparation preserves UTF-8 and never accesses provider credentials, user settings or network',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vscode-domestic-'));
 try{const src=path.join(root,TEMPLATE);fs.mkdirSync(path.dirname(src),{recursive:true});fs.copyFileSync(TEMPLATE,src);
  const r=prepareDomesticSetup({root}),text=fs.readFileSync(path.join(root,r.output),'utf8');assert.ok(text.includes('工程'));assert.ok(text.includes('日常'));assert.ok(text.includes('${input:ltzzzDeepSeekApiKey}'));assert.equal(r.status,'prepared_not_installed');assert.equal(r.model_calls,0);assert.equal(r.credentials_read,false);assert.equal(r.VS_Code_user_settings_modified,false);assert.equal(r.actual_tool_call_verified,false);assert.equal(r.output_created,true);
  fs.writeFileSync(path.join(root,r.output),'User-local edited configuration');const again=prepareDomesticSetup({root});assert.equal(again.output_created,false);assert.equal(again.existing_output_validated,false);assert.equal(fs.readFileSync(path.join(root,r.output),'utf8'),'User-local edited configuration');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('invalid or credential-bearing template is rejected before creating local artifacts',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vscode-invalid-'));
 try{const src=path.join(root,TEMPLATE),bad=template();bad[0].apiKey='sk-fake-sensitive';fs.mkdirSync(path.dirname(src),{recursive:true});fs.writeFileSync(src,JSON.stringify(bad));assert.throws(()=>prepareDomesticSetup({root}));assert.equal(fs.existsSync(path.join(root,'.ltzzz-tools')),false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
