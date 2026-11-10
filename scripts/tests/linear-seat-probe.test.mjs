import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {probeSeat,SEATS,SCHEMA} from '../linear-seat-probe.mjs';

const BOARD={data:{viewer:{name:'李天柱',email:'ltzyz2181@gmail.com'},organization:{name:'LTZZZ',urlKey:'ltzzz'},issues:{pageInfo:{hasNextPage:false},nodes:[{identifier:'LTZ-5',title:'one',priority:2,updatedAt:'2026-11-10T09:00:00.000Z',url:null,state:{name:'In Progress',type:'started'},comments:{nodes:[]}},{identifier:'LTZ-6',title:'two',priority:3,updatedAt:'2026-11-09T09:00:00.000Z',url:null,state:{name:'Done',type:'completed'},comments:{nodes:[]}}]}}};

function tmp(){return fs.mkdtempSync(path.join(os.tmpdir(),'linear-probe-'));}

test('a seat read writes a receipt that carries the board facts and no credential',async()=>{
 const dir=tmp();
 const {record,file}=await probeSeat({seat:'doubao',key:'lin_api_fixture_secret',resultDir:dir,fetcher:async()=>Response.json(BOARD)});
 assert.equal(record.ok,true);assert.equal(record.seat,'doubao');assert.equal(record.schema,SCHEMA);
 assert.equal(record.viewer_name,'李天柱');assert.equal(record.organization.url_key,'ltzzz');
 assert.equal(record.issue_count,2);assert.deepEqual(record.issue_identifiers,['LTZ-5','LTZ-6']);
 assert.equal(record.issue_states[0].state,'In Progress');assert.equal(record.issue_states[1].state,'Done');
 assert.equal(record.source_type,'native_linear_api_read');assert.equal(record.writes_performed,false);
 assert.match(record.response_sha256,/^[0-9a-f]{64}$/);
 const written=fs.readFileSync(file,'utf8');
 assert.equal(written.includes('lin_api_fixture_secret'),false,'the receipt must never contain the key');
 assert.equal(JSON.parse(written).seat,'doubao');
 fs.rmSync(dir,{recursive:true,force:true});
});

test('a failed seat read is recorded as a failure instead of an empty board',async()=>{
 const dir=tmp();
 const {record}=await probeSeat({seat:'grok',key:'lin_api_bad',resultDir:dir,fetcher:async()=>new Response('Unauthorized',{status:401})});
 assert.equal(record.ok,false);assert.equal(record.http,401);assert.equal(record.error,'linear_graphql_failed');
 assert.equal(record.source_type,'failed_read');assert.equal(record.issue_count,null);
 assert.equal(record.issue_identifiers,null);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('an unknown seat and a missing credential are refused before any request',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json(BOARD);};
 await assert.rejects(()=>probeSeat({seat:'nobody',key:'lin_api_fixture',fetcher}),/unknown_seat/);
 await assert.rejects(()=>probeSeat({seat:'kimi',key:'',fetcher}),/linear_key_not_configured/);
 assert.equal(calls,0);
 assert.equal(SEATS.includes('doubao')&&SEATS.includes('qianwen')&&SEATS.includes('kimi')&&SEATS.includes('grok')&&SEATS.includes('deepseek'),true);
});
