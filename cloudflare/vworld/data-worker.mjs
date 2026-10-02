const DATASETS={buildings:'LT_C_SPBD',roads:'LT_L_SPRD'};
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
export default {
 async fetch(request,env){
  const allowed=env.ALLOWED_ORIGIN||'https://yohyeseong.github.io';
  const headers={'Access-Control-Allow-Origin':allowed,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'application/json'};
  const reply=(status,value)=>new Response(JSON.stringify(value),{status,headers});
  const fail=(status,message)=>reply(status,{error:message});
  if(request.headers.get('Origin')!==allowed)return fail(403,'Site not allowed');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
  if(request.method!=='GET')return fail(405,'GET required');
  const url=new URL(request.url);
  if(url.pathname==='/health')return reply(200,{ready:!!env.VWORLD_API_KEY,mode:'data',datasets:Object.keys(DATASETS)});
  const kind=url.pathname.split('/')[2];
  if(url.pathname!=='/data/'+kind||!DATASETS[kind])return fail(404,'Unknown dataset');
  if([...url.searchParams.keys()].some(k=>!['bbox','page'].includes(k)))return fail(400,'Unsupported parameter');
  const raw=url.searchParams.get('bbox')||'',bounds=raw.split(',').map(Number),page=Number(url.searchParams.get('page')||1);
  if(bounds.length!==4||!bounds.every(Number.isFinite)||raw.split(',').some(v=>!v.trim())||!Number.isInteger(page)||page<1||page>20)return fail(400,'Invalid query');
  const [w,s,e,n]=bounds;
  if(w<124||s<33||e>132||n>39||w>=e||s>=n)return fail(400,'Invalid Korean bounds');
  const width=(e-w)*111319.49*Math.cos((s+n)/2*Math.PI/180),height=(n-s)*111319.49;
  if(width>3000||height>3000||width*height>4e6)return fail(400,'Region too large');
  if(!env.VWORLD_API_KEY?.trim())return fail(503,'Data service not configured');
  if(env.TILE_LIMITER){const limit=await env.TILE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});if(!limit.success)return fail(429,'Please retry later');}
  const key=env.VWORLD_API_KEY.trim();
  const params=new URLSearchParams({service:'data',version:'2.0',request:'GetFeature',format:'json',size:'1000',page:String(page),data:DATASETS[kind],geometry:'true',attribute:'true',crs:'EPSG:4326',geomFilter:'BOX('+bounds.join(',')+')',domain:allowed,key});
  try{
   const upstream=await fetch('https://api.vworld.kr/req/data?'+params,{headers:{Referer:allowed+'/conta-studio-web/model/','User-Agent':UA,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});
   if(!upstream.ok)return fail(502,'Data provider HTTP '+upstream.status);
   const buffer=await upstream.arrayBuffer();if(buffer.byteLength>12000000)return fail(502,'Data response too large');
   let response;try{response=JSON.parse(new TextDecoder().decode(buffer)).response;}catch{return fail(502,'Invalid data response');}
   if(response?.status==='NOT_FOUND')return reply(200,{type:'FeatureCollection',features:[],source:'VWorld',dataset:DATASETS[kind],page,total:0});
   if(response?.status!=='OK'){
    const codes=['INVALID_KEY','UNAUTHORIZED_KEY','INCORRECT_KEY','UNREGISTERED_DOMAIN','INVALID_DOMAIN','PERMISSION_DENIED','INVALID_RANGE','INVALID_REQUEST','INVALID_PARAMETER','OVER_LIMIT','LIMIT_EXCEEDED','SERVICE_UNAVAILABLE'];
    const code=String(response?.error?.code||'');return fail(502,codes.includes(code)?'Data provider '+code:'Data provider rejected request');
   }
   const features=response?.result?.featureCollection?.features;
   if(!Array.isArray(features)||features.length>1000||features.some(f=>f.type!=='Feature'||!f.geometry))return fail(502,'Invalid geographic data');
   const total=Number(response?.record?.total??features.length);if(!Number.isInteger(total)||total<features.length)return fail(502,'Invalid feature count');
   const value={type:'FeatureCollection',features,source:'VWorld',dataset:DATASETS[kind],crs:'EPSG:4326',page,total};
   return new Response(JSON.stringify(value).replaceAll(key,'[redacted]'),{headers});
  }catch(error){return fail(502,error?.name==='TimeoutError'?'Data provider timeout':'Data provider connection failed');}
 }
};
