export const requiredSectionsForAgent = agent => agent==='qianwen' ? ['【派单监督】'] : [];
export function validRequiredSections(sections){
  return Array.isArray(sections)&&sections.length<=16&&new Set(sections).size===sections.length
    &&sections.every(s=>typeof s==='string'&&s.trim()===s&&s.length>0&&s.length<=100&&!/[\r\n]/.test(s));
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
  const missing=required_sections.filter(section=>!lines.some((line,index)=>{
    if(!line.text.startsWith(section))return false;
    const suffix=line.text.slice(section.length);
    // Real inline supervision content is a body; comments, quotes, fences and indented code are excluded above.
    const inline=suffix.replace(/^[\s:：\-—]+/u,'').trim();
    if(inline)return !inline.startsWith('【')&&/[\p{L}\p{N}]/u.test(inline);
    for(const body of lines.slice(index+1)){
      if(!body.text)continue;
      return !body.boundary;
    }
    return false;
  }));
  if(missing.length)return {status:'missing_required_section',reason:'required_section_absent_or_empty',missing_sections:missing,accepted:false};
  return {status:'structurally_complete',reason:'normal_stop_and_completion_marker',accepted:false};
}
