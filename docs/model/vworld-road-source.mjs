import {verifiedRoadsForBounds} from './verified-roads.mjs?v=verified1';
const service='https://conta-vworld-proxy.conta-studio-yohyeseong.workers.dev',decoder=new TextDecoder(),tileCache=new Map();
// Decode the public vector tile format. Zoom levels are display scales, not Z.
function integer(bytes,state){let value=0,multiplier=1;for(let i=0;i<10;i++){if(state.at>=bytes.length)throw Error('잘린 벡터 타일');const b=bytes[state.at++];value+=(b&127)*multiplier;if(!(b&128))return value;multiplier*=128;}throw Error('잘못된 벡터 정수');}
function fields(bytes){const out=new Map(),s={at:0};while(s.at<bytes.length){const tag=integer(bytes,s),id=Math.floor(tag/8),wire=tag%8;let v;if(!id)throw Error('잘못된 벡터 필드');if(wire===0)v=integer(bytes,s);else if(wire===2){const n=integer(bytes,s);if(n>bytes.length-s.at)throw Error('잘린 벡터 필드');v=bytes.subarray(s.at,s.at+n);s.at+=n;}else if(wire===1||wire===5){const n=wire===1?8:4;if(s.at+n>bytes.length)throw Error('잘린 벡터 필드');v=bytes.subarray(s.at,s.at+n);s.at+=n;}else throw Error('지원하지 않는 벡터 필드');if(!out.has(id))out.set(id,[]);out.get(id).push(v);}return out;}
function packed(bytes){const s={at:0},values=[];while(s.at<bytes.length)values.push(integer(bytes,s));return values;}
function scalar(bytes){const f=fields(bytes);if(f.has(1))return decoder.decode(f.get(1)[0]);for(const k of [4,5,7])if(f.has(k))return f.get(k)[0];if(f.has(6)){const n=f.get(6)[0];return n%2?-Math.floor(n/2)-1:n/2;}for(const [k,size] of [[2,4],[3,8]])if(f.has(k)){const b=f.get(k)[0],d=new DataView(b.buffer,b.byteOffset,b.byteLength);return size===4?d.getFloat32(0,true):d.getFloat64(0,true);}return null;}
function shape(bytes,z,tx,ty,extent){const values=packed(bytes),paths=[];let x=0,y=0,at=0,ring;while(at<values.length){const cmd=values[at++],op=cmd%8,count=Math.floor(cmd/8);if(count>1000000)throw Error('벡터 도형이 너무 큽니다.');if(op===1||op===2){for(let i=0;i<count;i++){if(at+1>=values.length)throw Error('잘린 벡터 좌표');const a=values[at++],b=values[at++];x+=a%2?-Math.floor(a/2)-1:a/2;y+=b%2?-Math.floor(b/2)-1:b/2;if(op===1){ring=[];paths.push(ring);}if(!ring)throw Error('벡터 시작점 누락');ring.push([x,y]);}}else if(op===7){if(ring?.length&&ring[0].some((v,i)=>v!==ring.at(-1)[i]))ring.push([...ring[0]]);}else throw Error('잘못된 벡터 도형');}
 const ll=([x,y])=>[(tx+x/extent)/2**z*360-180,Math.atan(Math.sinh(Math.PI*(1-2*(ty+y/extent)/2**z)))*180/Math.PI],polys=[];
 for(const r of paths){const a=r.reduce((n,p,i)=>i?n+r[i-1][0]*p[1]-p[0]*r[i-1][1]:n,0);if(a>0)polys.push([r.map(ll)]);else if(a<0&&polys.length)polys.at(-1).push(r.map(ll));}
 return polys;
}
export function decodeRoadTile(bytes,z,x,y){const result=[];let found=false;for(const raw of fields(bytes).get(3)||[]){const layer=fields(raw),name=decoder.decode(layer.get(1)?.[0]||new Uint8Array());if(!/(^|\.)vl_rodway_bndry_1518$/.test(name))continue;found=true;const keys=(layer.get(3)||[]).map(v=>decoder.decode(v)),values=(layer.get(4)||[]).map(scalar),extent=layer.get(5)?.[0]||4096;if(extent<=0)throw Error('잘못된 벡터 축척');for(const rawFeature of layer.get(2)||[]){const f=fields(rawFeature);if(f.get(3)?.[0]!==3||!f.has(4))continue;const tags=packed(f.get(2)?.[0]||new Uint8Array()),properties={source_layer:name};if(tags.length%2)throw Error('잘못된 벡터 속성');for(let i=0;i<tags.length;i+=2){if(tags[i]>=keys.length||tags[i+1]>=values.length)throw Error('잘못된 벡터 속성');properties[keys[tags[i]]]=values[tags[i+1]];}for(const coordinates of shape(f.get(4)[0],z,x,y,extent))result.push({type:'Feature',properties,geometry:{type:'Polygon',coordinates}});}}if(!found)throw Error('VWorld 도로경계 레이어 미수신');return result;}

