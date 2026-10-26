import fs from 'node:fs';
import path from 'node:path';
import {createHash, createPublicKey, verify} from 'node:crypto';

export const TASK = 'PLAN-PATCHGATE-ESCROW-20261023';
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Z0-9][A-Z0-9_-]{6,80}$/;
const PROVIDERS = new Set(['openai', 'anthropic', 'aliyun_dashscope', 'volcengine_ark', 'deepseek', 'xai', 'moonshot', 'github_actions', 'github_connector']);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => JSON.stringify(order(value));
function order(value) {
  if (Array.isArray(value)) return value.map(order);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, order(value[k])]));
  return value;
}
const validPath = p => typeof p === 'string' && p.length < 512 && !p.startsWith('/') && !/[\\\x00-\x1f\x7f]/.test(p)
  && p.split('/').every(part => part && part !== '.' && part !== '..' && part !== '.git');
const isSensitiveName = p => /(^|\/)(\.env(?:\.|$)|[^/]*(?:private[-_]?key|credentials|secrets?)[^/]*$)/i.test(p);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function validatePolicy(p) {
  if (p?.schema_version !== 1 || p.task_id !== TASK || p.repository !== 'ltzyz2181-collab/ltzzz'
    || p.phase !== 'A0' || p.mode !== 'validation_only'
    || [p.automatic_merge, p.automatic_deploy, p.automatic_rollback, p.real_funds_enabled].some(x => x !== false)) throw Error('A0_validation_only_policy_required');
  for (const k of ['protected_prefixes', 'l3_prefixes', 'l2_prefixes', 'l1_prefixes', 'l0_prefixes', 'l3_files', 'l0_files', 'documentation_extensions', 'allowed_external_hosts', 'allowed_external_url_prefixes', 'dispatch_card_prefixes', 'dispatch_card_extensions'])
    if (!Array.isArray(p[k]) || !p[k].length || p[k].some(x => typeof x !== 'string' || !x)) throw Error('invalid_policy_list');
  for (const k of ['max_files', 'max_diff_bytes', 'max_review_age_seconds', 'freshness_seconds', 'extra_review_failure_count', 'extra_review_window_seconds'])
    if (!Number.isSafeInteger(p[k]) || p[k] <= 0) throw Error('invalid_policy_limit');
  if (!Array.isArray(p.receipt_writer_rules) || !p.receipt_writer_rules.length || p.receipt_writer_rules.some(r => !validPath(r.prefix?.replace(/\/$/,'')) || !r.prefix.endsWith('/') || !Array.isArray(r.executors) || r.executors.some(e => typeof e !== 'string' || !e))) throw Error('invalid_receipt_writer_rules');
  if (!Array.isArray(p.notification_actor_allowlist) || p.notification_actor_allowlist.some(a => !a || typeof a !== 'object' || Array.isArray(a)
    || Object.keys(a).sort().join(',') !== 'executor,id,login'
    || typeof a.login !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37})$/.test(a.login)
    || !Number.isSafeInteger(a.id) || a.id <= 0 || typeof a.executor !== 'string' || !a.executor)) throw Error('invalid_notification_actor_allowlist');
  return p;
}

