const BASE='https://raw.githubusercontent.com/yohyeseong/conta-studio-web/korea-data/';
const cache=new Map();
const HASH=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
async function get(path,info){
 if(cache.has(path)){const item=cache.get(path);cache.delete(path);cache.set(path,item);return item;}
 const pending=(async()=>{const url=BASE+path;const disk=globalThis.caches?await caches.open('conta-korea-4e05284bc04d8ff5'):null;let r=disk?await disk.match(url):null;const stored=!!r;if(!r)r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('전국 데이터 연결 실패 ('+r.status+'). 잠시 후 다시 시도하세요.');
 if(!info){const copy=r.clone();const value=await r.json();if(disk&&!stored)await disk.put(url,copy).catch(()=>{});return value;}const copy=r.clone();const bytes=await r.arrayBuffer();if(bytes.byteLength!==info.bytes||await HASH(bytes)!==info.sha256){if(disk)await disk.delete(url);throw Error('전국 데이터 검증 실패');}if(disk&&!stored)await disk.put(url,copy).catch(()=>{});
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));const raw=await new Response(stream).arrayBuffer();if(raw.byteLength!==info.rawBytes)throw Error('지역 데이터 크기 불일치');return JSON.parse(new TextDecoder().decode(raw));})();
 cache.set(path,pending);if(cache.size>16)cache.delete(cache.keys().next().value);try{return await pending;}catch(e){cache.delete(path);throw e;}
}
export function inKorea(b){return b[0]>=124&&b[1]>=33&&b[2]<=132&&b[3]<=39;}
export async function koreaData(bounds){
 if(!inKorea(bounds))throw Error('전국 데이터 범위 밖입니다.');
 const index=await get('index.json');if(index.safeOnly!==true||index.sourceDate!=='2026-09-18')throw Error('전국 데이터 버전 확인 실패');
 const [w,s,e,n]=bounds,step=index.step,ids=[];
 for(let x=Math.floor(w/step);x<=Math.floor(e/step);x++)for(let y=Math.floor(s/step);y<=Math.floor(n/step);y++)ids.push(x+'_'+y);
 if(ids.length>100)throw Error('지도를 더 확대하거나 선택 영역을 줄여주세요.');
 const catalogs=new Map();await Promise.all([...new Set(ids.map(id=>id.split('_')[0]))].filter(c=>index.columns.includes(c)).map(async c=>{const catalog=await get('catalog/'+c+'.json');if(catalog.version!==index.version)throw Error('전국 데이터 목록 버전 불일치');catalogs.set(c,catalog.tiles);}));
 const elements=new Map();
 // Bounded concurrency and deterministic merge preserve complete relation rings.
 for(let start=0;start<ids.length;start+=4){const tiles=await Promise.all(ids.slice(start,start+4).map(async id=>{const info=catalogs.get(id.split('_')[0])?.[id];return info?get('tiles/'+id+'.json.gz',info):{elements:[]};}));
 for(const tile of tiles)for(const item of tile.elements){const key=item.type+':'+item.id,old=elements.get(key);if(old&&item.type==='relation'){const members=new Map([...old.members,...item.members].map(m=>[m.type+':'+m.ref+':'+m.role,m]));elements.set(key,{...old,members:[...members.values()]});}else if(!old)elements.set(key,item);}}
 const boxes=new Map();
 function box(key,visiting=new Set()){if(boxes.has(key))return boxes.get(key);const item=elements.get(key);if(!item||visiting.has(key))return null;const next=new Set(visiting);next.add(key);let value;
 if(item.type==='node')value=[item.lon,item.lat,item.lon,item.lat];else if(item.bbox)value=item.bbox;else{const refs=item.type==='way'?item.nodes.map(id=>'node:'+id):item.members.map(m=>m.type+':'+m.ref);const parts=refs.map(ref=>box(ref,next)).filter(Boolean);if(parts.length)value=[Math.min(...parts.map(p=>p[0])),Math.min(...parts.map(p=>p[1])),Math.max(...parts.map(p=>p[2])),Math.max(...parts.map(p=>p[3]))];}
 boxes.set(key,value);return value;}
 const keep=new Set();function include(key){if(keep.has(key))return;const item=elements.get(key);if(!item)throw Error('전국 데이터 참조 누락');keep.add(key);if(item.type==='way')item.nodes.forEach(id=>include('node:'+id));if(item.type==='relation')item.members.forEach(m=>include(m.type+':'+m.ref));}
 for(const [key,item] of elements){const b=box(key);if(b&&b[0]<=e&&b[2]>=w&&b[1]<=n&&b[3]>=s&&(item.type!=='node'||Object.keys(item.tags||{}).length))include(key);}
 return {version:0.6,generator:'Conta Studio Korea 2026-09-18',elements:[...keep].map(key=>elements.get(key))};
}
let dataWorker,nextId=0;const waiting=new Map();
function backgroundData(bounds,zoom,geo=false){if(typeof Worker==='undefined'||typeof document==='undefined')return koreaData(bounds).then(osm=>geo?MilitaryPolicy.inspect(osm).geo:osm);if(!dataWorker){dataWorker=new Worker(new URL('./korea-worker.js?v=map4',import.meta.url),{type:'module'});dataWorker.onmessage=e=>{const pending=waiting.get(e.data.id);if(!pending)return;waiting.delete(e.data.id);e.data.error?pending.reject(Error(e.data.error)):pending.resolve(e.data.geo||e.data.osm);};dataWorker.onerror=()=>{for(const p of waiting.values())p.reject(Error('지역 데이터 처리 실패'));waiting.clear();dataWorker.terminate();dataWorker=null;};}return new Promise((resolve,reject)=>{const id=++nextId;waiting.set(id,{resolve,reject});dataWorker.postMessage({id,bounds,zoom,geo});});}
export async function loadOSM(bounds,zoom){if(inKorea(bounds))return backgroundData(bounds);const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:new URLSearchParams({data:MilitaryPolicy.query(bounds,zoom)}),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('주변 데이터 연결 실패');const value=await r.json();if(value.remark)throw Error('주변 데이터 수집 미완료');return value;}

export async function loadMap(bounds,zoom){if(inKorea(bounds))return backgroundData(bounds,zoom,true);return MilitaryPolicy.inspect(await loadOSM(bounds,zoom)).geo;}
