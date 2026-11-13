import fs from 'node:fs';
const CANON=['README','装备论','魄','识神','梦境数据库','文明研究','项目历史','重要事件'].map(n=>`ltzzz-memory/${n}.md`);
const manifest=JSON.parse(fs.readFileSync('ltzzz-memory/manifest.json','utf8'));
const listed=new Set(manifest.files||[]), order=new Set(manifest.read_order||[]);
const missing=CANON.filter(f=>!listed.has(f));
const unreadable=CANON.filter(f=>{try{return !fs.readFileSync(f,'utf8').trim();}catch{return true;}});
const orderMissing=CANON.filter(f=>!order.has(f));
const stray=[...listed].filter(f=>/^ltzzz-memory\/.*-(v\d+|入档|补录[^/]*)\.md$/.test(f));
const strict=process.argv.includes('--strict');
if(missing.length||unreadable.length||orderMissing.length){
 const report={status:'memory_manifest_inconsistent',missing,unreadable,order_missing:orderMissing,strict};
 console.error(JSON.stringify(report,null,1));
 if(strict)process.exitCode=1;
}else{
 console.log(JSON.stringify({status:'memory_manifest_consistent',canonical:CANON.length,listed:listed.size,archive_variants:stray.length,read_order:order.size}));
}
