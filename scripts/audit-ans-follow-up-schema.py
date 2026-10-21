"""Use the real draft-07 validator on positive/negative contract fixtures. No network/model/payment calls."""
import argparse,copy,datetime,hashlib,json,os,pathlib,subprocess
import jsonschema
ROOT=pathlib.Path(__file__).resolve().parents[1]
def digest(data): return hashlib.sha256(data).hexdigest()
def inspect_schemas():
 source=ROOT/'knowledge/results/qwen-dispatch/QWEN-ANS2-SCHEMA-V2-20261021.json'
 receipt=json.loads(source.read_text());assert digest(receipt['output'].encode())==receipt['output_sha256'],'original provider output hash mismatch';original=json.loads(receipt['output'])
 candidate_path=ROOT/'schemas/ans-follow-up.candidate-v1.schema.json';candidate_bytes=candidate_path.read_bytes();candidate=json.loads(candidate_bytes)
 jsonschema.Draft7Validator.check_schema(original);jsonschema.Draft7Validator.check_schema(candidate)
 validators={'original':jsonschema.Draft7Validator(original),'candidate':jsonschema.Draft7Validator(candidate)}
 base={'action_taken':'none','status':'open','follow_up_receipt':None,'test_status':{'model_proposed':True,'tested_by_model_claim':False,'actually_run':False,'run_id':None,'sha256':None},'paid':False,'tx_hash':None}
 cases=[]
 def add(name,value,expected): cases.append((name,value,expected))
 add('none_with_explicit_null_follow_up',copy.deepcopy(base),True)
 for action in ['none','dispatched','fixed','escalated']:
  d=copy.deepcopy(base);d['action_taken']=action;del d['follow_up_receipt'];add(action+'_missing_follow_up',d,False)
 d=copy.deepcopy(base);d['paid']=None;add('paid_must_be_boolean',d,False)
 d=copy.deepcopy(base);del d['test_status']['run_id'];del d['test_status']['sha256'];add('nonrun_requires_explicit_null_evidence',d,False)
 d=copy.deepcopy(base);d['action_taken']='fixed';d['status']='pending_review';d['follow_up_receipt']='knowledge/results/fixture.json';add('fixed_with_follow_up',d,True)
 d=copy.deepcopy(base);d['action_taken']='fixed';d['follow_up_receipt']='  ';add('whitespace_is_not_follow_up_evidence',d,False)
 d=copy.deepcopy(base);d['test_status']['actually_run']=True;add('actual_run_cannot_have_null_proof',d,False)
 d=copy.deepcopy(base);d['test_status'].update(actually_run=True,run_id='fixture-run',sha256='a'*64);add('actual_run_with_proof',d,True)
 d=copy.deepcopy(base);d['test_status'].update(actually_run=True,run_id='fixture-run',sha256='g'*64);add('invalid_sha256_rejected',d,False)
 d=copy.deepcopy(base);d['test_status']['run_id']='fabricated-without-run';add('unrun_cannot_claim_run_id',d,False)
 d=copy.deepcopy(base);d['payment_action']='send-funds';add('unknown_payment_fields_rejected',d,False)
 d=copy.deepcopy(base);d['test_status']['unexpected']='extra';add('unknown_nested_fields_rejected',d,False)
 d=copy.deepcopy(base);d['status']='closed';add('no_action_must_remain_open',d,False)
 results=[]
 for name,value,expected in cases:
  row={'case':name,'expected_valid':expected,**{k+'_valid':v.is_valid(value) for k,v in validators.items()}}
  row['candidate_passed']=row['candidate_valid']==expected;results.append(row)
 assert all(r['candidate_passed'] for r in results),'corrected candidate failed an independent contract fixture'
 return {'schema':'ltzzz.controller-schema-audit.v1','at':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'reviewer':'GPT/Codex controller; deterministic validator execution','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'github_run_id':os.getenv('GITHUB_RUN_ID'),'node_suite_verified_by_prior_workflow_step':os.getenv('PANEL_NODE_TESTS_VERIFIED')=='true','original_receipt':str(source.relative_to(ROOT)),'original_output_sha256':digest(receipt['output'].encode()),'original_review':'rejected_missing_required_fields_and_nullable_paid','original_mismatches':[r['case'] for r in results if r['original_valid']!=r['expected_valid']],'candidate_schema':str(candidate_path.relative_to(ROOT)),'candidate_sha256':digest(candidate_bytes),'validator':'jsonschema.Draft7Validator','cases':results,'candidate_passed':len(results),'status':'candidate_schema_locally_validated_not_production_integrated','production_schema_replaced':False,'provider_raw_output_preserved':True,'model_calls':0,'paid':False,'tx_hash':None,'human_hiring_execution_enabled':False}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--write-report');args=parser.parse_args();report=inspect_schemas()
 if args.write_report:
  target=pathlib.Path(args.write_report);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'status':report['status'],'candidate_passed':report['candidate_passed'],'original_mismatches':report['original_mismatches'],'model_calls':0},ensure_ascii=False))
