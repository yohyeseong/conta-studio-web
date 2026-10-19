import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from './vector-worker.mjs';
test('Only documented VWorld vector routes are forwarded, with server credential isolation',async()=>{
 const env={VWORLD_API_KEY:'server-only-test-key'},req=(path,origin='https://yohyeseong.github.io')=>new Request('https://proxy.example'+path,{headers:{Origin:origin}});
 assert.equal((await worker.fetch(req('/vector/traffic/18/1/1.pbf'),env)).status,400);
 assert.equal((await worker.fetch(req('/vector/traffic/11/1746/793.pbf','https://other.example'),env)).status,403);
 assert.equal((await worker.fetch(req('/vector/traffic/11/1746/793.pbf?key=x'),env)).status,400);
 const old=globalThis.fetch;let url;
 try{
  globalThis.fetch=async u=>{url=String(u);return new Response(Uint8Array.from([26,0]),{headers:{'Content-Type':'application/octet-stream'}});};
  const pbf=await worker.fetch(req('/vector/traffic/11/1746/793.pbf'),env);assert.equal(pbf.status,200);assert.equal(pbf.headers.get('Content-Type'),'application/vnd.mapbox-vector-tile');assert(url.endsWith('/traffic/11/1746/793.pbf'));assert(!JSON.stringify([...pbf.headers]).includes(env.VWORLD_API_KEY));
  globalThis.fetch=async()=>Response.json({sources:{road:{url:'https://api.vworld.kr/'+env.VWORLD_API_KEY}}});
  const style=await worker.fetch(req('/vector/style/traffic'),env);assert.equal(style.status,200);assert(!(await style.text()).includes(env.VWORLD_API_KEY));
  globalThis.fetch=async()=>new Response('<ExceptionReport>bad key</ExceptionReport>');
  assert.equal((await worker.fetch(req('/vector/traffic/11/1746/793.pbf'),env)).status,502);
  globalThis.fetch=async()=>new Response('secret='+env.VWORLD_API_KEY,{status:520});
  const failed=await worker.fetch(req('/vector/traffic/11/1746/793.pbf'),env);assert.equal(failed.status,502);assert(!(await failed.text()).includes(env.VWORLD_API_KEY));
  let tries=0;globalThis.fetch=async()=>{tries++;return tries===1?new Response(null,{status:520}):new Response(Uint8Array.from([26,0]));};
  assert.equal((await worker.fetch(req('/vector/traffic/11/1746/793.pbf'),env)).status,200);assert.equal(tries,2,'transient errors are retried');
  tries=0;globalThis.fetch=async()=>{tries++;return new Response(null,{status:403});};
  assert.equal((await worker.fetch(req('/vector/traffic/11/1746/793.pbf'),env)).status,502);assert.equal(tries,1,'authorization failures are not retried');
  const health=await worker.fetch(req('/health'),env);assert.equal((await health.json()).mode,'data');
 }finally{globalThis.fetch=old;}
});
