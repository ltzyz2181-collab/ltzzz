// Narrow check for this repository's quoted YAML example-list format, not a full
// YAML validator or proof of WorkBuddy acceptance. No network or model calls.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function validateExamples(text){
 const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
 if(!match)throw Error('frontmatter_required');
 const lists={};let current=null;
 for(const line of match[1].split(/\r?\n/)){
  if(!line.trim()||/^\s*#/.test(line))continue;
  const field=/^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
  if(field){
   current=['examples_zh','examples_en'].includes(field[1])?field[1]:null;
   if(current){if(Object.hasOwn(lists,current))throw Error('duplicate_example_field');if(field[2])throw Error('use_quoted_block_example_lists');lists[current]=[];}
   continue;
  }
  if(current){
   const row=/^\s*-\s+("(?:[^"\\]|\\.)*")\s*$/.exec(line);
   if(!row)throw Error('use_quoted_block_example_lists');
   const value=JSON.parse(row[1]);if(!value.trim())throw Error('empty_example');lists[current].push(value);
  }
 }
 // Both fields are optional in the public documentation. If examples are given,
 // preserve bilingual parity reported by the real platform parser.
 if(Object.keys(lists).length&&(!lists.examples_zh?.length||lists.examples_zh.length!==lists.examples_en?.length))throw Error('bilingual_example_count_mismatch');
 return {examples_zh:lists.examples_zh?.length||0,examples_en:lists.examples_en?.length||0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file='products/workbuddy/ltzzz-source-check/SKILL.md';
 try{const bytes=fs.readFileSync(file),counts=validateExamples(bytes.toString('utf8'));console.log(JSON.stringify({scope:'repository_example_parity_only_not_platform_acceptance',file,...counts,sha256:createHash('sha256').update(bytes).digest('hex')}));}
 catch{console.error('workbuddy_examples_invalid_check_bilingual_lists_before_packaging');process.exitCode=1;}
}
