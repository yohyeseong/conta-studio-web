const BASE=new URL('./data/city-map/',import.meta.url).href;
const get=async(path,info)=>{const url=BASE+path,disk=await caches.open('conta-city1'),stored=await disk.match(url),response=stored||await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('도시 지도 수신 실패');const bytes=await response.arrayBuffer();if(info){const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==info.bytes||sha!==info.sha256){await disk.delete(url);throw Error('도시 지도 검증 실패');}}if(!stored)await disk.put(url,new Response(bytes));if(!info)return JSON.parse(new TextDecoder().decode(bytes));const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(raw.byteLength!==info.rawBytes)throw Error('도시 지도 크기 오류');return JSON.parse(new TextDecoder().decode(raw));};
const ROOT='',VERSION='895aa1a4fe0bd79c-city1';
export async function cityMap(bounds){
 const index=await get(ROOT+'index.json');if(index.version!==VERSION||!index.safeOnly||!index.complete||index.step!==.1)throw Error('도시 지도 목록 검증 실패');
 const [w,s,e,n]=bounds,x0=Math.floor(w/.1),x1=Math.floor(e/.1),y0=Math.floor(s/.1),y1=Math.floor(n/.1),jobs=[];
 if((x1-x0+1)*(y1-y0+1)>256)throw Error('지도를 조금 확대하세요.');
 for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const id=x+'_'+y,info=index.tiles[id];if(info)jobs.push({id,info});}
 const features=[];for(let i=0;i<jobs.length;i+=8){const rows=await Promise.all(jobs.slice(i,i+8).map(j=>get(ROOT+'tiles/'+j.id+'.json.gz',j.info)));for(const row of rows){if(row.version!==VERSION||!row.safeOnly||!Array.isArray(row.features))throw Error('도시 지도 도형 검증 실패');features.push(...row.features);}}
 return {type:'FeatureCollection',features,bounds:[x0*.1,y0*.1,(x1+1)*.1,(y1+1)*.1]};
}
