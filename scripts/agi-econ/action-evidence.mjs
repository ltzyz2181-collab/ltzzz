import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash = data => createHash('sha256').update(data).digest('hex');

// Re-read the delivery, receipt and independent audit; task flags alone earn nothing.
export function verifyActionEvidence(root, task) {
  try {
    if (!task?.id || !['settled','slashed'].includes(task.status)) return false;
    const read = (relative, prefix) => {
      if (typeof relative !== 'string' || !relative.startsWith(prefix) || relative.split('/').includes('..')) throw Error('invalid_evidence_path');
      const base = fs.realpathSync(root), target = fs.realpathSync(path.resolve(root, relative));
      if (!target.startsWith(base + path.sep)) throw Error('evidence_outside_root');
      return fs.readFileSync(target);
    };
    const receipt = JSON.parse(read(task.receipt, 'data/agi-econ/receipts/'));
    const audit = JSON.parse(read(task.audit?.path, 'data/agi-econ/audits/'));
    const delivery = read(task.deliverable?.path, 'results/agi-econ/');
    const digest = hash(delivery);
    if (receipt.task_id !== task.id || receipt.worker !== task.worker || receipt.employer !== task.employer || receipt.settlement_mode !== 'internal_credit' || receipt.paid !== false || receipt.tx_hash !== null) return false;
    if (!audit.auditor || [task.worker, task.employer].includes(audit.auditor) || audit.task_id !== task.id) return false;
    if (receipt.deliverable_sha256 !== digest || task.deliverable.sha256 !== digest || audit.deliverable_sha256 !== digest) return false;
    const {report_sha256, ...unsigned} = audit;
    if (hash(JSON.stringify(unsigned, null, 2)) !== report_sha256 || task.audit.report_sha256 !== report_sha256 || receipt.audit_report_sha256 !== report_sha256) return false;
    const accepted = task.status === 'settled';
    if (audit.accepted !== accepted || task.audit.accepted !== accepted || receipt.accepted !== accepted) return false;
    if (audit.model_audit && (audit.model_audit.status !== 'success' || audit.model_audit.did !== audit.auditor || audit.model_audit.accepted !== accepted)) return false;
    if (accepted && (!audit.checks || !Object.values(audit.checks).every(x => x === true))) return false;
    return true;
  } catch { return false; }
}
