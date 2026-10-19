import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{NgiiKeyStore} from './worker.mjs';
test('Visitor routes protect the credential and only forward validated map requests',async()=>{
 const values=new Map(),storage={get:async k=>values.get(k),put:async(k,v)=>values.set(k,v),transaction:async fn=>fn(storage)};
 const actor=new NgiiKeyStore({storage}),env={KEY_STORE:{idFromName:()=>1,get:()=>({fetch:(u,o)=>actor.fetch(new Request(u,o))})},TILE_LIMITER:{limit:async()=>({success:true})}};
 const request=(p,opts={})=>new Request('https://map.example'+p,{...opts,headers:{Origin:'https://yohyeseong.github.io',...opts.headers}});
 assert.equal((await worker.fetch(request('/tiles/normal/13/980/552.png'),env)).status,503);
 assert.equal((await worker.fetch(request('/configure',{method:'POST',headers:{Authorization:'Bearer wrong-token'},body:'{}'}),env)).status,403);
 const secret='test-server-map-credential';
 assert.equal((await actor.fetch(new Request('https://internal/configure',{method:'POST',body:secret}))).status,201);
 assert.equal((await actor.fetch(new Request('https://internal/configure',{method:'POST',body:'replacement-key'}))).status,409);
 assert.equal((await actor.fetch(new Request('https://internal/key'))).status,200);
 assert.equal((await worker.fetch(request('/key'),env)).status,404);
 assert.equal((await worker.fetch(request('/tiles/normal/13/980/552.png?apikey=x'),env)).status,404);
 assert.equal((await worker.fetch(request('/tiles/normal/13/980/552.png',{headers:{Origin:'https://other.example'}}),env)).status,403);
 assert.equal((await worker.fetch(request('/tiles/normal/18/0/0.png'),env)).status,400);
 const oldFetch=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(u,options)=>{calls.push({url:new URL(u),options});const bytes=new Uint8Array(256);bytes.set([137,80,78,71,13,10,26,10]);return new Response(bytes,{headers:{'Content-Type':'image/png'}});};
  const response=await worker.fetch(request('/tiles/normal/13/980/552.png'),env);
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');
  assert.equal(calls[0].url.origin,'https://map.ngii.go.kr');assert.equal(calls[0].url.searchParams.get('apikey'),secret);
  assert.equal(calls[0].options.headers.Referer,'https://yohyeseong.github.io/conta-studio-web/model/');
  assert(!JSON.stringify([...response.headers]).includes(secret));assert(!(await response.text()).includes(secret));
  globalThis.fetch=async()=>new Response('apikey='+secret,{status:403});
  const failure=await worker.fetch(request('/tiles/white/13/980/552.png'),env);assert.equal(failure.status,502);assert(!(await failure.text()).includes(secret));
  const health=await worker.fetch(request('/health'),env);assert.deepEqual(await health.json(),{service:'ngii-basemap',ready:true});
  env.TILE_LIMITER.limit=async()=>({success:false});assert.equal((await worker.fetch(request('/tiles/normal/13/980/552.png'),env)).status,429);
 }finally{globalThis.fetch=oldFetch;}
});
