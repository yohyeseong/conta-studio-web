import {BOOTSTRAP_HASH,BOOTSTRAP_UNTIL} from './bootstrap.mjs';
const ORIGIN='https://yohyeseong.github.io';
const REGISTERED_URL=ORIGIN+'/conta-studio-web/model/';
const CORS={'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const encoder=new TextEncoder();
const json=(data,status=200)=>Response.json(data,{status,headers:CORS});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
function store(env){return env.KEY_STORE.get(env.KEY_STORE.idFromName('service-key'));}
let cachedKey;
async function apiKey(env){if(cachedKey)return cachedKey;const r=await store(env).fetch('https://internal/key');if(r.ok)cachedKey=await r.text();return cachedKey;}
let airYear=2025,yearChecked=0;
async function latestAirYear(){
 if(Date.now()-yearChecked<3600000)return airYear;
 try{const r=await fetch('https://map.ngii.go.kr/openapi/AirPhotoYear.do',{headers:{Referer:REGISTERED_URL},redirect:'manual',signal:AbortSignal.timeout(12000)});if(r.ok){const d=await r.json();if(d.SUCCESS&&/^20\d{2}$/.test(String(d.RESULT))){airYear=Number(d.RESULT);yearChecked=Date.now();}}}catch{}
 return airYear;
}
// The object has no public URL. Only this Worker can access the credential.
export class NgiiKeyStore{
 constructor(state){this.storage=state.storage;}
 async fetch(request){
  if(new URL(request.url).pathname==='/configure'&&request.method==='POST'){
   const value=await request.text();
   if(value.length<8||value.length>512||/\s/.test(value))return new Response(null,{status:400});
   const saved=await this.storage.transaction(async tx=>{if(await tx.get('apiKey'))return false;await tx.put('apiKey',value);return true;});
   return new Response(null,{status:saved?201:409});
  }
  if(new URL(request.url).pathname==='/key'&&request.method==='GET'){
   const value=await this.storage.get('apiKey');return value?new Response(value):new Response(null,{status:404});
  }
  return new Response(null,{status:404});
 }
}
export default {async fetch(request,env){
 try{
  const u=new URL(request.url);
  if(u.pathname==='/health'&&request.method==='GET')return json({service:'ngii-basemap',ready:!!(await apiKey(env))});
  if(request.headers.get('Origin')!==ORIGIN)return json({error:'Site not allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...CORS,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
  if(env.TILE_LIMITER&&!((await env.TILE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success))return json({error:'Please retry later'},429);
  if(u.pathname==='/configure'&&request.method==='POST'){
   const bearer=request.headers.get('Authorization')||'';
   if(!BOOTSTRAP_HASH||Date.now()>BOOTSTRAP_UNTIL||!bearer.startsWith('Bearer ')||await digest(bearer.slice(7))!==BOOTSTRAP_HASH)return json({error:'Not authorized'},403);
   if(Number(request.headers.get('Content-Length')||0)>2048)return json({error:'Invalid configuration'},400);
   const value=await request.text();if(value.length>2048)return json({error:'Invalid configuration'},400);
   let data;try{data=JSON.parse(value);}catch{return json({error:'Invalid configuration'},400);}
   if(typeof data.apiKey!=='string')return json({error:'Invalid configuration'},400);
   const result=await store(env).fetch('https://internal/configure',{method:'POST',body:data.apiKey.trim()});
   return json({configured:result.status===201},result.status);
  }
  if(request.method!=='GET'||u.search)return json({error:'Unknown request'},404);
  if(u.pathname==='/air-year'){
   return json({SUCCESS:true,RESULT:await latestAirYear()});
  }
  const match=/^\/tiles\/(normal|white|satellite|air)\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.(png|jpg)$/.exec(u.pathname);
  if(!match)return json({error:'Unknown request'},404);
  const kind=match[1],[z,row,col]=match.slice(2,5).map(Number),span=256*66846.72/2**z;
  if(z<5||z>18||col*span-200000>1520000||(col+1)*span-200000<580000||4000000-row*span<1330000||4000000-(row+1)*span>2230000)return json({error:'Outside map coverage'},400);
  const key=await apiKey(env);if(!key)return json({error:'Map service not configured'},503);
  const air=kind==='air',upstream=new URL(air?'https://map.ngii.go.kr/airmapprime/map/wmts':'https://map.ngii.go.kr/openapi/Gettile.do');
  upstream.search=new URLSearchParams({SERVICE:'WMTS',REQUEST:'GetTile',VERSION:'1.0.0',LAYER:air?'mapprime:air_'+await latestAirYear():{normal:'korean_map',white:'white_map',satellite:'satellite_map'}[kind],STYLE:air?'':'korean',FORMAT:air?'image/jpeg':'image/png',TILEMATRIXSET:air?'NGIS_AIR':'EPSG:5179',TILEMATRIX:air?String(z):'L'+String(z).padStart(2,'0'),TILEROW:String(row),TILECOL:String(col),...(air?{}:{apikey:key})});
  const r=await fetch(upstream,{headers:{Referer:REGISTERED_URL,Accept:'image/png,image/jpeg','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'},redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!r.ok){const text=(await r.text()).replaceAll(key,'[redacted]').replaceAll(encodeURIComponent(key),'[redacted]');const title=/<title[^>]*>([^<]{0,120})<\/title>/i.exec(text)?.[1]||'';return json({error:'Map provider unavailable',upstreamStatus:r.status,upstreamTitle:title,upstreamReason:text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,400),upstreamType:r.headers.get('Content-Type')||'',authenticationMessage:/apikey|인증키|referer|refrnurl/i.test(text)},502);}
  const bytes=new Uint8Array(await r.arrayBuffer());
  const png=[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(bytes.length<100||bytes.length>2097152||!png&&!jpeg)return json({error:'Invalid map image'},502);
  return new Response(bytes,{headers:{...CORS,'Content-Type':png?'image/png':'image/jpeg'}});
 }catch{return json({error:'Map service temporarily unavailable'},502);}
}};
