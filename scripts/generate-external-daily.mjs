import fs from 'node:fs';
import {deliveryPolicy} from './lib/seat-delivery.mjs';
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const work={claude:'免费外部讨论与独立审计席：读取ops/dispatch/CLAUDE-FREE-DAILY.md，首次认真读六文件，之后核对变更。评论一个具体观点、提出一个反例，核验一条AI雇佣或部署完成声明。无免费额度或无仓库通道写blocked，不调用Anthropic API，不操作资金。',manus:'每天仅发布Instagram @ltzyz2181一个Reel，读取ops/dispatch/MANUS-INSTAGRAM-DAILY.md和videos/instagram/latest.json，直接下载成片与caption；校验SHA256，核对账号和已有发布回执，禁止重复上传。未就绪记录blocked；只发布不制作，不做公众号/抖音/视频号。交付正式permalink、media_id（若可得）、时间和截图路径，保存results/publishing/。文件派单不是已经接单，须提交接单回执。',kimi:'核对最新雇佣回执：事实、假设、实际交付、内部积分与真钱是否混淆。国内席did:ltzzz:kimi-domestic，国际席不混用Key。每项引用实际路径；无文件写无法核验。',meta:'审核一个AI雇佣或产品创新提案，提出一个可测反例与最小修正。只处理公开工程材料，不能将托管Llama输出冒充外部Meta。',codex:'读取WEP3与AGI经济子网最新代码和回执，修复一个实际缺陷；优先run-cycle模型失败/审计失败仍放行的问题。先检查已有PR避免重复改动，提交补丁、反例测试和PR；不新增付费日课，不操作钱包，不改机器人凭据。'};
fs.mkdirSync('ops/dispatch',{recursive:true});let paths=[];
const channels={};
for(const [seat,task]of Object.entries(work)){
 const policy=deliveryPolicy('.',seat),prOnly=policy.channel==='repo_pr_only',id='DAILY-'+date+'-'+seat,file='ops/dispatch/'+id+'.md';
 channels[seat]={delivery_channel:policy.channel,expected_native_daily:policy.expected_native_daily,native_reservation:false};paths.push(file);if(fs.existsSync(file))continue;
 const mode=prOnly?'状态：external_pr_reference_waiting_submission；在任PR渠道清单，不预留原生API自动日课。':'状态assigned，待真实接单，不等于执行。';
 const delivery=prOnly?'接单/交付：标明原Task ID的PR或哈希绑定回执，见docs/CLAUDE-DELIVERY-CHANNEL.md；不额外要求接单文件。':'接单回执：ops/dispatch/接单回执-'+id+'.md\n交付：knowledge/results/external/'+date+'-'+seat+'.md；无通道说明blocked。';
 fs.writeFileSync(file,'# '+seat+' 每日任务 '+date+'\n\nTask ID: '+id+'\n日期按Asia/Shanghai。'+mode+'\n'+task+'\n输入：AI-START-HERE.md、六篇记忆索引、knowledge/results/wep3/latest.json。每项一手证据，禁止编造。\n'+delivery+'\n无新问题也交no_new_findings及核查范围，不重复购买审查。\n');
}
fs.mkdirSync('knowledge/results/dispatch',{recursive:true});fs.writeFileSync('knowledge/results/dispatch/daily-latest.json',JSON.stringify({date,timezone:'Asia/Shanghai',tasks:paths,delivery_channels:channels,status:'assigned_waiting_external_acceptance',model_calls:0},null,2));
