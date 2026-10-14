import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export const CORE_NAMES=['魄','识神','梦境数据库','文明研究','项目历史','重要事件'];
const entries=text=>[...text.matchAll(/^#{2,3}\s+(?:条目|记录)\s+(\d+)[｜|]/gm)].map(m=>Number(m[1]));
const bodies=text=>new Map([...text.matchAll(/^#{2,3}\s+(?:条目|记录)\s+(\d+)[｜|][^\n]*\n([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/gm)].map(m=>[Number(m[1]),m[2].trim()]));
export function validateCoreDocument(text,{file='memory',archive=''}={}){
 if(!text.trim())throw Error('memory_empty:'+file);
 if(/\d+\s+(?:tokens?|chars?|characters?)\s+truncated|Warning:\s*truncated output|\[\s*content truncated\s*\]/i.test(text))throw Error('memory_truncation_marker:'+file);
 const actual=entries(text),baseline=entries(archive);
 if(new Set(actual).size!==actual.length)throw Error('memory_duplicate_entry:'+file);
 const missing=baseline.filter(n=>!actual.includes(n));if(missing.length)throw Error('memory_missing_entries:'+file+':'+missing.join(','));
 const originalBodies=bodies(archive),currentBodies=bodies(text);for(const [number,body]of originalBodies)if(body.length>200&&(currentBodies.get(number)||'').length<body.length*.3)throw Error('memory_entry_body_too_short:'+file+':'+number);
 return {entries:actual,archive_entries:baseline};
}
export function assertCoreMemory(root=process.cwd()){
 return CORE_NAMES.map(name=>{const file='ltzzz-memory/'+name+'.md',absolute=path.join(root,file),archiveFile=path.join(root,'ltzzz-memory/'+name+'-入档.md'),text=fs.readFileSync(absolute,'utf8'),archive=fs.existsSync(archiveFile)?fs.readFileSync(archiveFile,'utf8'):'';return {file,sha256:crypto.createHash('sha256').update(text).digest('hex'),...validateCoreDocument(text,{file,archive})};});
}
