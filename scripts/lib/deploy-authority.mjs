// 部署/合并分权闸门（GPT 裁决 GPT-LTZZZ-AUTONOMY-RULING-20261117-01 §五.16 的落地实现）。
// owner 2026-11-17 已明确"自动部署吧"，因此 automatic_deploy=true 是 owner 的主动授权，
// 不是 AI 自授权；这里做的是"把合并与部署分成两个开关 + 被排除族硬拦截"，而不是再收回执行权。
import fs from 'node:fs';

const CONFIG = 'config/deploy-automation-authority-20261117.json';

export function loadAuthority(path = CONFIG) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

/**
 * @param {{action:'merge'|'deploy'|'rollback', family?:string, authority?:object}} input
 * @returns {{allowed:boolean, reason:string, authority_id:string, action:string, family:string|null}}
 */
export function decide({action, family = null, authority = null} = {}) {
  const a = authority || loadAuthority();
  const id = a.authority_id || 'unknown';
  const fam = family || null;
  const deny = (reason) => ({allowed: false, reason, authority_id: id, action, family: fam});

  if (!['merge', 'deploy', 'rollback'].includes(action)) return deny('unknown_action');

  // fail-closed：没有 deploy_scope 就无法证明该族被授权，一律拒绝。
  if (!Array.isArray(a.deploy_scope)) return deny('deploy_scope_missing');
  if (typeof fam !== 'string' || fam.trim() === '') return deny('missing_family');

  // 被排除族优先判定：即使开关为 true，资金/签名类也不得自动执行。
  if (Array.isArray(a.excluded_families) && a.excluded_families.includes(fam)) {
    return deny(`excluded_family:${fam}`);
  }
  // 未登记族（既不在 deploy_scope 也不在 excluded_families）默认拒绝，不再放行。
  if (!a.deploy_scope.includes(fam)) return deny(`unknown_family:${fam}`);
  if (action === 'merge') return a.automatic_merge === true
    ? {allowed: true, reason: 'owner_authorized_auto_merge', authority_id: id, action, family: fam}
    : deny('auto_merge_disabled');
  if (action === 'deploy') return a.automatic_deploy === true
    ? {allowed: true, reason: 'owner_authorized_auto_deploy', authority_id: id, action, family: fam}
    : deny('auto_deploy_disabled');
  return a.automatic_rollback === true
    ? {allowed: true, reason: 'owner_authorized_auto_rollback', authority_id: id, action, family: fam}
    : deny('auto_rollback_disabled');
}
