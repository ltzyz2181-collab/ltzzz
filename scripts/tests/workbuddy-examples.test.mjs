import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateExamples} from '../check-workbuddy-examples.mjs';
const current=fs.readFileSync('products/workbuddy/ltzzz-source-check/SKILL.md','utf8');
test('actual repository skill has matching nonempty bilingual examples',()=>{assert.deepEqual(validateExamples(current),{examples_zh:2,examples_en:2});});
test('the reported two-Chinese one-English package regression is rejected',()=>{const old=current.replace('  - "Compare the two documents and list conflicts and date differences."\n','');assert.throws(()=>validateExamples(old),/count_mismatch/);});
test('optional examples may be absent; a one-sided or duplicate field is not accepted',()=>{
 assert.deepEqual(validateExamples('---\nname: fixture\n---\nBody'),{examples_zh:0,examples_en:0});
 for(const text of ['---\nexamples_zh:\n- "A"\n---\n','---\nexamples_zh:\n- "A"\nexamples_zh:\n- "B"\n---\n'])assert.throws(()=>validateExamples(text));
});
test('CRLF and official unindented block lists preserve bilingual counts',()=>{const text=current.replace(/^  -/gm,'-').replace(/\n/g,'\r\n');assert.deepEqual(validateExamples(text),{examples_zh:2,examples_en:2});});
