const CORS={'access-control-allow-origin':'https://yohyeseong.github.io','access-control-expose-headers':'Content-Range, Content-Length','access-control-allow-headers':'Range','cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff'};
const inflight=new Map();
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname==='/health')return Response.json({ready:true,version:'official-202609-v1'},{headers:CORS});
 if(!/^\/(model-20261002-v1|official-202609-v1)\/\d+_\d+\.pack$/.test(url.pathname))return new Response('Not found',{status:404,headers:CORS});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...CORS,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'}});
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:CORS});
 const range=request.headers.get('Range');if(!range)return env.ASSETS.fetch(request);
 const match=/^bytes=(\d+)-(\d+)$/.exec(range);if(!match)return new Response(null,{status:416,headers:CORS});
 const start=Number(match[1]),end=Number(match[2]);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<8||end<start||end-start>=25*1024*1024)return new Response(null,{status:416,headers:CORS});
 // Cache complete static assets locally; cache API serves byte ranges without transferring a whole pack.
 const cache=caches.default,key=new Request(url.origin+url.pathname),hit=await cache.match(new Request(key,{headers:{Range:range}}));
 if(hit&&[206,416].includes(hit.status))return new Response(request.method==='HEAD'?null:hit.body,{status:hit.status,headers:{...Object.fromEntries(hit.headers),...CORS}});
 if(!inflight.has(key.url)){const pending=(async()=>{let asset=hit||await env.ASSETS.fetch(key);if(!asset.ok)return {status:asset.status};const bytes=await asset.arrayBuffer();if(!hit)ctx.waitUntil(cache.put(key,new Response(bytes,{headers:{...CORS,'Content-Type':'application/octet-stream','Content-Length':String(bytes.byteLength)}})));return {bytes};})().finally(()=>inflight.delete(key.url));inflight.set(key.url,pending);}
 const result=await inflight.get(key.url);if(result.status)return new Response(null,{status:result.status,headers:CORS});const bytes=result.bytes;if(end>=bytes.byteLength)return new Response(null,{status:416,headers:{...CORS,'Content-Range':'bytes */'+bytes.byteLength}});
 return new Response(request.method==='HEAD'?null:bytes.slice(start,end+1),{status:206,headers:{...CORS,'Content-Type':'application/octet-stream','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${bytes.byteLength}`,'Accept-Ranges':'bytes'}});
}};
