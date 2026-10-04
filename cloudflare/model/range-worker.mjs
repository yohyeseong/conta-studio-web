const CORS={'Access-Control-Allow-Origin':'https://yohyeseong.github.io','Access-Control-Expose-Headers':'Content-Range, Content-Length','Access-Control-Allow-Headers':'Range','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'};
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname==='/health')return Response.json({ready:true,version:'model-20261002-v1'},{headers:CORS});
 if(!/^\/(model-20261002-v1|official-202609-v1)\/\d+_\d+\.pack$/.test(url.pathname))return new Response('Not found',{status:404,headers:CORS});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...CORS,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'}});
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:CORS});
 const range=request.headers.get('Range');if(!range)return env.ASSETS.fetch(request);
 const match=/^bytes=(\d+)-(\d+)$/.exec(range);if(!match)return new Response(null,{status:416,headers:CORS});
 const start=Number(match[1]),end=Number(match[2]);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<8||end<start||end-start>=25*1024*1024)return new Response(null,{status:416,headers:CORS});
 // Cache complete static assets locally; cache API serves byte ranges without transferring a whole pack.
 const cache=caches.default,key=new Request(url.origin+url.pathname);let asset=await cache.match(key);
 if(!asset){asset=await env.ASSETS.fetch(key);if(!asset.ok)return new Response(null,{status:asset.status,headers:CORS});const bytes=await asset.arrayBuffer();asset=new Response(bytes,{headers:{...CORS,'Content-Type':'application/octet-stream','Content-Length':String(bytes.byteLength)}});ctx.waitUntil(cache.put(key,asset.clone()));}
 const bytes=await asset.arrayBuffer();if(end>=bytes.byteLength)return new Response(null,{status:416,headers:{...CORS,'Content-Range':'bytes */'+bytes.byteLength}});
 return new Response(request.method==='HEAD'?null:bytes.slice(start,end+1),{status:206,headers:{...CORS,'Content-Type':'application/octet-stream','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${bytes.byteLength}`,'Accept-Ranges':'bytes'}});
}};
