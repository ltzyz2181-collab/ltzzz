'use strict';
// This adapter requires an actual shared POSIX/NFS mount. TOS FUSE and /tmp are
// deliberately unsupported: a writable local directory is not durable storage.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function assertSharedMount(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir)||!dir.startsWith('/mnt/nas/')||dir.split('/').some(p=>p==='..'))throw Error('shared_nas_path_required');
 const rows=fs.readFileSync('/proc/self/mountinfo','utf8').split('\n');
 const mounts=rows.flatMap(line=>{const at=line.indexOf(' - ');if(at<0)return[];const pre=line.slice(0,at).split(' '),post=line.slice(at+3).split(' ');return[{dir:pre[4],type:post[0]}]});
 if(!mounts.some(m=>['nfs','nfs4'].includes(m.type)&&(dir===m.dir||dir.startsWith(m.dir+'/'))))throw Error('actual_shared_nas_mount_required');
}
function createCloudStorage(dir,{verifyMount=assertSharedMount}={}){
 verifyMount(dir);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.realpathSync(dir)!==dir||!fs.lstatSync(dir).isDirectory())throw Error('store_directory_not_regular');
 const lock=path.join(dir,'.transaction-lock'),ledger=path.join(dir,'ledger.json'),keyFile=path.join(dir,'ed25519.pkcs8');
 function locked(fn){try{fs.mkdirSync(lock,{mode:0o700});}catch{throw Error('shared_store_locked_no_lease_stealing');}let r;try{r=fn();}catch(e){fs.rmdirSync(lock);throw e;}if(r&&typeof r.then==='function')return r.finally(()=>fs.rmdirSync(lock));fs.rmdirSync(lock);return r;}
 function read(file,max){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>max||(stat.mode&0o077))throw Error('store_file_not_private_regular');return fs.readFileSync(fd);}finally{fs.closeSync(fd);}}
 function flush(file,bytes,{exclusive=false}={}){
 const fd=fs.openSync(file,(exclusive?fs.constants.O_EXCL:0)|fs.constants.O_CREAT|fs.constants.O_WRONLY|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 }
 function syncDir(){const fd=fs.openSync(dir,fs.constants.O_RDONLY);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 function state(){try{const value=JSON.parse(read(ledger,2000000));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_ledger');return value;}catch(e){if(e.code==='ENOENT')return Object.create(null);throw Error('shared_ledger_corrupt_no_reset');}}
 async function transaction(callback){return locked(async()=>{const data=state();const tx={get:async k=>structuredClone(data[k]),put:async(k,v)=>{if(typeof k!=='string'||!/^(?:operation:[a-f0-9]{64}|budget:\d{4}-\d{2}-\d{2})$/.test(k))throw Error('fixed_ledger_key_required');data[k]=structuredClone(v);}};const result=await callback(tx),bytes=Buffer.from(JSON.stringify(data));if(bytes.length>2000000)throw Error('shared_ledger_size_bound');const temp=ledger+'.'+crypto.randomUUID();try{flush(temp,bytes,{exclusive:true});fs.renameSync(temp,ledger);syncDir();}finally{try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;}}return result;});}
 function signer(binding){return locked(()=>{
  let privateKey;
  try{privateKey=crypto.createPrivateKey({key:read(keyFile,4096),type:'pkcs8',format:'der'});if(privateKey.asymmetricKeyType!=='ed25519')throw Error('wrong_key_algorithm');}
  catch(e){if(e.code!=='ENOENT')throw Error('persisted_signer_key_invalid_no_regeneration');privateKey=crypto.generateKeyPairSync('ed25519').privateKey;flush(keyFile,privateKey.export({type:'pkcs8',format:'der'}),{exclusive:true});syncDir();}
  const public_key_spki=crypto.createPublicKey(privateKey).export({type:'spki',format:'der'}).toString('base64');
  return Object.freeze({public_key_spki,descriptor:async()=>({...binding}),sign:async({key_id,canonical_bytes})=>{if(key_id!=='a2-doubao-model-review-key-v1'||!(canonical_bytes instanceof Uint8Array)||canonical_bytes.length>100000)throw Error('fixed_signing_request_required');return crypto.sign(null,canonical_bytes,privateKey).toString('base64');}});
 });}
 return Object.freeze({storage:{transaction,put:(k,v)=>transaction(tx=>tx.put(k,v))},signer});
}
module.exports={createCloudStorage,assertSharedMount};
