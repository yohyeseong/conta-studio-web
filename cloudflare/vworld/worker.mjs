const PNG=[137,80,78,71,13,10,26,10];
export default {
 async fetch(request,env){
  const allowed=env.ALLOWED_ORIGIN||'https://yohyeseong.github.io';
  const origin=request.headers.get('Origin');
  const headers={'Access-Control-Allow-Origin':allowed,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const fail=(status,message)=>new Response(JSON.stringify({error:message}),{status,headers:{...headers,'Content-Type':'application/json'}});
  if(origin!==allowed)return fail(403,'Site not allowed');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
  if(request.method!=='GET')return fail(405,'GET required');
  const url=new URL(request.url);
  if(url.pathname==='/health')return new Response(JSON.stringify({ready:!!env.VWORLD_API_KEY}),{headers:{...headers,'Content-Type':'application/json'}});
  const match=/^\/tiles\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.png$/.exec(url.pathname);
  if(!match||url.search)return fail(404,'Unknown tile');
  const [z,x,y]=match.slice(1).map(Number),size=2**z;
  if(z<7||z>19||x<0||y<0||x>=size||y>=size)return fail(400,'Invalid tile');
  const west=x/size*360-180,east=(x+1)/size*360-180;
  const lat=v=>Math.atan(Math.sinh(Math.PI*(1-2*v/size)))*180/Math.PI;
  if(east<124||west>132||lat(y)<33||lat(y+1)>39)return fail(404,'Outside Korea');
  if(!env.VWORLD_API_KEY)return fail(503,'Map service not configured');
  if(env.TILE_LIMITER){const result=await env.TILE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});if(!result.success)return fail(429,'Please retry later');}
  try{
   const upstream=await fetch('https://api.vworld.kr/req/wmts/1.0.0/'+encodeURIComponent(env.VWORLD_API_KEY)+'/Base/'+z+'/'+y+'/'+x+'.png',{headers:{Referer:allowed+'/'},redirect:'manual',signal:AbortSignal.timeout(12000)});
   if(!upstream.ok||!upstream.headers.get('Content-Type')?.toLowerCase().startsWith('image/png'))return fail(502,'Map provider unavailable');
   const bytes=new Uint8Array(await upstream.arrayBuffer());
   if(bytes.length>2097152||!PNG.every((v,i)=>bytes[i]===v))return fail(502,'Invalid map image');
   return new Response(bytes,{headers:{...headers,'Content-Type':'image/png'}});
  }catch{return fail(502,'Map provider unavailable');}
 }
};
