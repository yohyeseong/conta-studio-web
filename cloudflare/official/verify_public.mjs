import {createHash} from 'node:crypto';
const ROOT='https://conta-official-data.conta-studio-yohyeseong.workers.dev/official-202609-v1/';
const sha=data=>createHash('sha256').update(data).digest('hex');
async function get(path,headers){const r=await fetch(ROOT+path,{headers,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Public asset HTTP '+r.status+' '+path);return r;}
const index=await (await get('index.json')).json();if(!index.safeOnly||!index.complete||index.sources.length!==23)throw Error('Public edition incomplete');
const catalog=await (await get('2539.json')).json(),[row,parent]=Object.entries(catalog.parents)[0],[key,tile]=Object.entries(parent.tiles)[0];
const r=await get('2539_'+row+'.pack',{Range:'bytes='+tile.offset+'-'+(tile.offset+tile.bytes-1),Origin:'https://yohyeseong.github.io'});if(r.headers.get('Access-Control-Allow-Origin')!=='https://yohyeseong.github.io')throw Error('Missing browser CORS');let data=Buffer.from(await r.arrayBuffer());
if(r.status===200){if(data.length!==parent.bytes||sha(data)!==parent.sha256)throw Error('Parent integrity failure');data=data.subarray(tile.offset,tile.offset+tile.bytes);}else if(r.status!==206)throw Error('Range status mismatch');
if(data.length!==tile.bytes||sha(data)!==tile.sha256)throw Error('Tile integrity failure');console.log('Public national edition, CORS and range integrity verified');
