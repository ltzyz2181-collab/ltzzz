// DID 身份层：为每个 AI Agent 注册 W3C did:key + EOA（信誉载体）
// 用法:
//   node scripts/did-agent-identity.mjs --agent gpt --new-key     # 生成密钥对 → 打印私钥（进 GitHub Secret）+ 写注册表（只存公开信息）
//   node scripts/did-agent-identity.mjs --agent gpt --pubkey 0x.. # 用已有公钥推导 did:key（不生成密钥）
// 私钥绝不写入本仓库；注册表只存 did / address / grade / score。
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Wallet } from "ethers";
import { WALLET_DIR, readJSON, writeJSON, today } from "./wallet-lib.mjs";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes) {
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  if (n === 0n) return ALPHABET[0];
  let s = "";
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  return s;
}
// did:key secp256k1: 0xe7 0x01 + 33-byte 压缩公钥 → base58btc → "z" 前缀
export function didKeyFromPubkey(compressedPubkeyHex) {
  const pk = compressedPubkeyHex.startsWith("0x") ? compressedPubkeyHex.slice(2) : compressedPubkeyHex;
  const bytes = Buffer.concat([Buffer.from([0xe7, 0x01]), Buffer.from(pk, "hex")]);
  return "z" + base58Encode(bytes);
}
export function didKeyToPubkeyHex(did) {
  // 反推：base58btc 解码 → 去 e701 前缀 → 33 字节压缩公钥 hex
  const enc = did.startsWith("z") ? did.slice(1) : did;
  let n = 0n;
  for (const ch of enc) n = n * 58n + BigInt(ALPHABET.indexOf(ch));
  const hex = n.toString(16).padStart(70, "0"); // 35 bytes = 70 hex
  return "0x" + hex.slice(4);
}

function registryPath() { return path.join(WALLET_DIR, "identity-registry.json"); }

async function main() {
  const { values } = parseArgs({ options: { agent: { type: "string" }, "new-key": { type: "boolean" }, pubkey: { type: "string" } }, strict: true });
  const agent = values.agent;
  if (!agent) { console.error("用法: node scripts/did-agent-identity.mjs --agent <id> [--new-key | --pubkey 0x..]"); process.exit(2); }
  const reg = readJSON(registryPath(), { agents: {} });
  if (!reg.agents[agent]) { console.error(`未知 Agent: ${agent}（先在 identity-registry.json 或 spending-policy.json 注册）`); process.exit(1); }

  let pubkeyHex;
  if (values["new-key"]) {
    const w = Wallet.createRandom();
    pubkeyHex = w.signingKey.compressedPublicKey;
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`新密钥已生成（${agent}）`);
    console.log(`  地址(EOA): ${w.address}`);
    console.log(`  私钥: ${w.privateKey}`);
    console.log("  → 私钥只放入 GitHub Secret，命名建议: LTZZZ_AGENT_" + agent.toUpperCase() + "_KEY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } else if (values.pubkey) {
    pubkeyHex = values.pubkey;
  } else {
    console.error("请提供 --new-key 或 --pubkey"); process.exit(2);
  }

  const did = "did:key:" + didKeyFromPubkey(pubkeyHex);
  reg.agents[agent] = {
    ...reg.agents[agent],
    did,
    address: values["new-key"] ? undefined : reg.agents[agent].address,
    grade: reg.agents[agent].grade || "B",
    score: reg.agents[agent].score ?? 100,
    status: values["new-key"] ? "key_generated" : "did_registered",
    did_registered_at: today(),
  };
  writeJSON(registryPath(), reg);
  console.log(`✅ ${agent} DID 已注册: ${did}`);
  console.log(`   注册表: agent-wallet/identity-registry.json（仅公开信息，私钥不进库）`);
}

// 命令行直接运行（被 import 时不执行）
if (process.argv[1] && import.meta.url === "file:///" + encodeURI(path.resolve(process.argv[1]).replace(/\\/g, "/"))) {
  main().catch((e) => { console.error("失败:", e.message); process.exit(1); });
}
