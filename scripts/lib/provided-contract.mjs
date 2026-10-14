export function matchesContract(expected,http,json){
 return Number.isInteger(expected.expected_http)&&expected.expected_json&&Object.keys(expected.expected_json).length>0&&http===expected.expected_http&&Object.entries(expected.expected_json).every(([k,v])=>json[k]===v);
}
export function negativeControls(){
 const expected={expected_http:200,expected_json:{ok:true}};
 const samples=[{name:'baseline',pass:matchesContract(expected,200,{ok:true}),expected:true},{name:'wrong_http_rejected',pass:matchesContract(expected,418,{ok:true}),expected:false},{name:'wrong_json_rejected',pass:matchesContract(expected,200,{ok:false}),expected:false},{name:'wrong_authentication_rejected',pass:matchesContract({expected_http:200,expected_json:{authenticated:false}},200,{authenticated:true}),expected:false}];
 return {kind:'local_assertion_evaluator_fault_injection',network_calls:0,independent_design_proven:false,passed:samples.every(x=>x.pass===x.expected),samples};
}
