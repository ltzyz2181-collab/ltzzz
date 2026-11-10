import test from 'node:test';import assert from 'node:assert/strict';
import {readLinearBoard,DEFAULT_ENDPOINT} from '../lib/linear-read.mjs';

const BOARD={data:{viewer:{name:'李天柱',email:'ltzyz2181@gmail.com'},organization:{name:'LTZZZ',urlKey:'ltzzz'},issues:{pageInfo:{hasNextPage:false},nodes:[{identifier:'LTZ-5',title:'微信小程序沙箱路由与真实回调验收',priority:2,updatedAt:'2026-11-10T09:00:00.000Z',url:'https://linear.app/ltzzz/issue/LTZ-5',state:{name:'In Progress',type:'started'},comments:{nodes:[{id:'c-1',body:'  comment   with   whitespace  ',createdAt:'2026-11-10T09:01:00.000Z'}]}},{identifier:'LTZ-6',title:'GOAL-LTZZZ-AUTONOMY',priority:3,updatedAt:'2026-11-09T09:00:00.000Z',url:'https://linear.app/ltzzz/issue/LTZ-6',state:{name:'Done',type:'completed'},comments:{nodes:[]}}]}}};

test('a permitted read returns the real board identity, issues and de-identified comment excerpts',async()=>{
 let seen=null;
 const fetcher=async(url,options)=>{seen={url,options};return Response.json(BOARD);};
 const r=await readLinearBoard({key:'lin_api_fixture',fetcher});
 assert.equal(seen.url,DEFAULT_ENDPOINT);
 assert.ok(seen.options.signal,'the read must carry a timeout');
 assert.equal(seen.options.headers.Authorization,'lin_api_fixture');
 assert.equal(JSON.stringify(seen.options).includes('mutation'),false,'this client must stay read-only');
 assert.equal(r.ok,true);assert.equal(r.http,200);
 assert.equal(r.viewer.name,'李天柱');assert.equal(r.organization.url_key,'ltzzz');
 assert.equal(r.issue_count,2);assert.equal(r.has_next_page,false);
 assert.equal(r.issues[0].identifier,'LTZ-5');assert.equal(r.issues[0].state,'In Progress');
 assert.equal(r.issues[0].comments[0].excerpt,'comment with whitespace');
 assert.equal(r.issues[1].state,'Done');assert.equal(r.issues[1].comments.length,0);
 assert.match(r.response_sha256,/^[0-9a-f]{64}$/);
});

test('a GraphQL error payload is a failure even when the HTTP status is 200',async()=>{
 const r=await readLinearBoard({key:'lin_api_fixture',fetcher:async()=>Response.json({errors:[{message:'Argument orderBy is invalid'}]})});
 assert.equal(r.ok,false);assert.equal(r.http,200);assert.equal(r.error,'linear_graphql_failed');
 assert.deepEqual(r.graphql_errors,['Argument orderBy is invalid']);
 assert.equal(r.issue_count,undefined,'a failed read must never look like an empty board');
});

test('an unauthorized key and a non-JSON body are both reported as failures, never as an empty board',async()=>{
 const unauthorized=await readLinearBoard({key:'lin_api_bad',fetcher:async()=>new Response('Authentication required',{status:401})});
 assert.equal(unauthorized.ok,false);assert.equal(unauthorized.http,401);
 const broken=await readLinearBoard({key:'lin_api_fixture',fetcher:async()=>new Response('<html>gateway</html>',{status:502})});
 assert.equal(broken.ok,false);assert.equal(broken.http,502);
});

test('a missing credential and an out-of-range page size are rejected before any request',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json(BOARD);};
 await assert.rejects(()=>readLinearBoard({key:'',fetcher}),/linear_key_required/);
 await assert.rejects(()=>readLinearBoard({key:'lin_api_fixture',first:0,fetcher}),/invalid_page_size/);
 await assert.rejects(()=>readLinearBoard({key:'lin_api_fixture',first:101,fetcher}),/invalid_page_size/);
 assert.equal(calls,0);
});