export function classify(p, files) {
  let level = 0, requiresCanary = false;
  const controls = [], reasons = [];
  for (const f of files) {
    if (!validPath(f.path) || !['100644', '100755'].includes(f.mode) || (f.old_mode && !['100644', '100755'].includes(f.old_mode))) {
      reasons.push('unsafe_path_symlink_or_gitlink'); level = 3; continue;
    }
    const name = f.path;
    if (p.protected_prefixes.some(x => name.startsWith(x))) controls.push(name);
    let n = 3; // Unknown paths never fall through to L0.
    if (p.l0_files.includes(name) || (p.l0_prefixes.some(x => name.startsWith(x)) && p.documentation_extensions.includes(path.posix.extname(name)))) n = 0;
    if (p.l1_prefixes.some(x => name.startsWith(x))) n = 1;
    if (p.l2_prefixes.some(x => name.startsWith(x)) || /^wrangler[^/]*\.toml$/.test(name) || /^[^/]+\.(?:js|mjs|cjs|html)$/.test(name)) n = 2;
    if (n === 2) requiresCanary = true; // L3 files cannot cancel a Worker's L2 prerequisite.
    if (p.l3_prefixes.some(x => name.startsWith(x)) || p.l3_files.includes(name) || isSensitiveName(name) || name.endsWith('/AGENTS.md')) n = 3;
    // A task proposal is not an authoritative receipt, ledger row, identity or executable.
    if (p.dispatch_card_prefixes.some(x=>name.startsWith(x)) && p.dispatch_card_extensions.includes(path.posix.extname(name))
      && !isSensitiveName(name) && !name.endsWith('/AGENTS.md') && !controls.includes(name)) n = 1;
    level = Math.max(level, n);
  }
  return {level: 'L' + level, requires_canary:requiresCanary, modifies_own_checks: controls.length > 0, controls, reasons};
}

export function notificationReference(reference) {
  const m=/^https:\/\/github\.com\/ltzyz2181-collab\/ltzzz\/(?:pull|issues)\/[1-9]\d*#issuecomment-([1-9]\d*)$/.exec(reference||'');
  if (!m) throw Error('exact_repository_comment_reference_required');
  return {reference,api_url:'https://api.github.com/repos/ltzyz2181-collab/ltzzz/issues/comments/'+m[1],comment_id:m[1]};
}

