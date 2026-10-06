/* Geometry runs off the UI thread. Source slopes are retained. */
importScripts('building-use.js?v=site3','vendor/earcut.min.js','vendor/polygon-clipping.js','military-policy.js?v=exclude1','terrain-surface.js?v=official1');
let activeRequestId;const report=value=>postMessage({id:activeRequestId,...value});
const rounded=(value,scale)=>Array.isArray(value)?value.map(v=>rounded(v,scale)):Math.round(value*scale)/scale;
const pc=Object.fromEntries(['union','difference','intersection'].map(name=>[name,(...args)=>{
 try{return polygonClipping[name](...args);}catch(original){for(const scale of [1000,100]){try{return polygonClipping[name](...args.map(a=>rounded(a,scale)));}catch{}}throw original;}
}]));
function unionAll(polys){let level=[];for(let i=0;i<polys.length;i+=80){const batch=polys.slice(i,i+80).filter(p=>p.length);if(batch.length)level.push(pc.union(...batch));}while(level.length>1){const next=[];for(let i=0;i<level.length;i+=2)next.push(i+1<level.length?pc.union(level[i],level[i+1]):level[i]);level=next;}return level[0]||[];}
function bufferLine(line,width,extent){const pieces=[],r=width/2;for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i];if(extent&&(Math.max(a[0],b[0])+r<extent[0]||Math.min(a[0],b[0])-r>extent[2]||Math.max(a[1],b[1])+r<extent[1]||Math.min(a[1],b[1])-r>extent[3]))continue;const d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!d)continue;const x=-(b[1]-a[1])*r/d,y=(b[0]-a[0])*r/d;pieces.push([[[a[0]+x,a[1]+y],[b[0]+x,b[1]+y],[b[0]-x,b[1]-y],[a[0]-x,a[1]-y],[a[0]+x,a[1]+y]]]);}for(let index=0;index<line.length;index++){const p=line[index];if(extent&&(p[0]+r<extent[0]||p[0]-r>extent[2]||p[1]+r<extent[1]||p[1]-r>extent[3]))continue;if(index>0&&index<line.length-1){const a=line[index-1],b=line[index+1],ux=p[0]-a[0],uy=p[1]-a[1],vx=b[0]-p[0],vy=b[1]-p[1],product=Math.hypot(ux,uy)*Math.hypot(vx,vy);if(product>0&&ux*vx+uy*vy>0&&Math.abs(ux*vy-uy*vx)/product<1e-10)continue;}const ring=[];for(let j=0;j<=12;j++)ring.push([p[0]+r*Math.cos(j*Math.PI/6),p[1]+r*Math.sin(j*Math.PI/6)]);pieces.push([ring]);}return unionAll(pieces);}
class MeshPositions{
 constructor(){this.blocks=[];this.used=0;this.length=0;this.block=null;}
 push(...values){for(const value of values){if(!this.block||this.used===this.block.length){this.block=new Float32Array(65536);this.blocks.push(this.block);this.used=0;}this.block[this.used++]=value;this.length++;}}
 finish(){const out=new Float32Array(this.length);let offset=0;for(let i=0;i<this.blocks.length;i++){const b=i===this.blocks.length-1?this.blocks[i].subarray(0,this.used):this.blocks[i];out.set(b,offset);offset+=b.length;}this.blocks=[];this.block=null;return out;}
}
function makeModel(d){const {w,h,n,heights,center,floor,roadWidth,interval}=d;const dx=w/n,dy=h/n,min=Math.min(...heights),z0=min,baseDepth=Math.max(5,d.lowerStep?interval+1:5),groups={},counts={};
function group(k){return groups[k]||(groups[k]={positions:k==='등고선'?[]:new MeshPositions(),lines:false});}function tri(k,a,b,c){group(k).positions.push(...a,...b,...c);}function point(x,y,z){return [x,y,z-z0];}
function rawZ(x,y){let u=Math.max(0,Math.min(n-1e-9,(x+w/2)/dx)),v=Math.max(0,Math.min(n-1e-9,(y+h/2)/dy));const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,at=(ii,jj)=>heights[jj*(n+1)+ii];return b<=a?at(i,j)*(1-a)+at(i+1,j)*(a-b)+at(i+1,j+1)*b:at(i,j)*(1-b)+at(i+1,j+1)*a+at(i,j+1)*(b-a);}
const stepped=d.terrainMode==='stepped';if(!Number.isFinite(interval)||interval<.5||interval>100)throw Error('한 단 높이는 0.5–100m로 입력하세요.');
const surface=terrainSurface(w,h,n,rawZ,z0),heightCache=new Map();const z=(x,y)=>{const key=x+","+y;if(heightCache.has(key))return heightCache.get(key);const raw=surface.height(x,y),value=stepped?Math.floor((raw-z0+1e-8)/interval)*interval+z0:raw;heightCache.set(key,value);return value;};
const xy=c=>[(c[0]-center[0])*111319.490793*Math.cos(center[1]*Math.PI/180),(c[1]-center[1])*111319.490793];
const rect=[[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2],[-w/2,-h/2]]];
const covers={'도로':[],'녹지':[],'하천':[],'철도':[],'바다':[]},buildings=[];let skipped=0,estimated=0;
const geo=(d.osm.preparedGeo?MilitaryPolicy.assertPrepared(d.osm,d.bounds):MilitaryPolicy.assertSelection(d.osm,d.bounds||[-180,-90,180,90])).geo;
let processed=0;for(const f of [...geo.features].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){if(++processed%1000===0)report({progress:60+Math.round(processed/geo.features.length*4),message:'주변 요소 처리 중 · '+processed.toLocaleString()+' / '+geo.features.length.toLocaleString()});const t=f.properties||{},g=f.geometry;if(!g)continue;const cat=(t.building&&t.building!=='no')||(t['building:part']&&t['building:part']!=='no')?'건물':t.highway||t['area:highway']?'도로':t.waterway||t.natural==='water'?'하천':t.railway?'철도':['grass','forest','meadow','orchard'].includes(t.landuse)||['wood','scrub','grassland'].includes(t.natural)||['park','garden','pitch'].includes(t.leisure)?'녹지':null;if(!cat)continue;
try{let polys=[];if(g.type==='Polygon')polys=[g.coordinates.map(r=>r.map(xy))];else if(g.type==='MultiPolygon')polys=g.coordinates.map(p=>p.map(r=>r.map(xy)));else if(['LineString','MultiLineString'].includes(g.type)&&cat!=='건물'&&cat!=='녹지'){let width=parseFloat(t.width);if(String(t.width).includes('ft'))width*=.3048;if(!(width>0&&width<200)){estimated++;width=cat==='철도'?3:cat==='하천'?4:parseFloat(t.lanes)>0?parseFloat(t.lanes)*3:({motorway:14,trunk:12,primary:10,secondary:9,tertiary:7,residential:6,living_street:4,service:3,footway:1.5,path:1.5,steps:1.5,cycleway:2,pedestrian:4,track:3}[t.highway]||roadWidth);}for(const line of g.type==='LineString'?[g.coordinates]:g.coordinates)polys.push(...bufferLine(line.map(xy),width,[-w/2,-h/2,w/2,h/2]));}if(!polys.length)continue;const clipped=pc.intersection(polys,rect);if(!clipped.length)continue;
if(cat==='건물'){let height=parseFloat(t.height);if(String(t.height).includes('ft'))height*=.3048;if(!Number.isFinite(height)||height<=0){height=(parseFloat(t['building:levels'])||1)*floor;estimated++;}for(const poly of clipped)buildings.push({poly,height,usage:ContaBuildingUse.classify(t)});}else covers[cat].push(clipped);counts[cat]=(counts[cat]||0)+clipped.length;
}catch{skipped++;}}
if(d.coast) covers['바다']=pc.difference(rect,d.coast.map(r=>[r.map(xy)]));
report({progress:65,message:'도로 연결과 레이어 정리 중'});
for(const k in covers)covers[k]=unionAll(covers[k]);
if(covers['녹지'].length){const builtArea=unionAll(buildings.map(b=>[b.poly]));covers['녹지']=pc.difference(covers['녹지'],covers['도로'],builtArea);}
if(stepped){let occupied=[];for(const name of ['도로','하천','녹지','바다']){covers[name]=terrainPolygons(pc.difference(covers[name],occupied));occupied=pc.union(occupied,covers[name]);}}

