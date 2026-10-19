import dataWorker from './data-worker.mjs';
const ORIGIN='https://yohyeseong.github.io';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const fail=(status,error)=>Response.json({error},{status,headers});
export default {async fetch(request,env){
 const u=new URL(request.url);
 if(!u.pathname.startsWith('/vector/'))return dataWorker.fetch(request,env);
 if(request.headers.get('Origin')!==ORIGIN)return fail(403,'Site not allowed');
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
 if(request.method!=='GET'||u.search)return fail(400,'Unsupported vector request');
 if(!env.VWORLD_API_KEY?.trim())return fail(503,'VWorld credential not configured');
 const tile=/^\/vector\/(poi|traffic)\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.pbf$/.exec(u.pathname);
 const style=/^\/vector\/style\/(poi|traffic)$/.exec(u.pathname);
 if(!tile&&!style)return fail(404,'Unknown vector request');
 const key=env.VWORLD_API_KEY.trim();let url;
 if(tile){
  const kind=tile[1],[z,x,y]=tile.slice(2).map(Number),size=2**z;
  const lon=v=>v/size*360-180,lat=v=>Math.atan(Math.sinh(Math.PI*(1-2*v/size)))*180/Math.PI;
  if(z<6||z>19||x>=size||y>=size||lon(x)>132||lon(x+1)<124||lat(y)<33||lat(y+1)>39)return fail(400,'Invalid Korean vector tile');
  // The official vector guide names the X index tileRow and Y index tileCol.
  url='https://api.vworld.kr/req/wmts/vector/getTile/'+encodeURIComponent(key)+'/'+kind+'/'+z+'/'+x+'/'+y+'.pbf';
 }else url='https://api.vworld.kr/req/wmts/vector/getStyle/'+encodeURIComponent(key)+'/'+(style[1]==='poi'?'vectorStylePoi':'vectorStyleTraffic');
 if(env.TILE_LIMITER&&!((await env.TILE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success))return fail(429,'Please retry later');
 try{
  const r=await fetch(url,{headers:{Referer:ORIGIN+'/conta-studio-web/model/','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',Accept:style?'application/json':'application/x-protobuf,application/octet-stream'},redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!r.ok)return fail(502,'VWorld vector provider HTTP '+r.status);
  const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>12000000)return fail(502,'Vector response too large');
  if(!bytes.length)return new Response(null,{status:204,headers});
  const text=new TextDecoder().decode(bytes);
  if(style){let value;try{value=JSON.parse(text);}catch{return fail(502,'Invalid vector style JSON');}if(!value||typeof value!=='object')return fail(502,'Invalid vector style');return new Response(JSON.stringify(value).replaceAll(key,'[redacted]').replaceAll(encodeURIComponent(key),'[redacted]'),{headers:{...headers,'Content-Type':'application/json'}});}
  if(bytes[0]!==26||text.includes(key))return fail(502,'Provider did not return a vector tile');
  return new Response(bytes,{headers:{...headers,'Content-Type':'application/vnd.mapbox-vector-tile'}});
 }catch{return fail(502,'VWorld vector provider connection failed');}
}};
