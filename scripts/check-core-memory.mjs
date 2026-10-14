import {assertCoreMemory} from './lib/core-memory-integrity.mjs';
console.log(JSON.stringify({status:'complete',model_calls:0,files:assertCoreMemory()},null,2));
