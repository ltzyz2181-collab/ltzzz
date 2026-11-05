import {Wallet, verifyMessage} from 'ethers';

export const SIGNER_PROOF_REVISION = 'operating-treasury-proof-v1';
export const OPERATING_TREASURY = '0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d';
const ORIGIN = 'https://ltzzz-wep3.ltzyz2181.workers.dev';
const reply = (body, status) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
export const identityProofMessage = (nonce,issued) => ['LTZZZ operating treasury identity proof only', 'Not login, payment, permit, transaction or five-signature wallet authorization', 'origin='+ORIGIN, 'chain_id=8453', 'address='+OPERATING_TREASURY, 'nonce='+nonce, 'issued_at='+issued].join('\n');

// A separate identity-only boundary. Never inject this key into legacy Market,
// accept arbitrary signing text, sign typed data/transactions, or broadcast.
export async function signerProofRoute(request, env, {clock = Date.now} = {}) {
  const url = new URL(request.url);
  if (url.pathname !== '/treasury/signer-proof') return null;
  if (request.method !== 'GET') return reply({ok:false,error:'method_not_allowed'},405);
  const supplied = request.headers.get('X-Lab-Pin');
  if (!env.WEP3_RUNNER_TOKEN || supplied !== env.WEP3_RUNNER_TOKEN) return reply({ok:false,error:'runner_auth_required'},401);
  const keys = [...url.searchParams.keys()];
  const nonce = url.searchParams.get('nonce');
  if (keys.length !== 1 || keys[0] !== 'nonce' || !/^[a-f0-9]{64}$/.test(nonce || '')) return reply({ok:false,error:'one_hex_nonce_required'},422);
  const base = {revision:SIGNER_PROOF_REVISION,address:OPERATING_TREASURY,chain_id:8453,source_commit:env.WEP3_SOURCE_COMMIT||null,transaction_adapter_ready:false,transactions:0,on_chain_executed:false,paid:false,tx_hash:null};
  if (!env.TREASURY_EXECUTOR_KEY) return reply({...base,ok:false,signer_available:false,error:'worker_treasury_binding_missing'},503);
  try {
    const wallet = new Wallet(env.TREASURY_EXECUTOR_KEY);
    if (wallet.address.toLowerCase() !== OPERATING_TREASURY.toLowerCase() || env.X402_RECEIVE_ADDRESS?.toLowerCase() !== OPERATING_TREASURY.toLowerCase()) return reply({...base,ok:false,signer_available:false,error:'operating_treasury_address_mismatch'},409);
    const issued = new Date(clock()).toISOString();
    const message = identityProofMessage(nonce,issued);
    const signature = await wallet.signMessage(message);
    if (verifyMessage(message,signature).toLowerCase() !== OPERATING_TREASURY.toLowerCase()) throw Error();
    return reply({...base,ok:true,signer_available:true,proof_kind:'eip191_identity_only',nonce,issued_at:issued,message,signature},200);
  } catch { return reply({...base,ok:false,signer_available:false,error:'operating_signer_proof_failed'},503); }
}
