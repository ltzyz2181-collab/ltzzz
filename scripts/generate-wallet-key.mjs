// 生成 LTZZZ 自托管钱包密钥（一次性工具，仅在本机运行）
// 私钥写入 ltzzz-secrets.md（已在 .gitignore，绝不进仓库/对话/日志），不在终端打印。
// 复制进 GitHub Secret `LTZZZ_WALLET_PRIVATE_KEY` 后删除该文件。
import { Wallet } from "ethers";
import fs from "node:fs";
import path from "node:path";

const w = Wallet.createRandom();
const secretsFile = path.join(process.cwd(), "ltzzz-secrets.md");

let content = "";
if (fs.existsSync(secretsFile)) content = fs.readFileSync(secretsFile, "utf8") + "\n";
content += `\n## LTZZZ 自托管钱包（生成于 ${new Date().toISOString()}）\n地址: ${w.address}\n私钥: ${w.privateKey}\n`;
fs.writeFileSync(secretsFile, content, "utf8");

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("LTZZZ 自托管钱包（Base）已生成");
console.log("  地址: " + w.address);
console.log("  私钥已写入: ltzzz-secrets.md（已 gitignore，不会进仓库）");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("下一步（只做一次）:");
console.log("1. 打开 ltzzz-secrets.md，把私钥复制到 GitHub Actions Secret: LTZZZ_WALLET_PRIVATE_KEY");
console.log("2. 复制完成后删除 ltzzz-secrets.md（私钥丢失=资金永久锁定）");
console.log("3. 从 Safe 向上面地址转入 Base USDC 实验资金（+少量 ETH 作 gas）");
