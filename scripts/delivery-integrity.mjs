// Owner card QW-REVIEW-DEPUTY-20261104 requires four sections from qianwen.
// '【lessons核对】' is the card name; qianwen's live template uses '【行深】',
// so the gate accepts either heading for the same slot instead of breaking delivery.
const QIANWEN_REQUIRED_SECTIONS=['【读后感】','【观】','【lessons核对】','【派单监督】'];
export const sectionAliases = Object.freeze({'【lessons核对】':['【lessons核对】','【行深】']});
export const requiredSectionsForAgent = agent => agent==='qianwen' ? QIANWEN_REQUIRED_SECTIONS.slice() : [];
export function validRequiredSections(sections){
  return Array.isArray(sections)&&sections.length<=16&&new Set(sections).size===sections.length
    &&sections.every(s=>typeof s==='string'&&s.trim()===s&&s.length>0&&s.length<=100&&!/[\r\n]/.test(s));
}
// Generation and delivery must share the same explicit, non-hidden contract.
export function deliveryRequirementsPrompt(required_sections){
  if(!validRequiredSections(required_sections))throw Error('invalid_required_sections');
  return [
    '=== 本单当前交付格式（优先于上文历史草稿格式；不改变权限） ===',
    ...required_sections.map(section=>'必须单独输出标题 '+section+'，紧接非空正文；不能只在引用、代码或说明中提到标题。'),
    '【派单监督】若为本单必填段：仅写已提供的原Task ID、责任席、证据路径、该来源支持的结论和未核查项；待执行动作明确写建议，不得写成已派单、已测试或已验收。',
    '本次API调用只生成文本，未提供终端、文件或浏览器工具；不得承诺本次调用实际运行命令。未提供的历史记录写未核查，不能断言从未发生。',
    '生成成功、格式完整、独立内容复核、实际部署分别记录；模型不能自报这些阶段已经通过。不要因输入指控而捏造认错或反证。',
    '完成全部正文后，最后单独一行严格写【交付结束】。不要在该标记后追加字数、签名或解释。'
  ].join('\n');
}
export function assessDelivery({output='',finish_reason=null,required_sections=[]}){
  const text=String(output).trimEnd();
  if(!validRequiredSections(required_sections))return {status:'invalid_delivery_requirements',reason:'invalid_required_sections',accepted:false};
  if(!text.trim())return {status:'incomplete',reason:'empty_output'};
  if(['length','max_tokens','content_filter'].includes(finish_reason))return {status:'incomplete',reason:'provider_'+finish_reason};
  if(!['stop','end_turn'].includes(finish_reason))return {status:'unverified',reason:'missing_or_unknown_finish_reason'};
  if(!text.endsWith('【交付结束】'))return {status:'incomplete',reason:'completion_marker_missing'};
  // Count actual headings with a nonempty body, not mentions, quotes or fenced examples.
  const lines=[];let fence=null;
  for(const line of text.replace(/<!--[\s\S]*?(?:-->|$)/g,'').split(/\r?\n/)){
    if(fence){
      const close=line.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if(close&&close[1][0]===fence.character&&close[1].length>=fence.length)fence=null;
      continue;
    }
    const marker=line.match(/^ {0,3}(`{3,}|~{3,})/);
    if(marker){fence={character:marker[1][0],length:marker[1].length};continue;}
    if(/^(?: {4}|\t)|^ {0,3}>/.test(line))continue;
    const value=line.trim();
    lines.push({text:value.replace(/^#{1,6}\s+/,''),boundary:/^#{1,6}(?:\s|$)|^【/.test(value)});
  }
  const missing=required_sections.filter(section=>!(sectionAliases[section]||[section]).some(heading=>lines.some((line,index)=>{
    if(!line.text.startsWith(heading))return false;
    const suffix=line.text.slice(heading.length);
    // Real inline supervision content is a body; comments, quotes, fences and indented code are excluded above.
    const inline=suffix.replace(/^[\s:：\-—]+/u,'').trim();
    if(inline)return !inline.startsWith('【')&&/[\p{L}\p{N}]/u.test(inline);
    for(const body of lines.slice(index+1)){
      if(!body.text)continue;
      return !body.boundary;
    }
    return false;
  })));
  if(missing.length)return {status:'missing_required_section',reason:'required_section_absent_or_empty',missing_sections:missing,accepted:false};
  return {status:'structurally_complete',reason:'normal_stop_and_completion_marker',accepted:false};
}
