const base=new URL('./data/verified-roads/',import.meta.url),pending=new Map();
let manifest;
const overlap=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
const box=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=124&&b[2]<=132&&b[1]>=33&&b[3]<=39&&b[0]<b[2]&&b[1]<b[3];
export async function verifiedRoadsForBounds(bounds,{fetcher=fetch}={}){
 if(!box(bounds))return {state:'unavailable',regions:[]};
 try{
  if(!manifest)manifest=fetcher(new URL('index.json?v=verified1',base),{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error('road catalog');const v=await r.json();if(v.version!=='verified-roads-1'||!Array.isArray(v.regions)||v.regions.length>200)throw Error('road catalog');for(const p of v.regions)if(!box(p.bbox)||!/^[a-z0-9-]+\.geojson$/.test(p.path)||!Number.isInteger(p.bytes)||p.bytes<1||p.bytes>5000000||!/^[a-f0-9]{64}$/.test(p.sha256))throw Error('road catalog');return v;}).catch(e=>{manifest=null;throw e;});
  const index=await manifest,regions=[];
  for(const entry of index.regions.filter(e=>(e.coverage||[e.bbox]).some(b=>overlap(b,bounds)))){
   if(!pending.has(entry.sha256))pending.set(entry.sha256,(async()=>{
    const r=await fetcher(new URL(entry.path,base),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('road data');const bytes=await r.arrayBuffer();if(bytes.byteLength!==entry.bytes)throw Error('road bytes');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==entry.sha256)throw Error('road hash');const value=JSON.parse(new TextDecoder().decode(bytes)),m=value.metadata;
    if(value.type!=='FeatureCollection'||!Array.isArray(value.features)||!value.features.length||value.features.length>10000||!m||m.expectedTiles!==m.receivedTiles||!Number.isInteger(m.expectedTiles)||m.expectedTiles<1||JSON.stringify(m.bbox)!==JSON.stringify(entry.bbox)||JSON.stringify(m.coverage)!==JSON.stringify(entry.coverage)||!Array.isArray(entry.coverage)||entry.coverage.length!==m.receivedTiles||!entry.coverage.every(box))throw Error('road coverage');
    const valid=c=>Array.isArray(c)&&(typeof c[0]==='number'?c.length>=2&&c.every(Number.isFinite)&&c[0]>=124&&c[0]<=132&&c[1]>=33&&c[1]<=39:c.length>0&&c.every(valid));
    if(value.features.some(f=>f.type!=='Feature'||!['Polygon','MultiPolygon'].includes(f.geometry?.type)||!valid(f.geometry.coordinates)||f.properties?.['area:highway']!=='road'))throw Error('road geometry');
    return {...entry,features:value.features};
   })().catch(e=>{pending.delete(entry.sha256);throw e;}));
   regions.push(await pending.get(entry.sha256));
  }
  return {state:regions.length?'available':'unavailable',regions};
 }catch{return {state:'failed',regions:[]};}
}
