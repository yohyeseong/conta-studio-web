import {buildSkp} from './skp-export.mjs?v=skp3';
onmessage=e=>{try{const result=buildSkp(e.data.items,e.data.scale,e.data.cad,(progress,message)=>postMessage({progress,message}));postMessage(result,[result.bytes.buffer]);}catch(error){postMessage({error:String(error.message||error)});}};
