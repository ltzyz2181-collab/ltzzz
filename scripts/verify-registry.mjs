// 链上验证 ReputationRegistry 部署真实有效
import { readFileSync } from 'fs';
import { ethers } from 'ethers';
const { contract: ADDR } = JSON.parse(readFileSync('deploy-result.txt', 'utf8'));
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const code = await provider.getCode(ADDR);
console.log('contract code exists:', code.length > 2, `(${code.length} bytes)`);
const IFS = ['function guardians(uint256) view returns (address)', 'function isGuardian(address) view returns (bool)', 'function getGrade(address) view returns (string,uint256)'];
const c = new ethers.Contract(ADDR, IFS, provider);
for (let i = 0; i < 3; i++) console.log(`guardians[${i}]:`, await c.guardians(i));
console.log('isGuardian(0xD834a769...):', await c.isGuardian('0xD834a769b31447daf5a042009CF06fAFCE7e2F51'));
const [g, s] = await c.getGrade('0xD834a769b31447daf5a042009CF06fAFCE7e2F51');
console.log('grade of unregistered:', g, s);
console.log('DONE');
