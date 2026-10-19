import {BOOTSTRAP_HASH,BOOTSTRAP_UNTIL} from './key-bootstrap.mjs';
const ORIGIN='https://yohyeseong.github.io',headers={'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(status,body)=>Response.json(body,{status,headers});
const actor=env=>env.VWORLD_KEY_STORE?.get(env.VWORLD_KEY_STORE.idFromName('vworld-service-key'));
export async function getVworldKey(env){const store=actor(env);if(store){const r=await store.fetch('https://internal/key');if(r.ok)return (await r.text()).trim();}return env.VWORLD_API_KEY?.trim()||'';}
export class VworldKeyStore{
 constructor(state){this.storage=state.storage;}
 async fetch(request){const p=new URL(request.url).pathname;if(p==='/key'&&request.method==='GET'){const key=await this.storage.get('apiKey');return key?new Response(key):new Response(null,{status:404});}if(p==='/configure'&&request.method==='POST'){const key=await request.text();if(key.length<8||key.length>512||/\s/.test(key))return new Response(null,{status:400});await this.storage.put('apiKey',key);return new Response(null,{status:201});}return new Response(null,{status:404});}
}
export async function configureKey(request,env){
 if(request.headers.get('Origin')!==ORIGIN)return reply(403,{error:'Site not allowed'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}});
 if(request.method!=='POST')return reply(405,{error:'POST required'});
 const bearer=request.headers.get('Authorization')||'';if(Date.now()>BOOTSTRAP_UNTIL||!bearer.startsWith('Bearer ')||bearer.length>256)return reply(403,{error:'Configuration authorization expired or invalid'});
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bearer.slice(7)))),v=>v.toString(16).padStart(2,'0')).join('');if(digest!==BOOTSTRAP_HASH)return reply(403,{error:'Invalid configuration authorization'});
 const store=actor(env);if(!store)return reply(503,{error:'Private credential store not configured'});
 const text=await request.text();if(text.length>2048)return reply(400,{error:'Invalid credential size'});let key;try{key=JSON.parse(text).apiKey;}catch{return reply(400,{error:'Invalid credential format'});}if(typeof key!=='string'||key.trim().length<8||key.length>512||/\s/.test(key))return reply(400,{error:'Invalid credential format'});
 const saved=await store.fetch('https://internal/configure',{method:'POST',body:key.trim()});return saved.ok?reply(201,{configured:true}):reply(503,{error:'Credential storage failed'});
}
