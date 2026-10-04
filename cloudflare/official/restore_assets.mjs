import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
const ROOT='https://conta-official-data.conta-studio-yohyeseong.workers.dev/',target=resolve('cloudflare/official/public'),sha=b=>createHash('sha256').update(b).digest('hex');
async function get(path){for(let attempt=0;attempt<4;attempt++)try{const r=await fetch(ROOT+path,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Public asset HTTP '+r.status);return Buffer.from(await r.arrayBuffer());}catch(e){if(attempt===3)throw e;await new Promise(r=>setTimeout(r,1000*2**attempt));}}
const manifest=JSON.parse((await get('manifest.json')).toString('utf8'));if(manifest.version!=='official-202609-v1'||!manifest.safeOnly)throw Error('Unexpected public edition');
const jobs=Object.entries(manifest.files);let cursor=0;
await Promise.all(Array.from({length:12},async()=>{while(cursor<jobs.length){const [name,info]=jobs[cursor++],path=resolve(target,name);if(!path.startsWith(target+sep))throw Error('Invalid asset path');const data=name==='_headers'?await readFile('cloudflare/official/asset-headers.txt'):await get(name);if(data.length!==info.bytes||sha(data)!==info.sha256)throw Error('Asset integrity failure: '+name);await mkdir(dirname(path),{recursive:true});await writeFile(path,data);}}));
await writeFile(resolve(target,'manifest.json'),JSON.stringify(manifest));console.log('Restored verified published edition:',jobs.length,'assets');
