"""Adversarial regression cases for the ANS follow-up schema (v2). Run: python3 scripts/schema/ans_follow_up_cases.py"""
import json, copy, sys
from jsonschema import Draft7Validator
S = json.load(open('schemas/ans-follow-up.candidate-v2.schema.json')); V = Draft7Validator(S)
H = "0x" + "1" * 64
BASE = {"action_taken": "fixed", "status": "closed", "follow_up_receipt": "knowledge/results/x.json",
        "test_status": {"model_proposed": True, "tested_by_model_claim": True, "actually_run": True, "run_id": "39691590162", "sha256": "a" * 64},
        "paid": False, "tx_hash": None}
def m(**kw):
    d = copy.deepcopy(BASE)
    for k, v in kw.items():
        if k.startswith('ts_'): d['test_status'][k[3:]] = v
        else: d[k] = v
    return d
CASES = [  # (name, document, must_be_valid)
 ("baseline_valid", m(), True),
 ("paid_true_with_real_hash", m(paid=True, tx_hash=H), True),
 ("none_open_null_follow_up", m(action_taken="none", status="open", follow_up_receipt=None, ts_actually_run=False, ts_run_id=None, ts_sha256=None), True),
 ("paid_true_without_hash", m(paid=True), False),
 ("paid_false_with_hash", m(tx_hash=H), False),
 ("hash_malformed", m(paid=True, tx_hash="abc"), False),
 ("follow_up_N/A", m(follow_up_receipt="N/A"), False),
 ("follow_up_TODO", m(follow_up_receipt="TODO"), False),
 ("follow_up_path_traversal", m(follow_up_receipt="../../etc/passwd"), False),
 ("follow_up_outside_repo_dirs", m(follow_up_receipt="/etc/passwd"), False),
 ("run_id_blank", m(ts_run_id="   "), False),
 ("run_id_non_numeric", m(ts_run_id="abc"), False),
 ("sha256_uppercase", m(ts_sha256="A" * 64), False),
 ("none_but_closed", m(action_taken="none", status="closed", follow_up_receipt=None, ts_actually_run=False, ts_run_id=None, ts_sha256=None), False),
 ("not_run_with_run_id", m(ts_actually_run=None), False),
 ("extra_field", {**m(), "bonus": 1}, False),
 # --- 豆包追加反例 (2026-10-22, third-party review of PR #187) ---
 ("run_id_too_short_5digits", m(ts_run_id="12345"), False),
 ("paid_true_tx_hash_63chars", m(paid=True, tx_hash="0x" + "a" * 63), False),
 ("escalated_but_null_receipt", m(action_taken="escalated", follow_up_receipt=None), False),
 ("dispatched_open_not_yet_run", m(action_taken="dispatched", status="open", ts_actually_run=False, ts_run_id=None, ts_sha256=None), True),
 ("null_action_taken_bypasses_receipt_guard", {**m(), "action_taken": None, "follow_up_receipt": "TODO"}, False),
 ("null_status_with_fixed_action", {**m(), "status": None}, False),
]
bad = [n for n, d, ok in CASES if V.is_valid(d) != ok]
for n, d, ok in CASES: print(("PASS " if V.is_valid(d) == ok else "FAIL ") + n)
print(f"{len(CASES)-len(bad)}/{len(CASES)} passed"); sys.exit(1 if bad else 0)
