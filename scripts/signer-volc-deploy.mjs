#!/usr/bin/env node
// 火山签名服务部署 CLI（凭据只从 env 读取，不回显）
import fs from 'node:fs';
import { volcRequest } from './lib/volc-openapi.mjs';

const REGION = 'cn-beijing';
const SERVICE = 'vefaas';
const VERSION = '2024-06-06';
const FUNC_NAME = 'ltzzz-signer-volc-attest';

function log(label, obj) { console.log(`[${label}]`, JSON.stringify(obj, null, 2).slice(0, 1500)); }

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) throw Error('usage: signer-volc-deploy.mjs <list|deploy|update|get|delete>');
  switch (cmd) {
    case 'list': {
      const r = await volcRequest({ action: 'ListFunctions', version: VERSION, region: REGION, service: SERVICE, body: { Limit: 50, PageNumber: 1 } });
      log('list', r);
      return;
    }
    case 'get': {
      const r = await volcRequest({ action: 'GetFunction', version: VERSION, region: REGION, service: SERVICE, body: { Name: FUNC_NAME } });
      log('get', r);
      return;
    }
    case 'deploy': {
      const zipPath = args[0] || 'cloud/signer-volc-attest/function.zip';
      if (!fs.existsSync(zipPath)) throw Error(`zip missing: ${zipPath}`);
      const zipB64 = fs.readFileSync(zipPath).toString('base64');
      const envs = [];
      const passthrough = ['ARK_API_KEY','SIGNER_EXECUTOR_ID','SIGNER_SOURCE_SHA256','SIGNER_EVIDENCE_SHA256','SIGNER_CLOUD_ACCOUNT_BINDING','SIGNER_DEFAULT_MODEL','SIGNER_DAILY_LIMIT','SIGNER_STORE_DIR'];
      for (const k of passthrough) if (process.env[k]) envs.push({ Key: k, Value: process.env[k] });
      const body = {
        Name: FUNC_NAME,
        Description: 'LTZZZ A2 model attestation signer (volcengine_ark). Private key generated and held on Volcano side only.',
        Runtime: 'node20/v1',
        ExclusiveMode: false,
        RequestTimeout: 30,
        MaxConcurrency: 20,
        MemoryMB: 1024,
        SourceType: 'zip',
        Source: zipB64,
        Envs: envs,
        VpcConfig: { EnableVpc: false, EnableSharedInternetAccess: true },
        CpuStrategy: 'always',
        ProjectName: 'default',
      };
      const r = await volcRequest({ action: 'CreateFunction', version: VERSION, region: REGION, service: SERVICE, body });
      log('create', { id: r?.Id, name: r?.Name, codeSize: r?.CodeSize });
      return;
    }
    case 'update': {
      const zipPath = args[0] || 'cloud/signer-volc-attest/function.zip';
      if (!fs.existsSync(zipPath)) throw Error(`zip missing: ${zipPath}`);
      const zipB64 = fs.readFileSync(zipPath).toString('base64');
      const body = { Name: FUNC_NAME, SourceType: 'zip', Source: zipB64 };
      const r = await volcRequest({ action: 'UpdateFunction', version: VERSION, region: REGION, service: SERVICE, body });
      log('update', r);
      return;
    }
    default:
      throw Error(`unknown cmd ${cmd}`);
  }
}

main().catch((e) => { console.error('FAIL:', e.message); process.exitCode = 1; });
