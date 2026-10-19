// Keep the selection map in Web Mercator; reproject the official EPSG:5179 tiles.
const DEFINITION='+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs';
const STORAGE='conta-ngii-map-key';
const OSM_CREDIT='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const names={normal:'일반지도',white:'백지도',satellite:'위성사진',air:'항공사진'};
let projectionReady;
function projection(){
 return projectionReady??=new Promise((resolve,reject)=>{
  if(window.proj4)return resolve(window.proj4);
  const s=document.createElement('script');s.src=new URL('./vendor/proj4.js',import.meta.url).href;
  s.onload=()=>window.proj4?resolve(window.proj4):reject(Error('projection'));s.onerror=()=>{projectionReady=null;reject(Error('projection'));};document.head.append(s);
 });
}
function triangle(ctx,img,src,dst){
 const [a,b,c]=src,[p,q,r]=dst,det=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
 if(Math.abs(det)<1e-10)return;
 const ax=((q[0]-p[0])*(c[1]-a[1])-(r[0]-p[0])*(b[1]-a[1]))/det;
 const bx=((r[0]-p[0])*(b[0]-a[0])-(q[0]-p[0])*(c[0]-a[0]))/det;
 const ay=((q[1]-p[1])*(c[1]-a[1])-(r[1]-p[1])*(b[1]-a[1]))/det;
 const by=((r[1]-p[1])*(b[0]-a[0])-(q[1]-p[1])*(c[0]-a[0]))/det;
 // Overlap clips slightly so canvas antialiasing does not leave mesh seams.
 const cx=(p[0]+q[0]+r[0])/3,cy=(p[1]+q[1]+r[1])/3;
 const clip=[p,q,r].map(v=>{const dx=v[0]-cx,dy=v[1]-cy,n=Math.hypot(dx,dy)||1;return [v[0]+dx/n*.8,v[1]+dy/n*.8];});
 ctx.save();ctx.beginPath();ctx.moveTo(...clip[0]);ctx.lineTo(...clip[1]);ctx.lineTo(...clip[2]);ctx.closePath();ctx.clip();
 ctx.transform(ax,ay,bx,by,p[0]-ax*a[0]-bx*a[1],p[1]-ay*a[0]-by*a[1]);ctx.drawImage(img,0,0,256,256);ctx.restore();
}
export async function installNgiiMap(map,L){
 const $=id=>document.getElementById(id),select=$('map-source'),note=$('map-source-status');
 if(!select)return;
 let key='',layer=null,revision=0,airYear=2025,airYearRequest;
 const layers={normal:'korean_map',white:'white_map',satellite:'satellite_map'};
 const images=new Map();
 async function airPhotoYear(){
  return airYearRequest??=fetch('https://map.ngii.go.kr/openapi/AirPhotoYear.do',{credentials:'omit',signal:AbortSignal.timeout(12000)})
   .then(r=>{if(!r.ok)throw Error('year');return r.json();}).then(d=>{if(d.SUCCESS&&/^20\d{2}$/.test(String(d.RESULT)))airYear=Number(d.RESULT);return airYear;})
   .catch(()=>airYear);
 }
 function image(url){
  if(images.has(url))return images.get(url);
  const promise=new Promise((resolve,reject)=>{const img=new Image(),timer=setTimeout(()=>{img.src='';reject(Error('timeout'));},18000);img.referrerPolicy='strict-origin-when-cross-origin';
   img.onload=()=>{clearTimeout(timer);img.naturalWidth>=256?resolve(img):reject(Error('image'));};img.onerror=()=>{clearTimeout(timer);reject(Error('tile'));};img.src=url;
  });images.set(url,promise);promise.catch(()=>images.delete(url));if(images.size>96)images.delete(images.keys().next().value);return promise;
 }
 function url(kind,level,row,col){
  const air=kind==='air',u=new URL(air?'https://map.ngii.go.kr/airmapprime/map/wmts':'https://map.ngii.go.kr/openapi/Gettile.do');
  u.search=new URLSearchParams({SERVICE:'WMTS',REQUEST:'GetTile',VERSION:'1.0.0',LAYER:air?'mapprime:air_'+airYear:layers[kind],STYLE:air?'':'korean',FORMAT:air?'image/jpeg':'image/png',TILEMATRIXSET:air?'NGIS_AIR':'EPSG:5179',TILEMATRIX:air?String(level):'L'+String(level).padStart(2,'0'),TILEROW:String(row),TILECOL:String(col),...(air?{}:{apikey:key})});return u.href;
 }
 function renderLayer(kind,proj,id){
  const transform=proj('EPSG:4326',DEFINITION),crs=L.CRS.EPSG3857;
  const Grid=L.GridLayer.extend({createTile(coords,done){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
   const z=coords.z,origin=L.point(coords.x*256,coords.y*256),geo=(x,y)=>crs.pointToLatLng(origin.add([x,y]),z);
   const center=geo(128,128),mpp=156543.033928*Math.cos(center.lat*Math.PI/180)/2**z;
   const level=Math.max(5,Math.min(18,Math.round(Math.log2(66846.72/mpp)))),res=66846.72/2**level,span=res*256;
   const points=[[0,0],[128,0],[256,0],[256,128],[256,256],[128,256],[0,256],[0,128]].map(([x,y])=>{const g=geo(x,y);return transform.forward([g.lng,g.lat]);});
   const left=Math.floor((Math.min(...points.map(p=>p[0]))+200000)/span),right=Math.floor((Math.max(...points.map(p=>p[0]))+200000)/span);
   const top=Math.floor((4000000-Math.max(...points.map(p=>p[1])))/span),bottom=Math.floor((4000000-Math.min(...points.map(p=>p[1])))/span);
   const jobs=[];let received=0;
   for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++)jobs.push(image(url(kind,level,row,col)).then(img=>{
    if(id!==revision)return;
    received++;const ctx=canvas.getContext('2d'),toScreen=(x,y)=>{const g=transform.inverse([-200000+col*span+x*res,4000000-row*span-y*res]),p=crs.latLngToPoint(L.latLng(g[1],g[0]),z).subtract(origin);return [p.x,p.y];};
    for(let y=0;y<256;y+=64)for(let x=0;x<256;x+=64){const a=[x,y],b=[x+64,y],c=[x+64,y+64],d=[x,y+64],p=toScreen(...a),q=toScreen(...b),r=toScreen(...c),s=toScreen(...d);triangle(ctx,img,[a,b,c],[p,q,r]);triangle(ctx,img,[a,c,d],[p,r,s]);}
   }));
   Promise.allSettled(jobs).then(results=>{
    if(id!==revision)return done(null,canvas);
    const failed=results.some(r=>r.status==='rejected');
    note.textContent=failed?'지도 일부를 받지 못했습니다. 인증키·등록 주소를 확인하거나 다시 연결하세요.':`국토정보플랫폼 · ${names[kind]}${kind==='air'?' ('+airYear+'년)':''} · 배경지도`;
    if(received){map.attributionControl?.removeAttribution(OSM_CREDIT);map.getContainer().classList.add('ngii-map-active');map.contaMapState.ready=true;map.fire('conta-map-ready');}
    done(null,canvas);
   });return canvas;
  }});
  return new Grid({pane:'conta-ngii',tileSize:256,minZoom:10,maxZoom:19,updateWhenIdle:true,keepBuffer:1,bounds:[[32,123],[40,133]],attribution:'© <a href="https://map.ngii.go.kr/" target="_blank" rel="noopener">국토지리정보원</a>'});
 }
 map.createPane('conta-ngii').style.zIndex='450';map.getPane('conta-ngii').style.pointerEvents='none';
 async function apply(){
  map.getContainer().classList.remove('ngii-map-active');map.attributionControl?.addAttribution(OSM_CREDIT);
  const id=++revision;if(layer){layer.remove();layer=null;}
  const kind=select.value;
  if(kind==='existing'){note.textContent='기존 지도 · 영역 선택과 콘타 생성에 사용합니다.';return;}
  if(!key&&kind!=='air'){select.value='existing';note.textContent='지도 설정에서 발급받은 인증키를 연결해 주세요.';return;}
  note.textContent='국토정보플랫폼 지도 연결 중…';
  try{const proj=await projection();if(kind==='air')await airPhotoYear();if(id!==revision)return;layer=renderLayer(kind,proj,id).addTo(map);}
  catch{if(id!==revision)return;select.value='existing';note.textContent='지도에 연결하지 못했습니다. 기존 지도를 유지합니다.';}
 }
 async function connect(value){
  if(!value||value.length>512||/\s/.test(value)){note.textContent='올바른 인증키를 입력해 주세요.';return;}
  key=value;images.clear();$('ngii-api-key').value='';
  try{if($('ngii-remember').checked)localStorage.setItem(STORAGE,key);else localStorage.removeItem(STORAGE);}catch{}
  select.value=select.value==='existing'?'normal':select.value;await apply();
 }
 select.addEventListener('change',apply);
 $('ngii-connect').onclick=()=>connect($('ngii-api-key').value.trim());
 $('ngii-config-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>16384)throw Error('size');const config=JSON.parse(await file.text());if(typeof config.apiKey!=='string')throw Error('key');await connect(config.apiKey.trim());}catch{note.textContent='인증키 설정 JSON 파일을 확인해 주세요.';}finally{e.target.value='';}};
 $('ngii-disconnect').onclick=()=>{key='';images.clear();try{localStorage.removeItem(STORAGE);}catch{}$('ngii-remember').checked=false;select.value='existing';apply();};
 map.on('moveend',()=>{if(select.value!=='existing'&&(map.getCenter().lng<123||map.getCenter().lng>133||map.getCenter().lat<32||map.getCenter().lat>40))note.textContent='국외 지역은 기존 지도로 표시합니다.';});
 try{key=localStorage.getItem(STORAGE)||'';if(key){$('ngii-remember').checked=true;select.value='normal';apply();}}catch{}
}
