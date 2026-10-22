import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import os from 'node:os';
import path from 'node:path';
const originalExists=fs.existsSync;
const legacy=path.join(os.homedir(),'.rentahuman-agent-keys.json');
fs.existsSync=function(file){return String(file)===legacy?false:originalExists(file);};
syncBuiltinESMExports();
globalThis.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url||String(input));
 const method=options.method||input.method||'GET';
 fs.appendFileSync(process.env.RAH_TEST_REQUEST_LOG,JSON.stringify({method,path:url.pathname})+'\n');
 if(url.origin!=='https://rentahuman.ai')throw new Error('Unexpected fixture origin');
 if(url.pathname==='/api/keys/register-identity')return Response.json({success:true});
 if(url.pathname==='/api/humans')return Response.json({success:true,humans:[],count:0});
 if(url.pathname==='/api/bounties' && process.env.RAH_TEST_MODE==='offline')throw new TypeError('fixture_network_unavailable');
 return Response.json({success:false,error:'fixture_only_no_remote_request'},{status:401});
};