// Collector-owned network facts, supplied separately from PR content and signed payloads.
export async function fetchNotificationReadback(reference,{fetchImpl=fetch,token,now=()=>new Date().toISOString()}={}) {
  const ref=notificationReference(reference);
  const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  if(token)headers.Authorization='Bearer '+token;
  const r=await fetchImpl(ref.api_url,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(r.status!==200)throw Error('notification_comment_not_readable');
  const body=await r.text();if(body.length>100000)throw Error('notification_comment_too_large');
  const c=JSON.parse(body);
  if(String(c.id)!==ref.comment_id || c.html_url!==reference || typeof c.body!=='string' || !c.user?.login || !c.user?.id)throw Error('notification_comment_identity_mismatch');
  return {...ref,source:'github_rest_issue_comment',http_status:200,body:c.body,body_sha256:sha256(c.body),
    actor_login:c.user.login,actor_id:String(c.user.id),fetched_at_utc:now()};
}

// A signed notification alone is insufficient: GitHub's actual comment author
// must be admitted by trusted BASE policy for the independent signing executor.
export function notificationActorAllowed({proof,readback,allowlist}) {
  return Array.isArray(allowlist) && allowlist.some(a => a.login === readback?.actor_login
    && String(a.id) === readback?.actor_id && a.executor === proof?.executor);
}
export function notificationMatches({proof,subject,readbacks,now,maxAge,allowlist=[]}) {
  const p=proof.payload;
  try {
    const ref=notificationReference(p.reference),r=readbacks.find(x=>x.reference===p.reference);
    const marker=(body,key,value)=>{const lines=body.split(/\r?\n/).filter(s=>s.startsWith(key+'='));return lines.length===1 && lines[0]===key+'='+value;};
    return notificationActorAllowed({proof,readback:r,allowlist}) && p.owner_notified===true && HASH.test(p.comment_sha256||'') && p.subject_sha256===sha256(canonical(subject))
      && r?.source==='github_rest_issue_comment' && r.http_status===200 && r.api_url===ref.api_url && r.comment_id===ref.comment_id
      && typeof r.actor_login==='string' && !!r.actor_login && /^\d+$/.test(r.actor_id||'')
      && p.actor_login===r.actor_login && p.actor_id===r.actor_id
      && typeof r.body==='string' && sha256(r.body)===p.comment_sha256 && r.body_sha256===p.comment_sha256
      && validTime(r.fetched_at_utc) && Date.parse(r.fetched_at_utc)<=now && now-Date.parse(r.fetched_at_utc)<=maxAge*1000
      && marker(r.body,'TASK_ID',subject.task_id) && marker(r.body,'HEAD_SHA',subject.head_sha)
      && marker(r.body,'SUBJECT_SHA256',p.subject_sha256) && r.body.split(/\r?\n/).includes('OWNER=@ltzyz2181-collab');
  }catch{return false;}
}

export function scanDiff(p, files) {
  const findings = [];
  for (const file of files) {
    if (file.binary || typeof file.diff !== 'string') { findings.push({path:file.path, code:'binary_or_missing_diff'}); continue; }
    let hunk = false;
    const lines = [];
    for (const line of file.diff.split('\n')) {
      if (line.startsWith('diff --git ')) hunk = false;
      else if (line.startsWith('@@ ')) hunk = true;
      else if (hunk && line.startsWith('+')) lines.push(line.slice(1));
    }
    const added = lines.join('\n'); // +++ inside a hunk is source text, not a file header.
    // Never copy a suspected credential or its line into reports/model prompts.
    if (/(?:^|[^A-Za-z0-9_-])(?:sk-|cfut_)[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|client[_-]?secret|password|authorization)\s*[:=]\s*["'][A-Za-z0-9_+\/-]{20,}["']/i.test(added)) findings.push({path:file.path, code:'secret_pattern'});
    if (/\b(?:eval|Function|atob)\s*\(|(?:Buffer\.from\([^\n]*['"]base64['"])|(?:node:)?child_process|\b(?:exec|execSync|execFile|spawn|spawnSync)\s*\(/.test(added)) findings.push({path:file.path, code:'new_dynamic_execution_requires_review'});
    const hosts = new Set();
    for (const m of added.matchAll(/(?:https?|wss?):\/\/[^\s"'`<>\)]+|(?<=["'`])\/\/[^\s"'`<>\)]+/g)) {
      try { const url = new URL(m[0].startsWith('//')?'https:'+m[0]:m[0]); if (!p.allowed_external_hosts.includes(url.hostname) || url.protocol !== 'https:' || url.username || url.password || url.port || !p.allowed_external_url_prefixes.some(prefix => url.href.startsWith(prefix))) hosts.add(url.hostname); }
      catch { hosts.add('invalid_url'); }
    }
    if (hosts.size) findings.push({path:file.path, code:'unapproved_external_host', hosts:[...hosts].sort()});
  }
  return findings;
}

// Validate the whole BASE registry, including disabled historical keys. Key rotation cannot relabel an executor/provider.
export function validateTrust(trust) {
  if (trust?.schema_version !== 1 || trust.enabled !== true || !Array.isArray(trust.keys) || !trust.keys.length) return false;
  const ids=new Set(), executors=new Map(), publicKeys=new Map();
  try {
    for (const k of trust.keys) {
      if (typeof k.id !== 'string' || !k.id || ids.has(k.id) || !PROVIDERS.has(k.provider) || typeof k.executor !== 'string' || !k.executor.trim() || !Array.isArray(k.roles)) return false;
      if (['github_actions','github_connector'].includes(k.provider) && k.roles.some(role=>['author','review'].includes(role))) return false;
      ids.add(k.id);
      if (executors.has(k.executor) && executors.get(k.executor)!==k.provider) return false;
      executors.set(k.executor,k.provider);
      const key=createPublicKey(k.public_key_pem);
      if (key.asymmetricKeyType!=='ed25519') return false;
      const der=key.export({type:'spki',format:'der'}).toString('hex'),binding=canonical({executor:k.executor,provider:k.provider});
      if (publicKeys.has(der) && publicKeys.get(der)!==binding) return false;
      publicKeys.set(der,binding);
    }
    return true;
  } catch { return false; }
}

export function subjectFor(snapshot) {
  if (snapshot.repository !== 'ltzyz2181-collab/ltzzz' || !ID.test(snapshot.task_id || '') || !SHA.test(snapshot.base_sha || '') || !SHA.test(snapshot.head_sha || '')
    || snapshot.base_sha === snapshot.head_sha || !Array.isArray(snapshot.files) || !snapshot.files.length) throw Error('invalid_patch_subject');
  const paths = snapshot.files.map(f => f.path);
  if (new Set(paths).size !== paths.length || paths.some(p => !validPath(p))) throw Error('invalid_patch_paths');
  if (!HASH.test(snapshot.policy_sha256 || '') || !HASH.test(snapshot.trust_sha256 || '')) throw Error('missing_base_policy_hashes');
  return {repository:snapshot.repository, task_id:snapshot.task_id, base_sha:snapshot.base_sha, head_sha:snapshot.head_sha,
    policy_sha256:snapshot.policy_sha256, trust_sha256:snapshot.trust_sha256,
    files_sha256:sha256(canonical([...snapshot.files].sort((a,b) => a.path.localeCompare(b.path))))};
}

// Roles/provider identities come from BASE public-key configuration, never from payload prose.
export function authenticate(record, {trust, subject, role, now, maxAge}) {
  if (!validateTrust(trust)) return null;
  const k = trust.keys.find(k => k.id === record?.key_id);
  const v = record?.payload;
  if (!k || k.enabled !== true || !PROVIDERS.has(k.provider) || !k.roles?.includes(role) || !v || v.role !== role
    || canonical(v.subject) !== canonical(subject) || !validTime(v.at_utc) || !Number.isFinite(now)
    || now - Date.parse(v.at_utc) < 0 || now - Date.parse(v.at_utc) > maxAge * 1000
    || !validTime(k.not_before) || !validTime(k.not_after) || Date.parse(v.at_utc) < Date.parse(k.not_before) || now > Date.parse(k.not_after)
    || typeof record.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(record.signature)) return null;
  try {
    const key = createPublicKey(k.public_key_pem);
    if (key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(canonical(v)), key, Buffer.from(record.signature, 'base64'))) return null;
    return {provider:k.provider, executor:k.executor, key_id:k.id, payload:v};
  } catch { return null; }
}

export function verifyDeployment({subject, evidence, allowedTargets = [], freshnessSeconds = 300, now = Date.now()}) {
  const checks = {subject:false, transport:false, commit:false, fresh:false, current_version:false};
  try {
    const {observation:o, platform:p} = evidence;
    const start = Date.parse(o.started_at_utc), end = Date.parse(o.finished_at_utc), date = Date.parse(o.http_date), observed = Date.parse(p.observed_at_utc);
    const url = new URL(o.url), body = Buffer.from(o.body_base64, 'base64');
    checks.subject = evidence.head_sha === subject.head_sha && evidence.base_sha === subject.base_sha && evidence.target_environment === 'canary';
    checks.transport = allowedTargets.some(t => t.url === o.url) && url.protocol === 'https:' && url.hostname.endsWith('.workers.dev') && !url.username && !url.password && !url.port
      && o.http_status === 200 && o.redirected === false && body.length > 0 && sha256(body) === o.body_sha256;
    // A dedicated metadata response, not a substring buried in HTML/comments/JSON prose.
    let metadata;try { metadata=JSON.parse(body.toString('utf8')); } catch { metadata=null; }
    checks.commit = o.header_source_commit === subject.head_sha && metadata?.schema === 'ltzzz.patchgate.canary.v1'
      && metadata.source_commit === subject.head_sha && Object.keys(metadata).sort().join(',') === 'schema,source_commit'
      && body.toString('utf8') === canonical({schema:'ltzzz.patchgate.canary.v1',source_commit:subject.head_sha})+'\n';
    checks.fresh = [start,end,date,observed].every(Number.isFinite) && start <= end && end - start <= freshnessSeconds * 1000
      && date >= start - 5000 && date <= end + 5000 && observed >= start - 5000 && observed <= end + 5000
      && Number.isFinite(now) && [date,observed,end].every(t => t <= now + 5000 && now - t <= freshnessSeconds * 1000);
    checks.current_version = p.http_status === 200 && p.service_name === url.hostname.split('.')[0]
      && p.source === 'cloudflare_current_deployment_api' && p.versions?.length === 1
      && p.versions[0].percentage === 100 && typeof p.versions[0].id === 'string' && !!p.versions[0].id
      && p.versions[0].id === o.header_version_id && p.versions[0].id === evidence.expected_version_id;
  } catch { /* malformed evidence is a deterministic failure */ }
  const passed = Object.values(checks).every(Boolean);
  return {status:passed ? 'reverified_deterministic' : 'deployment_verification_failed', passed, checks,
    model_verdict_required:false, rollback_verified:false};
}

export function evaluate({policy, trust, snapshot, attestations = [], failures = [], notificationReadbacks = [], now = Date.now()}) {
  validatePolicy(policy);
  const subject = subjectFor(snapshot), risk = classify(policy, snapshot.files), findings = scanDiff(policy, snapshot.files), reasons = [...risk.reasons];
  if (!Number.isFinite(now)) throw Error('executor_time_required');
  if (snapshot.policy_sha256 !== sha256(canonical(policy)) || snapshot.trust_sha256 !== sha256(canonical(trust))) reasons.push('base_configuration_hash_mismatch');
  if (snapshot.files.length > policy.max_files || snapshot.files.reduce((n,f) => n + Buffer.byteLength(f.diff || ''),0) > policy.max_diff_bytes) reasons.push('diff_limit_exceeded');
  if (risk.modifies_own_checks) reasons.push('cannot_modify_own_constraints_requires_separate_trust_rollout');
  if (findings.length) reasons.push('diff_scan_requires_resolution');
  const auth = role => attestations.map(a => authenticate(a,{trust,subject,role,now,maxAge:policy.max_review_age_seconds})).filter(Boolean);
  const authors = auth('author'), authorProviders = new Set(authors.map(a => a.provider));
  if (authors.length !== 1) reasons.push('one_authenticated_author_required');
  if (trust.enabled === true && !validateTrust(trust)) reasons.push('executor_provider_registry_invalid');
  const author = authors[0];
  const independent = a => !!author && a.executor !== author.executor;
  const checks = auth('checks').filter(a => independent(a) && a.payload.passed === true && a.payload.checker_base_sha === subject.base_sha && HASH.test(a.payload.checks_sha256 || ''));
  if (!checks.length) reasons.push('trusted_base_checks_required');
  const reviews = auth('review').filter(a => independent(a) && !authorProviders.has(a.provider) && a.payload.verdict === 'approve'
    && a.payload.generation_verified === true && typeof a.payload.model === 'string' && a.payload.model
    && HASH.test(a.payload.output_sha256 || '') && a.payload.metadata_source === 'provider_response'
    && ['stop','end_turn'].includes(a.payload.finish_reason));
  const rejected = auth('review').filter(a => a.payload.verdict !== 'approve');
  if (rejected.length) reasons.push('review_requires_revision');
  // Only signed failures from a registered supervisor count. PR JSON cannot frame another seat.
  const failureKeys = new Set();
  for (const f of failures) {
    const proof = authenticate(f, {trust, subject:f?.payload?.subject, role:'supervision', now, maxAge:policy.extra_review_window_seconds});
    const s = proof?.payload?.subject;
    if (proof && s?.repository === subject.repository && ID.test(s.task_id || '') && SHA.test(s.head_sha || '')
      && proof.payload.failed_provider === author?.provider && proof.payload.result === 'failed') failureKeys.add(s.task_id + ':' + s.head_sha);
  }
  const extra = failureKeys.size >= policy.extra_review_failure_count ? 1 : 0;
  const minimum = (risk.level === 'L0' ? 0 : risk.level === 'L3' ? 2 : 1) + extra;
  if (new Set(reviews.map(a => a.provider)).size < minimum) reasons.push('distinct_provider_reviews_required');
  const notificationProofs=auth('notification').filter(a=>independent(a) && notificationMatches({proof:a,subject,readbacks:notificationReadbacks,now,maxAge:policy.freshness_seconds,allowlist:policy.notification_actor_allowlist}));
  if (risk.level === 'L3' && !notificationProofs.length) reasons.push('owner_notification_evidence_required');
  const receiptPaths=snapshot.files.map(f=>f.path).filter(name=>policy.receipt_writer_rules.some(r=>name.startsWith(r.prefix)));
  const writers=auth('receipt_write');
  for (const name of receiptPaths) {
    const rule=policy.receipt_writer_rules.filter(r=>name.startsWith(r.prefix)).sort((a,b)=>b.prefix.length-a.prefix.length)[0];
    if (!writers.some(w=>rule.executors.includes(w.executor) && Array.isArray(w.payload.paths) && w.payload.paths.includes(name))) reasons.push('authenticated_receipt_writer_required');
  }
  let deployment = null;
  if (risk.requires_canary) {
    const proofs = auth('deployment').filter(a => independent(a) && policy.canary_targets.some(t => t.url === a.payload.evidence?.observation?.url));
    deployment = proofs.map(a => verifyDeployment({subject,evidence:a.payload.evidence,allowedTargets:policy.canary_targets,freshnessSeconds:policy.freshness_seconds,now})).find(x => x.passed) || null;
    if (!deployment) reasons.push('signed_allowlisted_canary_verification_required');
  }
  const unique = [...new Set(reasons)];
  return {task_id:subject.task_id, subject, subject_sha256:sha256(canonical(subject)), idempotency_key:subject.task_id + ':' + subject.head_sha,
    risk_class:risk.level, requires_canary:risk.requires_canary, author_provider:author?.provider || null, author_executor:author?.executor||null,
    checks_executors:[...new Set(checks.map(a=>a.executor))], reviewer_providers:[...new Set(reviews.map(a => a.provider))], reviewer_executors:[...new Set(reviews.map(a=>a.executor))],
    notification_executors:[...new Set(notificationProofs.map(a=>a.executor))],notification_readback_verified:notificationProofs.length>0,
    required_independent_reviews:minimum, additional_review_due_to_failures:extra, scan_findings:findings, reasons:unique,
    validation_passed:unique.length === 0, status:unique.length ? 'validation_blocked' : 'validated_not_activated',
    phase:policy.phase, automatic_merge:false, automatic_deploy:false, automatic_rollback:false,
    deployment_verification:deployment, scan_safety_conclusion:false, paid:false, tx_hash:null};
}

// Atomic on ONE durable filesystem only. A1 must supply a shared CAS backend before distributed execution.
export function reserveAction({directory, taskId, headSha, action, now = new Date().toISOString()}) {
  if (!ID.test(taskId || '') || !SHA.test(headSha || '') || !['merge','deploy','review'].includes(action)) throw Error('invalid_action_key');
  fs.mkdirSync(directory,{recursive:true});
  const key = taskId + ':' + headSha, file = path.join(directory,sha256(key + ':' + action) + '.reserved.json');
  const record = {idempotency_key:key, action, at_utc:now, status:'reserved_outcome_unknown_until_reconciled', paid:false, tx_hash:null};
  try { fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n',{flag:'wx'}); return {reserved:true, file, record}; }
  catch (e) { if (e.code === 'EEXIST') return {reserved:false, file, status:'reconcile_existing_no_repeat'}; throw e; }
}

export function finishAction({reservation, result}) {
  if (!reservation.reserved || !fs.existsSync(reservation.file) || !['completed','failed','outcome_unknown'].includes(result?.status)) throw Error('valid_reservation_and_result_required');
  const record = JSON.parse(fs.readFileSync(reservation.file,'utf8'));
  if (canonical(record) !== canonical(reservation.record)) throw Error('reservation_changed');
  const file = reservation.file.replace(/\.reserved\.json$/,'.result.json');
  fs.writeFileSync(file,JSON.stringify({...record,result},null,2)+'\n',{flag:'wx'});
  return file;
}
