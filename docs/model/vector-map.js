import {loadMap} from './korea-data.js?v=data-oct2';
export function installFilteredMap(map,L){
 const preview=L.tileLayer('https://raw.githubusercontent.com/yohyeseong/conta-studio-web/korea-data/map-preview/{z}/{x}/{y}.png',{minZoom:14,maxZoom:19,minNativeZoom:14,maxNativeZoom:14,updateWhenIdle:false,keepBuffer:3,errorTileUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='}).addTo(map);
 const contains=(a,b)=>a[0]<=b[0]&&a[1]<=b[1]&&a[2]>=b[2]&&a[3]>=b[3];
 let active=null,pending=null,timer,seq=0,moving=false;const cache=new Map();
 const state=map.contaMapState={ready:false,swaps:0,previewActive:true,bounds:null,detail:null,features:0};
 const note=L.control({position:'bottomleft'});note.onAdd=()=>{const div=L.DomUtil.create('div','map-note');div.textContent='지도 불러오는 중…';return div;};note.addTo(map);
 const message=text=>note.getContainer().textContent=text;
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(refresh,140);};
 const viewport=()=>{const b=map.getBounds();return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];};
 function dispose(view){if(!view)return;map.removeLayer(view.group);if(map.hasLayer(view.renderer))map.removeLayer(view.renderer);view.pane.remove();delete map._panes[view.name];}
 function labels(geo,target,name){
  const used=[],names=new Set(),size=map.getSize();
  const features=geo.features.filter(f=>f.properties?.['name:ko']||f.properties?.name).sort((a,b)=>Number(!!b.properties.place)-Number(!!a.properties.place));
  for(const f of features){const t=f.properties||{},text=t['name:ko']||t.name;if(!(t.place||t.highway||t.leisure||t.natural==='water'||(map.getZoom()>=17&&t.building)))continue;
   const key=(t.place?'place:':t.highway?'road:':'other:')+text;if(names.has(key))continue;
   const b=f.bbox||MilitaryPolicy.box(f.geometry);if(!b)continue;const ll=[(b[1]+b[3])/2,(b[0]+b[2])/2],p=map.latLngToContainerPoint(ll);if(p.x<8||p.y<8||p.x>size.x-8||p.y>size.y-8)continue;
   const w=Math.min(180,String(text).length*12+12);if(used.some(r=>Math.abs(r.x-p.x)<(r.w+w)/2&&Math.abs(r.y-p.y)<25))continue;used.push({x:p.x,y:p.y,w});names.add(key);
   const el=document.createElement('span');el.className='map-label';el.textContent=String(text).slice(0,35);L.marker(ll,{pane:name,interactive:false,icon:L.divIcon({className:'map-label-box',html:el,iconSize:[w,22],iconAnchor:[w/2,11]})}).addTo(target);if(used.length>=70)break;
  }
 }
 function create(entry,id){
  const name='conta-map-'+id,pane=map.createPane(name);pane.classList.add('conta-map-content');pane.style.zIndex='410';pane.style.opacity='0';pane.style.pointerEvents='none';
  const renderer=L.canvas({pane:name,padding:.4}),group=L.layerGroup().addTo(map),labelGroup=L.layerGroup().addTo(group);const view={...entry,name,pane,renderer,group,labelGroup};
  try{L.geoJSON(entry.geo,{pane:name,renderer,filter:f=>{const t=f.properties||{};return f.geometry?.type!=='Point'&&(t.highway||t['area:highway']||t.railway||t.building||t['building:part']||t.landuse||t.leisure||t.waterway||['water','wood','scrub','grassland'].includes(t.natural));},style:f=>{const t=f.properties||{};return t.railway?{color:'#80858b',weight:2,dashArray:'5 4',fill:false}:t['area:highway']?{color:'#d3bd9e',weight:.5,fillColor:'#e8dbc7',fillOpacity:.7}:t.highway?{color:'#e6b77f',weight:['primary','secondary','trunk','motorway'].includes(t.highway)?5:2,fillColor:'#d0d8e2',fillOpacity:.6}:t.waterway||t.natural==='water'?{color:'#8dc1dc',weight:1,fillOpacity:.8}:t.building||t['building:part']?{color:'#a7abb1',weight:1,fillColor:'#d5d6d9',fillOpacity:.8}:{color:'#b2cba8',weight:.5,fillColor:'#d5e5cc',fillOpacity:.8};},onEachFeature:(f,l)=>{const t=f.properties||{},text=t['name:ko']||t.name;if(text){const el=document.createElement('span');el.textContent=text;l.bindTooltip(el,{sticky:true});}}}).addTo(group);labels(entry.geo,labelGroup,name);return view;}catch(e){dispose(view);throw e;}
 }
 async function refresh(){
  const id=++seq,detail=16,bounds=viewport();if(moving)return;
  if(map.getZoom()<14){message('확대하거나 장소를 검색해 주세요.');return;}
  if((bounds[2]-bounds[0])*(bounds[3]-bounds[1])*1e10>30e6){message('지도를 더 확대해 주세요.');return;}
  if(active&&active.detail===detail&&contains(active.bounds,bounds)){active.labelGroup.clearLayers();labels(active.geo,active.labelGroup,active.name);message('전국 한국 OSM · 2026-10-02 · 공식 도로 보강');return;}
  message(active?'추가 지도 불러오는 중…':'지도 불러오는 중…');let staged;
  try{
   let entry=[...cache.values()].find(e=>e.detail===detail&&contains(e.bounds,bounds));
   if(!entry){let request=pending;
    if(!request||request.detail!==detail||!contains(request.bounds,bounds)){
     const dx=(bounds[2]-bounds[0])*.35,dy=(bounds[3]-bounds[1])*.35,b=[Math.max(-180,bounds[0]-dx),Math.max(-85,bounds[1]-dy),Math.min(180,bounds[2]+dx),Math.min(85,bounds[3]+dy)];
     request={bounds:b,detail};request.promise=loadMap(b,detail).then(geo=>{const value={bounds:b,detail,geo};if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(detail+':'+b.join(','),value);return value;});pending=request;request.promise.then(()=>{if(pending===request)pending=null;},()=>{if(pending===request)pending=null;});
    }
    entry=await request.promise;
   }
   if(id!==seq||moving)return;
   staged=create(entry,id);
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   if(id!==seq||moving||!contains(entry.bounds,viewport())||detail!==16){dispose(staged);return;}
   const previous=active;staged.pane.style.opacity='1';staged.pane.style.pointerEvents='auto';active=staged;dispose(previous);
   if(map.hasLayer(preview))map.removeLayer(preview);
   Object.assign(state,{ready:true,swaps:state.swaps+1,previewActive:false,bounds:entry.bounds,detail,features:entry.geo.features.length,buildings:entry.geo.features.filter(f=>f.properties?.building||f.properties?.['building:part']).length,minorRoads:entry.geo.features.filter(f=>['residential','service','footway','path','steps','pedestrian','living_street','cycleway','unclassified'].includes(f.properties?.highway)).length});message('전국 한국 OSM · 2026-10-02');
  }catch(e){if(staged&&staged!==active)dispose(staged);if(id===seq&&!moving)message(active?'지도 수신 지연 · 기존 지도 유지 중':'지도를 받지 못했습니다. 다시 이동하거나 확대해 주세요.');}
 }
 map.on('movestart',()=>{moving=true;seq++;clearTimeout(timer);});map.on('moveend',()=>{moving=false;schedule();});refresh();
 L.control.attribution({prefix:false}).addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>').addTo(map);
}
