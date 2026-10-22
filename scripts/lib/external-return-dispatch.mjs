import fs from 'node:fs';import path from 'node:path';

export function writeQianwenReturnDispatch({root='.',date,sourceCommit,executionId,now=new Date().toISOString()}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('invalid_dispatch_date');
 const receiptPath='knowledge/results/dispatch/qianwen-return-'+date+'.json';
 const file='ops/dispatch/DAILY-'+date+'-qianwen.md';
 let record;try{record=JSON.parse(fs.readFileSync(path.join(root,receiptPath),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(record){if(record.task_id!=='QIANWEN-RETURN-'+date||record.date!==date||record.dispatch_file!==file)throw Error('dispatch_identity_mismatch');return record;}
 record={task_id:'QIANWEN-RETURN-'+date,date,issued_at:now,source_commit:sourceCommit||null,execution_id:executionId||null,issuer_role:'logical_gpt_coordinator',issued_by:'coordinator_rules_no_model',assigned_to:'qianwen',status:'assigned_waiting_external_return',dispatch_file:file,acceptance_receipt:null,model_calls:0,native_qianwen_dispatch:false,backdated:false,
  instruction:'每日监督总控与Claude派单：核对原任务认领、交付、审核与上线；遗漏立即提醒、复用原Task ID补派，跨日反复遗漏给警告，不减总控权限、不重复采购付款。状态见knowledge/results/dispatch/oversight/latest.json。每日回归：读AI-START-HERE、六文件变更和最新Pulse/ANS/WEP3回执；复核一项真实阻塞，交零模型状态检查或最小补丁/测试。算力不足时只回报已检查项、准确阻塞和下次入口，不重复购买模型。千问具有同等总控运维权限；认领、交付、验收分开记录。',
  evidence_limit:'This is a newly issued coordinator assignment. It does not reconstruct the missing historical native Qianwen dispatch, prove acceptance, or count a proxy health probe as native work.'};
 for(const p of [file,receiptPath])fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});
 fs.writeFileSync(path.join(root,file),'# 千问每日回归 · '+date+'\n\n- Task ID: `'+record.task_id+'`\n- 签发时间（实际UTC）：'+now+'\n- 签发者：逻辑GPT总控规则；非原厂GPT调用，非千问本人派单。\n- 状态：assigned_waiting_external_return；未接单、未交付。\n- 来源版本：'+(sourceCommit||'local')+'\n- 模型调用：0；没有新增付费定时任务。\n\n'+record.instruction+'\n\n本单从上述实际签发时间生效，不补造更早的千问原生派单。请把认领/回归回执写到 `ops/dispatch/receipts/` 并引用 Task ID。\n\n结构化签发记录：`'+receiptPath+'`。\n');
 fs.writeFileSync(path.join(root,receiptPath),JSON.stringify(record,null,2)+'\n');return record;
}
