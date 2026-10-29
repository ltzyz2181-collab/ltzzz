'use strict';
// VeFaaS CommonJS entry. Initialization stays lazy: public health never touches
// a key/model credential or creates local/durable state.
let runtime;
exports.handler=async function(event){
 runtime ||= import('./runtime.mjs').then(module=>module.createVolcRuntime());
 return (await runtime)(event);
};