export function roadTilePlan(bounds){
 if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite))throw Error('조회 영역 오류');
 const [w,s,e,n]=bounds;if(w<124||e>132||s<33||n>39||w>=e||s>=n)throw Error('국내 도로 원본만 조회할 수 있습니다.');
 const z=18,size=2**z,tile=(lon,lat)=>[(lon+180)/360*size,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*size],a=tile(w,n),b=tile(e,s),jobs=[];
 for(let x=Math.floor(a[0]);x<=Math.floor(b[0]);x++)for(let y=Math.floor(a[1]);y<=Math.floor(b[1]);y++){jobs.push([z,x,y]);if(jobs.length>256)throw Error('도로 원본 조회 영역을 약 2km 이하로 줄여주세요.');}return jobs;
}
function tileBounds([z,x,y]){const size=2**z,lon=x=>x/size*360-180,lat=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/size)))*180/Math.PI;return [lon(x),lat(y+1),lon(x+1),lat(y)];}
async function receiveTile(job,fetcher){const key=job.join('/');if(tileCache.has(key))return tileCache.get(key);const r=await fetcher(service+'/vector/traffic/'+key+'.pbf',{signal:AbortSignal.timeout(12000)});if(!r.ok||r.status===204)throw Error('VWorld 도로 타일 수신 실패'+(r.status?' (HTTP '+r.status+')':''));const bytes=new Uint8Array(await r.arrayBuffer());if(!bytes.length||bytes.length>12000000||bytes[0]!==26)throw Error('VWorld 도로 좌표가 아닌 응답');const features=decodeRoadTile(bytes,...job).map(f=>({...f,properties:{...f.properties,'area:highway':'road',source_zoom:18,cartographic:true}})),value={coverage:tileBounds(job),features};tileCache.set(key,value);if(tileCache.size>64)tileCache.delete(tileCache.keys().next().value);return value;}
export async function loadSourceRoads(bounds,{fetcher=fetch,cachedLoader=verifiedRoadsForBounds,onProgress=()=>{}}={}){
 const cached=await cachedLoader(bounds,{fetcher}).catch(()=>({regions:[]})),saved=cached.regions||[];let jobs,reason='';
 try{jobs=roadTilePlan(bounds);}catch(e){return {state:saved.length?'partial':'unavailable',regions:saved,complete:false,reason:e.message,provider:'VWorld',ngii:'boundary-api-not-connected'};}
 // Probe one tile before scheduling the area, so an unavailable provider does
 // not cause hundreds of failed calls. No centreline or width fallback exists.
 const received=[];let failed=0;
 try{onProgress('VWorld 도로 원본 수신 중',50);received.push(await receiveTile(jobs[0],fetcher));}
 catch(e){failed++;reason=e.message;}
 if(!failed){let next=1;await Promise.all(Array.from({length:Math.min(4,jobs.length-1)},async()=>{while(next<jobs.length&&failed<4){const j=jobs[next++];try{received.push(await receiveTile(j,fetcher));}catch(e){failed++;reason=e.message;}onProgress('VWorld 도로 원본 수신 중 · '+received.length+' / '+jobs.length,50+Math.round(received.length/jobs.length*8));}}));}
 const regions=[...saved];if(received.length){const coverage=received.map(v=>v.coverage),features=received.flatMap(v=>v.features);regions.push({id:'vworld-live-'+bounds.join(','),name:'VWorld 선택 영역 도로 원본',bbox:bounds,coverage,features,live:true});}
 const complete=received.length===jobs.length;
 return {state:complete?'available':regions.length?'partial':'failed',regions,complete,receivedTiles:received.length,expectedTiles:jobs.length,reason:complete?'':reason,provider:'VWorld',ngii:'boundary-api-not-connected'};
}
