import {prepareDomesticSetup} from './lib/vscode-domestic-setup.mjs';
try{console.log(JSON.stringify(prepareDomesticSetup(),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
