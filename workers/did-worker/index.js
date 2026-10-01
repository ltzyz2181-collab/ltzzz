// LTZZZ DID Worker（ltzzz-did）
// 输入: { agent, pubkey } → 返回 W3C did:key（公钥纯函数）
// 安全设计: 不接收/不生成任何私钥。did:key 由压缩公钥推导，任何人可复验。
// 注册记录存 KV（IDENTITY_KV），与 identity-registry.json 同构。

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes) {
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  if (n === 0n) return ALPHABET[0];
  let s = "";
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  return s;
}

// did:key secp256k1: 0xe7 0x01 + 33-byte 压缩公钥 → base58btc → "z" 前缀
function didKeyFromPubkey(compressedPubkeyHex) {
  const pk = (compressedPubkeyHex.startsWith("0x") ? compressedPubkeyHex.slice(2) : compressedPubkeyHex)
    .toLowerCase().replace(/^0+/, "") || "0";
  const body = pk.length % 2 === 1 ? "0" + pk : pk;
  // 校验: 33 字节 = 66 hex
  if (body.length !== 66) throw new Error("pubkey must be 33-byte compressed (66 hex)");
  const bytes = Buffer.concat([Buffer.from([0xe7, 0x01]), Buffer.from(body, "hex")]);
  return "z" + base58Encode(bytes);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }

    if (request.method === "GET") {
      const agent = new URL(request.url).searchParams.get("agent");
      if (agent && env.IDENTITY_KV) {
        const rec = await env.IDENTITY_KV.get(`agent:${agent}`);
        if (rec) return json({ ok: true, registered: JSON.parse(rec) });
        return json({ ok: true, registered: null });
      }
      return json({ ok: true, name: "ltzzz-did", message: "LTZZZ DID Worker", endpoints: ["GET /?agent=x", "POST {agent,pubkey}"] });
    }

    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
      const { agent, pubkey } = body;
      if (!agent || !pubkey) return json({ ok: false, error: "need agent + pubkey(0x..)" }, 400);
      try {
        const did = didKeyFromPubkey(pubkey);
        const rec = { agent, did, pubkey, ts: new Date().toISOString() };
        if (env.IDENTITY_KV) await env.IDENTITY_KV.put(`agent:${agent}`, JSON.stringify(rec));
        return json({ ok: true, did, note: "did:key 纯函数，无私钥参与" });
      } catch (e) {
        return json({ ok: false, error: e.message }, 400);
      }
    }

    return json({ ok: false, error: "method not allowed" }, 405);
  },
};
