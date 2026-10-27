// Source binding is NOT hardware integrity evidence. Independent cloud IAM/readback
// must be verified before a BASE registry can enable these public descriptors.
import {canonical,digest} from './patchgate-attestation-evidence.mjs';
import {A2_REVIEW_FILES} from './patchgate-a2-manifest.mjs';
// Cover the fixed executable dependency closure, not just the HTTP entrypoint.
// Configuration is authenticated separately by the A2 bundle (avoids a source-hash self-reference).
export const SIGNER_SOURCE_FILES=Object.freeze(A2_REVIEW_FILES.filter(p=>/\.(?:mjs|js)$/.test(p)&&!p.startsWith('scripts/tests/')));
const HASH=/^[a-f0-9]{64}$/;
export async function signerSourceDigest(read){
 const files=[];for(const path of SIGNER_SOURCE_FILES)files.push({path,sha256:await digest(await read(path))});return {sha256:await digest(canonical(files)),files};
}
export async function cloudSignerDescriptor({signer,sourceSha256,cloudAccount,evidenceSha256}){
 if(!signer||typeof signer.descriptor!=='function'||typeof signer.sign!=='function'||'privateKey' in signer||'private_key' in signer||'SIGNING_PKCS8' in signer||typeof signer.export==='function')throw Error('opaque_cloud_signer_required');
 const d=await signer.descriptor();
 if(!HASH.test(sourceSha256||'')||d?.source_sha256!==sourceSha256||typeof cloudAccount!=='string'||!cloudAccount||d.cloud_account_binding!==cloudAccount||!HASH.test(evidenceSha256||'')||d.deployment_evidence_sha256!==evidenceSha256)throw Error('source_deployment_binding_required');return d;
}
