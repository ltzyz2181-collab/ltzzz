// Lexical GitHub expression reader: quoted }} and doubled '' are data.
const SIGNING=/(?:PRIVATE[_-]?KEY|(?:^|_)PK$|(?:FUNDING|TREASURY|OWNER|DEPLOYER|EXECUTOR)_KEY|WALLET_(?:SECRET|KEY))/i;
function quotedEnd(text,start) {
 const q=text[start];let i=start+1;
 for(;i<text.length;i++){
  if(text[i]===q){if(text[i+1]===q){i++;continue;}return i+1;}
  if(q==='"'&&text[i]==='\\')i++;
 }
 return text.length;
}
export function scanWorkflowSecretReferences(source) {
 const refs=[],line=at=>source.slice(0,at).split(/\r\n|\r|\n/).length;
 const add=(kind,name,at)=>refs.push({kind,name,line:line(at)});
 let from=0;
 while(true){
  const open=source.indexOf('\${{',from);if(open<0)break;
  let end=open+3,closed=false;
  for(;end<source.length;){
   if(source[end]==="'"||source[end]==='"'){end=quotedEnd(source,end);continue;}
   if(source.slice(end,end+2)==='}}'){closed=true;break;}end++;
  }
  const body=source.slice(open+3,end);
  if(!closed)add('unresolved_secret_reference',null,open);
  for(let i=0;i<body.length;){
   if(body[i]==="'"||body[i]==='"'){i=quotedEnd(body,i);continue;}
   const m=/^secrets\b/i.exec(body.slice(i));
   if(!m||i>0&&/[\w$]/.test(body[i-1])){i++;continue;}
   const offset=i;
   const tail=body.slice(i+7),direct=/^\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(tail),
    bracket=/^\s*\[\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/.exec(tail);
   const matched=direct||bracket,name=direct?.[1]||bracket?.[2];
   if(matched){const upper=name.toUpperCase();add(SIGNING.test(upper)?'signing_private_key_reference':'named_credential_reference',upper,open+3+offset);i+=7+matched[0].length;}
   else{add('unresolved_secret_reference',null,open+3+offset);i+=7;}
  }
  if(!closed)break;from=end+2;
 }
 // YAML collection inheritance/aliasing is outside expression syntax.
 for(const m of source.matchAll(/(?<![\w])(?:secrets|'secrets'|"secrets")\s*:\s*(?:(?:&[\w-]+\s+)?(?:inherit|'inherit'|"inherit")|\*[\w-]+)(?=\s|[,}#]|$)/gi))
  add('secret_inheritance_forbidden',null,m.index);
 for(const m of source.matchAll(/(?<![\w])(?:uses|'uses'|"uses")\s*:\s*['"]?([^\s'"]*\.github\/workflows\/[^\s'"]+)/gi))
  if(!m[1].startsWith('./.github/workflows/'))add('external_reusable_workflow_forbidden',null,m.index);
 return refs;
}
