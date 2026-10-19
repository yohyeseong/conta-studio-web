// Isolated browser diagnostic: the production key is sent only to VWorld.
const {chromium}=require('playwright'),fs=require('fs');
(async()=>{
 const key=process.env.VWORLD_API_KEY?.trim();if(!key)throw Error('Server key missing');
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),page=await browser.newPage(),responses=[];
 page.on('response',r=>{try{const u=new URL(r.url());if(u.hostname==='api.vworld.kr'&&u.pathname==='/req/wfs')responses.push({status:r.status(),type:r.headers()['content-type']});}catch{}});
 const results=[];
 try{
  await page.goto('https://yohyeseong.github.io/conta-studio-web/model/',{waitUntil:'domcontentloaded',timeout:45000});
  for(const [kind,layer] of [['buildings','lt_c_bldginfo'],['sidewalks','lt_c_a4subsidiarysection'],['surface-markings','lt_c_b3surfacemark'],['lane-markings','lt_l_b2surfacelinemark'],['parcels','lp_pa_cbnd_bubun']]){
   const value=await page.evaluate(({key,layer})=>new Promise(resolve=>{
    const R=6378137,c=[127.15222992002964,36.84274729276274],dx=250/111319.490793/Math.cos(c[1]*Math.PI/180),dy=250/111319.490793,project=(x,y)=>[x*Math.PI/180*R,Math.log(Math.tan(Math.PI/4+y*Math.PI/360))*R],bbox=[...project(c[0]-dx,c[1]-dy),...project(c[0]+dx,c[1]+dy)].join(','),callback='areaCheckCallback',script=document.createElement('script');
    let done=false;const finish=v=>{if(done)return;done=true;clearTimeout(timer);script.remove();delete window[callback];resolve(v);},timer=setTimeout(()=>finish({state:'timeout'}),15000);
    window[callback]=value=>finish({state:'callback',value});script.onerror=()=>finish({state:'script_error'});
    const u=new URL('https://api.vworld.kr/req/wfs');Object.entries({key,domain:location.href.split('?')[0],service:'WFS',request:'GetFeature',version:'1.1.0',typename:layer,bbox,srsname:'EPSG:3857',output:'text/javascript',format_options:'callback:'+callback,maxfeatures:'1000'}).forEach(([k,v])=>u.searchParams.set(k,v));script.src=u.href;document.head.append(script);
   }),{key,layer});
   let entry={kind,layer,state:value.state};
   if(value.value?.type==='FeatureCollection'){
    const serialized=JSON.stringify(value.value);if(serialized.includes(key))entry={...entry,state:'credential_reflection'};else{fs.mkdirSync('area-results',{recursive:true});fs.writeFileSync('area-results/browser-'+kind+'.geojson',serialized);entry={...entry,state:'received',features:value.value.features?.length||0};}
   }else if(value.value){entry.providerCode=value.value?.response?.error?.code||value.value?.error?.code||null;}
   results.push(entry);console.log(JSON.stringify(entry));
  }
 }finally{await browser.close();}
 fs.mkdirSync('area-results',{recursive:true});fs.writeFileSync('area-results/browser-report.json',JSON.stringify({test:'registered website browser JSONP with production server credential',inputFiles:false,results,responses},null,2));
})().catch(e=>{console.error('Browser test error:',e.name);process.exit(1)});
