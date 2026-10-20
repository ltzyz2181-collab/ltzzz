import fs from 'node:fs';import path from 'node:path';
export function registeredWallet(id,root=process.cwd()){
 const lines=fs.readFileSync(path.join(root,'wallet/addresses.md'),'utf8').split('\n');
 const rows=lines.filter(l=>l.startsWith('|')).map(l=>l.split('|').slice(1,-1).map(c=>c.trim())).filter(cols=>cols[0]===id);
 if(rows.length!==1)throw Error('unique_wallet_registry_id_required');const row=rows[0],address=row[2].replaceAll('`','');
 if(!/^0x[0-9a-fA-F]{40}$/.test(address))throw Error('invalid_registered_address');return {registry_id:id,network:row[1],address,source:'wallet/addresses.md'};
}
