export const CONTRACT_PREDICATE_REVISION='provided-contract-v2-detailed-evidence';
export function evaluateContract(expected,http,json){
 const valid=Number.isInteger(expected?.expected_http)&&!!expected.expected_json&&Object.keys(expected.expected_json).length>0;
 const fields=Object.entries(expected?.expected_json||{}).map(([key,value])=>({key,expected:value,actual:json?.[key]??null,actual_present:json!=null&&Object.hasOwn(json,key),expected_type:typeof value,actual_type:typeof json?.[key],matched:json?.[key]===value}));
 const http_matched=http===expected?.expected_http;
 return {revision:CONTRACT_PREDICATE_REVISION,passed:Boolean(valid&&http_matched&&fields.every(f=>f.matched)),expected_shape_valid:Boolean(valid),expected_http:expected?.expected_http??null,actual_http:http,http_matched,fields};
}
export function matchesContract(expected,http,json){return evaluateContract(expected,http,json).passed;}
export function negativeControls(){
 const expected={expected_http:200,expected_json:{ok:true}};
 const samples=[{name:'baseline',pass:matchesContract(expected,200,{ok:true}),expected:true},{name:'wrong_http_rejected',pass:matchesContract(expected,418,{ok:true}),expected:false},{name:'wrong_json_rejected',pass:matchesContract(expected,200,{ok:false}),expected:false},{name:'wrong_authentication_rejected',pass:matchesContract({expected_http:200,expected_json:{authenticated:false}},200,{authenticated:true}),expected:false}];
 return {kind:'local_assertion_evaluator_fault_injection',network_calls:0,independent_design_proven:false,passed:samples.every(x=>x.pass===x.expected),samples};
}
