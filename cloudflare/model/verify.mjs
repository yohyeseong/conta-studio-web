import {createHash} from 'node:crypto';
const root='https://conta-model-data.conta-studio-yohyeseong.workers.dev/model-20261002-v1/';
const index=await (await fetch(root+'index.json')).json();if(!index.complete||!index.safeOnly||index.dataVersion!=='895aa1a4fe0bd79c-prepared2')throw Error('Incomplete model edition');
const catalog=await (await fetch(root+'2539.json')).json(),parent=catalog.parents['751'],tile=parent.tiles['12697_3756'];
const response=await fetch(root+'2539_751.pack',{headers:{Range:`bytes=${tile.offset}-${tile.offset+tile.bytes-1}`}}),data=Buffer.from(await response.arrayBuffer());
if(response.status!==206||response.headers.get('Content-Range')!==`bytes ${tile.offset}-${tile.offset+tile.bytes-1}/${parent.bytes}`||data.length!==tile.bytes||createHash('sha256').update(data).digest('hex')!==tile.sha256)throw Error('Model range integrity failure');console.log('Verified complete model edition and true byte-range delivery:',index.tiles,'cells,',data.length,'bytes');