const mask=unionAll(Object.entries(covers).filter(([name])=>name!=='철도').map(([,polys])=>polys)),ground=d.cutGround!==false&&mask.length?pc.difference(rect,mask):[rect];
const cad={terrain:{w,h,count:surface.count,points:surface.points,polygons:terrainPolygons(ground),base:-baseDepth,lowerStep:!!d.lowerStep,interval},parapets:[],covers:Object.fromEntries(Object.entries(covers).map(([name,polys])=>[name,terrainPolygons(polys)])),buildings:[]};
if(stepped)cad.terrain.bands=makeSteps();
function coverOffset(name){return (name==='철도'?.05:.025)-(d.lowerStep&&['도로','하천','바다'].includes(name)?interval:0);}
function face(k,p,zf){const flat=earcut.flatten(p);const ids=earcut(flat.vertices,flat.holes,2);for(let q=0;q<ids.length;q+=3)tri(k,...ids.slice(q,q+3).map(i=>{const x=flat.vertices[i*2],y=flat.vertices[i*2+1];return point(x,y,zf(x,y));}));}
// Triangulate validated layer boundaries once; clip convex triangles with linear arithmetic.
function makeSteps(){
 const buckets=new Map(),sample=(x,y)=>[x,y,surface.height(x,y)-z0];
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const x=-w/2+i*dx,y=-h/2+j*dy,a=sample(x,y),b=sample(x+dx,y),c=sample(x+dx,y+dy),e=sample(x,y+dy);
  for(const t of [[a,b,c],[a,c,e]]){
   const lo=Math.max(0,Math.floor(Math.min(...t.map(p=>p[2]))/interval)),hi=Math.max(lo,Math.floor(Math.max(...t.map(p=>p[2]))/interval));
   if(!Number.isFinite(lo)||!Number.isFinite(hi))throw Error('지형 높이 자료가 올바르지 않습니다.');
   for(let k=lo;k<=hi;k++){
    let cut=clipEdge(clipEdge(t,2,k*interval,true),2,(k+1)*interval,false);
    if(cut.length<3)continue;const ring=cut.map(p=>p.slice(0,2));ring.push(ring[0]);
    if(!terrainPolygons([[ring]]).length)continue;
    if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push([ring]);
   }
  }
 }
 const bands=[];
 for(const [k,pieces] of [...buckets].sort((a,b)=>a[0]-b[0])){
  const footprint=terrainPolygons(unionAll(pieces)),level=k*interval,polygons=terrainPolygons(pc.intersection(footprint,ground));
  const layerCovers=Object.fromEntries(Object.entries(covers).map(([name,polys])=>[name,terrainPolygons(pc.intersection(footprint,polys))]));
  bands.push({level,polygons,covers:layerCovers});
  for(const poly of polygons){face('대지',poly,()=>z0+level);face('대지',poly,()=>z0-baseDepth);
   for(const ring of poly)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],at=point(...a,z0+level),bt=point(...b,z0+level),ab=point(...a,z0-baseDepth),bb=point(...b,z0-baseDepth);tri('대지',at,ab,bb);tri('대지',at,bb,bt);}
  }
  for(const [name,polys] of Object.entries(layerCovers))for(const poly of polys){
   face(name,poly,()=>z0+level+coverOffset(name));if(name==='철도')continue;face(name,poly,()=>z0-baseDepth);
   for(const ring of poly)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],at=point(...a,z0+level+coverOffset(name)),bt=point(...b,z0+level+coverOffset(name)),ab=point(...a,z0-baseDepth),bb=point(...b,z0-baseDepth);tri(name,at,ab,bb);tri(name,at,bb,bt);}
  }
  const lines=group('등고선');lines.lines=true;
  for(const poly of footprint)for(const ring of poly)for(let i=1;i<ring.length;i++)lines.positions.push(...point(...ring[i-1],z0+level+.04),...point(...ring[i],z0+level+.04));
 }
 return bands;
}
function clipEdge(poly,axis,limit,greater){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],inside=p=>greater?p[axis]>=limit:p[axis]<=limit,aa=inside(a),bb=inside(b);if(aa)out.push(a);if(aa!==bb){const t=(limit-a[axis])/(b[axis]-a[axis]);const hit=a.map((v,index)=>v+t*(b[index]-v));hit[axis]=limit;out.push(hit);}}return out;}
if(!stepped)for(const [k,polys] of [['대지',ground],...Object.entries(covers)])for(const p of terrainPolygons(polys)){const flat=earcut.flatten(p),ids=earcut(flat.vertices,flat.holes,2);for(let q=0;q<ids.length;q+=3){const t=ids.slice(q,q+3).map(v=>[flat.vertices[v*2],flat.vertices[v*2+1]]),i0=Math.max(0,Math.floor((Math.min(...t.map(v=>v[0]))+w/2)/dx)),i1=Math.min(n-1,Math.floor((Math.max(...t.map(v=>v[0]))+w/2)/dx)),j0=Math.max(0,Math.floor((Math.min(...t.map(v=>v[1]))+h/2)/dy)),j1=Math.min(n-1,Math.floor((Math.max(...t.map(v=>v[1]))+h/2)/dy));for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=-w/2+i*dx,y=-h/2+j*dy;let poly=t;for(const [axis,limit,greater] of [[0,x,true],[0,x+dx,false],[1,y,true],[1,y+dy,false]]){poly=clipEdge(poly,axis,limit,greater);if(poly.length<3)break;}if(poly.length<3)continue;const zz=k==='대지'?0:coverOffset(k);for(let v=1;v<poly.length-1;v++){const a=poly[0],b=poly[v],c=poly[v+1];if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-10)continue;tri(k,...[a,b,c].map(p=>point(...p,z(...p)+zz)));}}}}
if(!stepped)for(let j=0;j<n;j++){for(let i=0;i<n;i++){const x=-w/2+i*dx,y=-h/2+j*dy,a=[x,y],b=[x+dx,y],c=[x+dx,y+dy],e=[x,y+dy];for(const t of [[a,b,c,a],[a,c,e,a]]){const tz=t.slice(0,3).map(p=>z(...p));for(let level=Math.ceil(Math.min(...tz)/interval)*interval;level<=Math.max(...tz);level+=interval){if(tz.every(v=>Math.abs(v-level)<1e-8))continue;const found=new Map();const add=p=>found.set(p.map(v=>Math.round(v*10000)).join(','),p);for(let v=0;v<3;v++){let u=(v+1)%3;if(Math.abs(tz[v]-level)<1e-8)add(point(t[v][0],t[v][1],level+.04));if((tz[v]-level)*(tz[u]-level)<0){const f=(level-tz[v])/(tz[u]-tz[v]);add(point(t[v][0]+f*(t[u][0]-t[v][0]),t[v][1]+f*(t[u][1]-t[v][1]),level+.04));}}const hits=[...found.values()];if(hits.length===2){const g=group('등고선');g.lines=true;g.positions.push(...hits[0],...hits[1]);}}}}if(j%10===0)report({progress:68+Math.round(j/n*20),message:'지형 면 연결 중'});}
// One continuous perimeter down to a common base, independent of point-in-area tests.
const ring=[];for(let i=0;i<n;i++)ring.push([-w/2+i*dx,-h/2]);for(let j=0;j<n;j++)ring.push([w/2,-h/2+j*dy]);for(let i=n;i>0;i--)ring.push([-w/2+i*dx,h/2]);for(let j=n;j>0;j--)ring.push([-w/2,-h/2+j*dy]);
if(!stepped)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],aa=point(...a,min-baseDepth),bb=point(...b,min-baseDepth),at=point(...a,z(...a)),bt=point(...b,z(...b));tri('대지',at,aa,bb);tri('대지',at,bb,bt);}if(!stepped)face('대지',rect,()=>min-baseDepth);
for(const {poly,height,usage} of buildings){const zs=poly[0].map(p=>z(...p)),base=Math.max(...zs),bottom=Math.min(...zs)-.02,roof=base+height;cad.buildings.push({poly,bottom:bottom-z0,roof:roof-z0,usage});face('건물',poly,()=>roof);face('건물',poly,()=>bottom);for(const r of poly)for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i];tri('건물',point(...a,bottom),point(...b,bottom),point(...b,roof));tri('건물',point(...a,bottom),point(...b,roof),point(...a,roof));}}
if(d.parapet){
 const height=Number(d.parapetHeight);if(!Number.isFinite(height)||height<.1||height>3)throw Error('파라펫 높이는 0.1–3m로 입력하세요.');
 for(const building of cad.buildings){
  const edges=unionAll(building.poly.map(r=>bufferLine(r,.4,[-w/2,-h/2,w/2,h/2]))),walls=terrainPolygons(pc.intersection([building.poly],edges));
  for(const poly of walls){const bottom=building.roof,roof=bottom+height;cad.parapets.push({poly,bottom,roof});face('파라펫',poly,()=>z0+roof);face('파라펫',poly,()=>z0+bottom);
   for(const ring of poly)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];tri('파라펫',point(...a,z0+bottom),point(...b,z0+bottom),point(...b,z0+roof));tri('파라펫',point(...a,z0+bottom),point(...b,z0+roof),point(...a,z0+roof));}
  }
 }counts['파라펫']=cad.parapets.length;
}
const contours=group('등고선');const unique=new Map();for(let i=0;i<contours.positions.length;i+=6){const a=contours.positions.slice(i,i+3),b=contours.positions.slice(i+3,i+6),ka=a.map(v=>Math.round(v*10000)).join(','),kb=b.map(v=>Math.round(v*10000)).join(',');if(ka!==kb)unique.set(ka<kb?ka+'|'+kb:kb+'|'+ka,[...a,...b]);}contours.positions=[...unique.values()].flat();
counts['대지']=stepped?cad.terrain.bands.length:1;counts['등고선']=Math.floor(group('등고선').positions.length/6);return {groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{...v,positions:v.positions instanceof MeshPositions?v.positions.finish():new Float32Array(v.positions)}])),counts,estimated,skipped,z0,cad};}
onmessage=e=>{activeRequestId=e.data.id;try{if(!e.data.osm.preparedGeo&&typeof osmtogeojson==='undefined')importScripts('vendor/osmtogeojson.js');const result=makeModel(e.data);postMessage({id:e.data.id,result},Object.values(result.groups).map(g=>g.positions.buffer));}catch(error){postMessage({id:e.data.id,error:String(error.message||error)});}};
