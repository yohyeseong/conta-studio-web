const ROOT='https://conta-official-data.conta-studio-yohyeseong.workers.dev/official-202609-v1/';
export const VERSION='official-202609-v1';
const TOKEN=0x20260909,memo=new Map(),overlap=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
async function json(path){if(!memo.has(path))memo.set(path,fetch(ROOT+path).then(async r=>{if(!r.ok)throw Error('공식 자료 연결 실패 ('+r.status+')');return r.json();}).catch(e=>{memo.delete(path);throw e;}));return memo.get(path);}
export function decodeTile(raw){
 const v=new DataView(raw),text=new TextDecoder('utf-8',{fatal:true});let at=16;
 if(raw.byteLength<16||text.decode(new Uint8Array(raw,0,4))!=='CBT1'||v.getUint32(4,true)!==TOKEN||v.getUint32(12,true)!==1)throw Error('공식 도형 헤더 불일치');
 const features=[],count=v.getUint32(8,true);
 for(let i=0;i<count;i++){
  if(at+4>raw.byteLength)throw Error('공식 도형 잘림');const len=v.getUint32(at,true);at+=4;const end=at+len;
  if(len<48||end>raw.byteLength)throw Error('공식 도형 길이 불일치');
  const bbox=[0,4,8,12].map(d=>v.getInt32(at+d,true)/1e7),height=v.getFloat32(at+16,true),levels=v.getUint16(at+20,true),basement=v.getUint16(at+22,true),nameLen=v.getUint16(at+24,true),kind=v.getUint16(at+26,true),id='official/'+hex(raw.slice(at+28,at+44));
  if(kind!==1&&kind!==2)throw Error('공식 도형 종류 불일치');
  at+=44;if(at+nameLen+2>end)throw Error('공식 도형 이름 잘림');const name=text.decode(new Uint8Array(raw,at,nameLen));at+=nameLen;
  const polys=[],np=v.getUint16(at,true);at+=2;if(!np)throw Error('공식 도형 비어 있음');
  for(let p=0;p<np;p++){if(at+2>end)throw Error('공식 면 잘림');const rings=[],nr=v.getUint16(at,true);at+=2;if(!nr)throw Error('공식 면 비어 있음');
   for(let r=0;r<nr;r++){if(at+4>end)throw Error('공식 선 잘림');const n=v.getUint32(at,true);at+=4;if(n<4||at+n*8>end)throw Error('공식 좌표 잘림');const ring=[];for(let k=0;k<n;k++){ring.push([v.getInt32(at,true)/1e7,v.getInt32(at+4,true)/1e7]);at+=8;}if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw Error('공식 경계 미닫힘');rings.push(ring);}polys.push(rings);
  }
  if(at!==end)throw Error('공식 도형 잔여 데이터');
  const properties={official_detail:true,geometry_source:kind===1?'VWorld GIS건물통합정보':'행정안전부 실폭도로',source_date:'2026-09-09'};
  if(kind===1){properties.building='yes';if(height>0&&height<1000)properties.height=height;if(levels)properties['building:levels']=levels;if(basement)properties['building:levels:underground']=basement;}else properties['area:highway']='road';if(name)properties.name=name;
  features.push({type:'Feature',id,bbox,properties,geometry:polys.length===1?{type:'Polygon',coordinates:polys[0]}:{type:'MultiPolygon',coordinates:polys}});
 }
 if(at!==raw.byteLength)throw Error('공식 타일 잔여 데이터');return features;
}
async function tile(px,py,key,parent,info){
 const cacheKey='tile/'+key;if(memo.has(cacheKey))return memo.get(cacheKey);
 const job=(async()=>{
  const disk=globalThis.caches?await caches.open('conta-official-202609-v1').catch(()=>null):null,url=ROOT+'_cached/'+key+'?sha='+info.sha256,cached=disk?await disk.match(url):null;let packed;
  if(cached)packed=await cached.arrayBuffer();else {
   const response=await fetch(ROOT+px+'_'+py+'.pack',{headers:{Range:'bytes='+info.offset+'-'+(info.offset+info.bytes-1)}});if(!response.ok)throw Error('공식 타일 수신 실패 ('+response.status+')');packed=await response.arrayBuffer();
   if(response.status===200){if(packed.byteLength!==parent.bytes||hex(await crypto.subtle.digest('SHA-256',packed))!==parent.sha256)throw Error('공식 묶음 검증 실패');packed=packed.slice(info.offset,info.offset+info.bytes);}
   else if(response.status!==206||response.headers.get('Content-Range')!=='bytes '+info.offset+'-'+(info.offset+info.bytes-1)+'/'+parent.bytes)throw Error('공식 타일 범위 불일치');
  }
  if(packed.byteLength!==info.bytes||hex(await crypto.subtle.digest('SHA-256',packed))!==info.sha256)throw Error('공식 타일 검증 실패');
  if(disk&&!cached)disk.put(url,new Response(packed)).then(async()=>{const keys=await disk.keys();for(const old of keys.slice(0,Math.max(0,keys.length-128)))await disk.delete(old);}).catch(()=>{});
  const raw=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(raw.byteLength!==info.rawBytes)throw Error('공식 타일 크기 불일치');const features=decodeTile(raw);if(features.length!==info.features)throw Error('공식 타일 건수 불일치');return features;
 })();memo.set(cacheKey,job);try{const result=await job;if(memo.size>100){const old=[...memo.keys()].find(k=>k.startsWith('tile/')&&k!==cacheKey);if(old)memo.delete(old);}return result;}catch(e){memo.delete(cacheKey);throw e;}
}
export async function officialFeatures(bounds,zones=[]){
 const ids=Array.from({length:Math.floor(bounds[2]*100/5)-Math.floor(bounds[0]*100/5)+1},(_,i)=>String(Math.floor(bounds[0]*100/5)+i));const pendingColumns=Promise.all(ids.map(async c=>[c,await json(c+'.json').then(value=>({value}),error=>({error}))]));const index=await json('index.json');if(index.version!==VERSION||index.token!==TOKEN||!index.safeOnly||!index.complete||index.sources.length!==23||index.sources.reduce((n,r)=>n+r.counts.input,0)!==14392125)throw Error('공식 전국 자료 목록 불일치');
 const [w,s,e,n]=bounds,cells=[];for(let x=Math.floor(w/.01);x<=Math.floor(e/.01);x++)for(let y=Math.floor(s/.01);y<=Math.floor(n/.01);y++)cells.push({x,y,px:Math.floor(x/5),py:Math.floor(y/5)});if(cells.length>120)throw Error('공식 자료 선택 영역을 줄여주세요.');
 const columns=new Map();for(const [c,result] of await pendingColumns){if(!index.columns.includes(c))continue;if(result.error)throw result.error;const value=result.value;if(value.version!==VERSION||!value.safeOnly)throw Error('공식 지역 목록 불일치');columns.set(c,value);}
 const jobs=cells.flatMap(c=>{const parent=columns.get(String(c.px))?.parents[c.py],key=c.x+'_'+c.y,info=parent?.tiles[key];return info?[{...c,parent,key,info}]:[];}),all=new Map();
 for(let i=0;i<jobs.length;i+=6)for(const features of await Promise.all(jobs.slice(i,i+6).map(c=>tile(c.px,c.py,c.key,c.parent,c.info))))for(const f of features)if(overlap(f.bbox,bounds)&&!zones.some(z=>overlap(z,f.bbox)))all.set(f.id,f);
 return [...all.values()];
}
export async function officialMetadata(bounds){const index=await json('index.json');if(index.version!==VERSION||!index.safeOnly||!index.complete)throw Error('공식 자료 목록 불일치');const columns=new Set();for(let x=Math.floor(bounds[0]/.05);x<=Math.floor(bounds[2]/.05);x++)columns.add(String(x));await Promise.all([...columns].filter(c=>index.columns.includes(c)).map(c=>json(c+'.json')));}

// Begin the shared catalog request while the map and interface initialize.
json('index.json').catch(()=>{});
