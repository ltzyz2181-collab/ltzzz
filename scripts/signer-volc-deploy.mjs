#!/usr/bin/env node
// 火山签名服务部署 CLI（凭据只从 env 读取，不回显）
import fs from 'node:fs';
import { volcRequest } from './lib/volc-openapi.mjs';

const REGION = 'cn-beijing';
const SERVICE = 'vefaas';
const VERSION = '2024-06-06';
const FUNC_NAME = 'ltzzz-signer-volc-attest';

function log(label, obj) { console.log(`[${label}]`, JSON.stringify(obj, null, 2).slice(0, 1500)); }

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function ensureReleased() {
  const list = await volcRequest({ action: 'ListFunctions', version: VERSION, region: REGION, service: SERVICE, body: { Limit: 50, PageNumber: 1 } });
  const item = (list?.Result?.Items || []).find((i) => i.Name === FUNC_NAME);
  if (!item?.Id) throw Error(`function not found: ${FUNC_NAME}`);
  const id = item.Id;
  const st = await volcRequest({ action: 'GetReleaseStatus', version: VERSION, region: REGION, service: SERVICE, body: { FunctionId: id } });
  if (st?.Result?.Status === 'done') return { id, already: true, status: 'done' };
  const rel = await volcRequest({
    action: 'Release', version: VERSION, region: REGION, service: SERVICE,
    body: { FunctionId: id, RevisionNumber: 0, TargetTrafficWeight: 100, RollingStep: 100, MaxInstance: 2, Description: 'LTZZZ signer initial full release' },
  });
  for (let i = 0; i < 36; i++) {
    const s = await volcRequest({ action: 'GetReleaseStatus', version: VERSION, region: REGION, service: SERVICE, body: { FunctionId: id } });
    const status = s?.Result?.Status;
    if (status === 'done') return { id, already: false, status: 'done', rel };
    if (status === 'failed') throw Error(`release failed: ${JSON.stringify(s?.Result)}`);
    await sleep(5000);
  }
  throw Error('release timeout');
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) throw Error('usage: signer-volc-deploy.mjs <list|deploy|update|get|delete>');
  switch (cmd) {
    case 'list': {
      const ak = process.env.VOLC_ACCESS_KEY || '';
      const sk = process.env.VOLC_SECRET_KEY || '';
      console.log(JSON.stringify({ ak_prefix: ak.slice(0, 4), ak_len: ak.length, sk_len: sk.length }));
      let vefaas = null, iamProbe = null;
      try {
        const r = await volcRequest({ action: 'ListFunctions', version: VERSION, region: REGION, service: SERVICE, body: { Limit: 50, PageNumber: 1 } });
        vefaas = { ok: true, items: (r?.Result?.Items || []).map((i) => ({ id: i.Id, name: i.Name, runtime: i.Runtime, status: i.Status, update: i.UpdateTime })) };
      } catch (e) { vefaas = { ok: false, error: e.message }; }
      // 分诊：同一凭据走 IAM 专用域名网关，区分「密钥问题」与「统一网关签名差异」
      try {
        const r2 = await volcRequest({ action: 'ListUsers', version: '2018-01-01', service: 'iam', host: 'iam.volcengineapi.com', body: null });
        iamProbe = { ok: true, users: (r2 && r2.Result && r2.Result.User && r2.Result.User.length) || 0 };
      } catch (e) { iamProbe = { ok: false, error: e.message }; }
      console.log(JSON.stringify({ vefaas, iamProbe }, null, 2));
      if (!vefaas.ok || !iamProbe.ok) throw Error('probe_failed');
      return;
    }
    case 'get': {
      const rel = await ensureReleased();
      const r = await volcRequest({ action: 'GetFunction', version: VERSION, region: REGION, service: SERVICE, body: { Id: rel.id } });
      log('get', { release: { already: rel.already, status: rel.status }, id: rel.id, function: r?.Result ? { id: r.Result.Id, name: r.Result.Name, status: r.Result.Status, update: r.Result.UpdateTime } : r });
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
        CpuStrategy: 'request',
        ProjectName: 'default',
      };
      let r;
      try {
        const list = await volcRequest({ action: 'ListFunctions', version: VERSION, region: REGION, service: SERVICE, body: { Limit: 50, PageNumber: 1 } });
        const item = (list?.Result?.Items || []).find((i) => i.Name === FUNC_NAME);
        r = item
          ? await volcRequest({ action: 'UpdateFunction', version: VERSION, region: REGION, service: SERVICE, body: { Id: item.Id, SourceType: 'zip', Source: zipB64 } })
          : await volcRequest({ action: 'CreateFunction', version: VERSION, region: REGION, service: SERVICE, body });
      } catch (e) {
        // fallback: treat as create if update-style error (e.g. function not found mid-flight)
        r = await volcRequest({ action: 'CreateFunction', version: VERSION, region: REGION, service: SERVICE, body }).catch(() => { throw e; });
      }
      log('create', { id: r?.Id, name: r?.Name, codeSize: r?.CodeSize, raw: r?.Result ? { id: r.Result.Id, name: r.Result.Name } : undefined });
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
