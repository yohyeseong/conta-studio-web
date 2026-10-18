/* Geometry runs off the UI thread. Source slopes are retained. */
importScripts('source-terrain.js?v=source3','detail-mask.js?v=riverbank1','river-banks.js?v=source3','river-elevation.js?v=source3','crosswalk-stripes.js?v=roadlines1','surface-volume.js?v=curb1','ngii-roads.js?v=riverbank1','building-use.js?v=site3','vendor/earcut.min.js','vendor/polygon-clipping.js','military-policy.js?v=riverbank1','terrain-surface.js?v=official1');
let activeRequestId;const report=value=>postMessage({id:activeRequestId,...value});
const rounded=(value,scale)=>Array.isArray(value)?value.map(v=>rounded(v,scale)):Math.round(value*scale)/scale;
const pc=Object.fromEntries(['union','difference','intersection'].map(name=>[name,(...args)=>{
 try{return polygonClipping[name](...args);}catch(original){for(const scale of [1000,100]){try{return polygonClipping[name](...args.map(a=>rounded(a,scale)));}catch{}}throw original;}
}]));
function unionAll(polys){let level=[];for(let i=0;i<polys.length;i+=80){const batch=polys.slice(i,i+80).filter(p=>p.length);if(batch.length)level.push(pc.union(...batch));}while(level.length>1){const next=[];for(let i=0;i<level.length;i+=2)next.push(i+1<level.length?pc.union(level[i],level[i+1]):level[i]);level=next;}return level[0]||[];}
function bufferLine(line,width,extent,segments=12){const pieces=[],r=width/2;for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i];if(extent&&(Math.max(a[0],b[0])+r<extent[0]||Math.min(a[0],b[0])-r>extent[2]||Math.max(a[1],b[1])+r<extent[1]||Math.min(a[1],b[1])-r>extent[3]))continue;const d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!d)continue;const x=-(b[1]-a[1])*r/d,y=(b[0]-a[0])*r/d;pieces.push([[[a[0]+x,a[1]+y],[b[0]+x,b[1]+y],[b[0]-x,b[1]-y],[a[0]-x,a[1]-y],[a[0]+x,a[1]+y]]]);}for(let index=0;index<line.length;index++){const p=line[index];if(extent&&(p[0]+r<extent[0]||p[0]-r>extent[2]||p[1]+r<extent[1]||p[1]-r>extent[3]))continue;if(index>0&&index<line.length-1){const a=line[index-1],b=line[index+1],ux=p[0]-a[0],uy=p[1]-a[1],vx=b[0]-p[0],vy=b[1]-p[1],product=Math.hypot(ux,uy)*Math.hypot(vx,vy);if(product>0&&ux*vx+uy*vy>0&&Math.abs(ux*vy-uy*vx)/product<1e-10)continue;}const ring=[];for(let j=0;j<=segments;j++)ring.push([p[0]+r*Math.cos(j*2*Math.PI/segments),p[1]+r*Math.sin(j*2*Math.PI/segments)]);pieces.push([ring]);}return unionAll(pieces);}
class MeshPositions{
 constructor(){this.blocks=[];this.used=0;this.length=0;this.block=null;}
 push(...values){for(const value of values){if(!this.block||this.used===this.block.length){this.block=new Float32Array(65536);this.blocks.push(this.block);this.used=0;}this.block[this.used++]=value;this.length++;}}
 finish(){const out=new Float32Array(this.length);let offset=0;for(let i=0;i<this.blocks.length;i++){const b=i===this.blocks.length-1?this.blocks[i].subarray(0,this.used):this.blocks[i];out.set(b,offset);offset+=b.length;}this.blocks=[];this.block=null;return out;}
}
function makeModel(d){const {w,h,n,center,floor,roadWidth,interval}=d,dx=w/n,dy=h/n;
const xy=c=>[(c[0]-center[0])*111319.490793*Math.cos(center[1]*Math.PI/180),(c[1]-center[1])*111319.490793];
const sourceTerrain=(!d.bounds||d.localRoads&&MilitaryPolicy.overlaps(d.localRoads.bbox,d.bounds))?sourceElevationField(d.localRoads,xy,demZ):null,heights=sourceTerrain?Array.from({length:(n+1)*(n+1)},(_,id)=>sourceTerrain.height(-w/2+(id%(n+1))*dx,-h/2+Math.floor(id/(n+1))*dy)):d.heights;
const min=Math.min(...heights,...(sourceTerrain?[sourceTerrain.minHeight]:[])),z0=min,groups={},counts={};let baseDepth=Math.max(5,d.lowerStep?interval+1:5);
function group(k){return groups[k]||(groups[k]={positions:k==='등고선'?[]:new MeshPositions(),lines:false});}function tri(k,a,b,c){group(k).positions.push(...a,...b,...c);}function point(x,y,z){return [x,y,z-z0];}
function demZ(x,y){let u=Math.max(0,Math.min(n-1e-9,(x+w/2)/dx)),v=Math.max(0,Math.min(n-1e-9,(y+h/2)/dy));const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,at=(ii,jj)=>d.heights[jj*(n+1)+ii];return b<=a?at(i,j)*(1-a)+at(i+1,j)*(a-b)+at(i+1,j+1)*b:at(i,j)*(1-b)+at(i+1,j+1)*a+at(i,j+1)*(b-a);}
function rawZ(x,y){return sourceTerrain?sourceTerrain.height(x,y):demZ(x,y);}
const stepped=d.terrainMode==='stepped';if(!Number.isFinite(interval)||interval<.5||interval>100)throw Error('한 단 높이는 0.5–100m로 입력하세요.');
const surface=terrainSurface(w,h,n,rawZ,z0),heightCache=new Map();const z=(x,y)=>{const key=x+","+y;if(heightCache.has(key))return heightCache.get(key);const raw=stepped?surface.height(x,y):meshHeight(x,y),value=stepped?Math.floor((raw-z0+1e-8)/interval)*interval+z0:raw;heightCache.set(key,value);return value;};
// All smooth surface layers use the same terrain triangles. Sampling a curved
// surface independently at each polygon's extra vertices creates mismatched seams.
const meshHeights=Array.from({length:(n+1)*(n+1)},(_,id)=>surface.height(-w/2+(id%(n+1))*dx,-h/2+Math.floor(id/(n+1))*dy));
function meshHeight(x,y){const u=Math.max(0,Math.min(n-1e-9,(x+w/2)/dx)),v=Math.max(0,Math.min(n-1e-9,(y+h/2)/dy)),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,at=(ii,jj)=>meshHeights[jj*(n+1)+ii];return b<=a?at(i,j)*(1-a)+at(i+1,j)*(a-b)+at(i+1,j+1)*b:at(i,j)*(1-b)+at(i+1,j+1)*a+at(i,j+1)*(b-a);}

const rect=[[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2],[-w/2,-h/2]]];
const detailBoxes=(MilitaryPolicy.detailExclusionZones||[]).filter(zone=>!d.bounds||MilitaryPolicy.overlaps(zone.bbox,d.bounds)).map(zone=>{const a=xy(zone.bbox.slice(0,2)),b=xy(zone.bbox.slice(2));return [...a,...b];}),detailMask=detailBoxes.map(([x,y,X,Y])=>[[[x,y],[X,y],[X,Y],[x,Y],[x,y]]]);
const gisFeatures=[];const covers={'도로':[],'녹지':[],'하천':[],'철도':[],'바다':[],'인도':[],'횡단보도':[],'경계석':[]},buildings=[];let skipped=0,estimated=0;
const geo=(d.osm.preparedGeo?MilitaryPolicy.assertPrepared(d.osm,d.bounds):MilitaryPolicy.assertSelection(d.osm,d.bounds||[-180,-90,180,90])).geo;
const allSourcePairs=sourceBankPairs(d.localRoads,xy),waterSource=d.localRoads?.waterFeatures||[],riverSource=waterSource.some(f=>f.properties.water_code==='E003')?waterSource.filter(f=>f.properties.water_code==='E003'):waterSource;
const sourceWater=riverSource.flatMap(f=>f.geometry.coordinates.map(p=>p.map(r=>r.map(xy)))),sourceRibbons=new Map(allSourcePairs.map(p=>[p,riverBankRibbon(p,sourceWater)]));
// River lowering, source banks and floodplain connections share the explicit toggle.
// Keep unrelated retaining walls; switching off restores the original draped river.
const sourcePairs=allSourcePairs.filter(p=>d.riverEstimate||!sourceRibbons.get(p)[0]?.water);
let processed=0;for(const f of [...geo.features].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){if(++processed%1000===0)report({progress:60+Math.round(processed/geo.features.length*4),message:'주변 요소 처리 중 · '+processed.toLocaleString()+' / '+geo.features.length.toLocaleString()});const t=f.properties||{},g=f.geometry;if(!g)continue;const cat=(t.building&&t.building!=='no')||(t['building:part']&&t['building:part']!=='no')?'건물':t.highway||t['area:highway']?'도로':t.waterway||t.natural==='water'?'하천':t.railway?'철도':['grass','forest','meadow','orchard'].includes(t.landuse)||['wood','scrub','grassland'].includes(t.natural)||['park','garden','pitch'].includes(t.leisure)?'녹지':null;const coords=[];const collect=c=>{if(typeof c[0]==='number')coords.push(xy(c));else for(const part of c)collect(part);};if(g.coordinates)collect(g.coordinates);if(coords.length){let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;for(const p of coords){xmin=Math.min(xmin,p[0]);xmax=Math.max(xmax,p[0]);ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);}const anchor=g.type==='LineString'?coords[Math.floor(coords.length/2)]:[(xmin+xmax)/2,(ymin+ymax)/2];if(xmax>=-w/2&&xmin<=w/2&&ymax>=-h/2&&ymin<=h/2)gisFeatures.push({id:f.id,category:cat||'기타 GIS',properties:{...t},point:anchor,...(!cat?{geometry:{type:g.type,coordinates:(function project(c){return typeof c[0]==='number'?xy(c):c.map(project);})(g.coordinates)}}:{})});}if(!cat)continue;
try{let polys=[];if(g.type==='Polygon')polys=[g.coordinates.map(r=>r.map(xy))];else if(g.type==='MultiPolygon')polys=g.coordinates.map(p=>p.map(r=>r.map(xy)));else if(['LineString','MultiLineString'].includes(g.type)&&cat!=='건물'&&cat!=='녹지'){let width=parseFloat(t.width);if(String(t.width).includes('ft'))width*=.3048;if(!(width>0&&width<200)){estimated++;width=cat==='철도'?3:cat==='하천'?4:parseFloat(t.lanes)>0?parseFloat(t.lanes)*3:({motorway:14,trunk:12,primary:10,secondary:9,tertiary:7,residential:6,living_street:4,service:3,footway:1.5,path:1.5,steps:1.5,cycleway:2,pedestrian:4,track:3}[t.highway]||roadWidth);}for(const line of g.type==='LineString'?[g.coordinates]:g.coordinates)polys.push(...bufferLine(line.map(xy),width,[-w/2,-h/2,w/2,h/2]));}if(!polys.length)continue;const clipped=pc.intersection(polys,rect);if(!clipped.length)continue;
if(cat==='건물'){let height=parseFloat(t.height);if(String(t.height).includes('ft'))height*=.3048;const heightEstimated=!Number.isFinite(height)||height<=0;if(heightEstimated){height=(parseFloat(t['building:levels'])||1)*floor;estimated++;}for(const poly of clipped)buildings.push({poly,height,properties:{...t},heightEstimated,usage:ContaBuildingUse.classify(t)});}else covers[cat].push(clipped);counts[cat]=(counts[cat]||0)+clipped.length;
}catch{skipped++;}}
// Source building footprints replace fallback buildings only in the uploaded extent.
// Keep fallback geometry beyond that extent, including portions crossing its edge.
let importedBuildings=null;
if(d.localRoads?.buildingLayerPresent){
 const [west,south,east,north]=d.localRoads.bbox,coverage=[[[[west,south],[east,south],[east,north],[west,north],[west,south]].map(xy)]];
 const fullCoverage=d.bounds&&d.bounds[0]>=west-1e-10&&d.bounds[1]>=south-1e-10&&d.bounds[2]<=east+1e-10&&d.bounds[3]<=north+1e-10;
 const retained=fullCoverage?[]:buildings.flatMap(b=>pc.difference([b.poly],coverage).map(poly=>({...b,poly})));
 estimated=Math.max(0,estimated-buildings.filter(b=>b.heightEstimated).length+retained.filter(b=>b.heightEstimated).length);
 buildings.splice(0,buildings.length,...retained);
 for(let i=gisFeatures.length-1;i>=0;i--){const f=gisFeatures[i];if(f.category==='건물'&&f.point[0]>=xy([west,south])[0]&&f.point[0]<=xy([east,north])[0]&&f.point[1]>=xy([west,south])[1]&&f.point[1]<=xy([east,north])[1])gisFeatures.splice(i,1);}
 importedBuildings=0;
 for(const f of d.localRoads.buildingFeatures||[]){
  if(MilitaryPolicy.tagged(f.properties)||MilitaryPolicy.reviewZones.some(zone=>MilitaryPolicy.overlaps(zone.bbox,f.bbox)))continue;
  const polys=f.geometry.coordinates.map(poly=>poly.map(r=>r.map(xy))),clipped=pc.intersection(polys,rect);if(!clipped.length)continue;
  const t=f.properties,measured=Number(t.height),heightEstimated=!(measured>0),height=heightEstimated?(Number(t['building:levels'])||1)*floor:measured;
  if(heightEstimated)estimated++;
  for(const poly of clipped){buildings.push({poly,height,properties:{...t},heightEstimated,usage:ContaBuildingUse.classify(t)});importedBuildings++;}
  const b=f.bbox;gisFeatures.push({id:f.id,category:'건물',properties:{...t},point:xy([(b[0]+b[2])/2,(b[1]+b[3])/2])});
 }
 counts['건물']=buildings.length;
 report({progress:64,message:'업로드한 파일의 건물 '+importedBuildings+'개 적용 중'});
}
const importedRoads=applyNgiiRoads(d.localRoads,{pc,unionAll,bufferLine,xy,rect,covers,gisFeatures,roadLines:!!d.roadLines,crosswalkStripes});
// Preserve source XY lines as curves, clipped to the model, without width buffers.
// Elevations are draped on the generated terrain; they are not survey Z values.
for(const f of d.localRoads?.sourceLines||[]){
 if(MilitaryPolicy.tagged(f.properties)||MilitaryPolicy.reviewZones.some(zone=>MilitaryPolicy.overlaps(zone.bbox,f.bbox)))continue;
 const name='캐드',g=group(name);g.lines=true;
 for(const line of f.geometry.coordinates)for(let i=1;i<line.length;i++){
  const a=xy(line[i-1]),b=xy(line[i]),vx=b[0]-a[0],vy=b[1]-a[1];let lo=0,hi=1,valid=true;
  for(const [p,q] of [[-vx,a[0]+w/2],[vx,w/2-a[0]],[-vy,a[1]+h/2],[vy,h/2-a[1]]]){
   if(Math.abs(p)<1e-14){if(q<0)valid=false;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
  }
  if(!valid||hi<=lo||Math.hypot(vx,vy)<1e-9)continue;
  const steps=Math.max(1,Math.ceil(Math.hypot(vx,vy)*(hi-lo)/Math.max(1,Math.min(dx,dy)/2)));
  const contourValue=f.properties.source_layer?.match(/f001/i)?Number(f.properties['등고수치']??f.properties.cont):NaN;
  const related=sourcePairs.filter(p=>p.upperId.startsWith(f.id+'/')||p.lowerId.startsWith(f.id+'/'));
  const bankLevel=(x,y)=>{let best=null;for(const p of related){if(p.upperId.startsWith(f.id+'/'))return z(x,y);for(let i=1;i<p.nodes.length;i++){const a=p.nodes[i-1],b=p.nodes[i],vx=b.lower[0]-a.lower[0],vy=b.lower[1]-a.lower[1],t=Math.max(0,Math.min(1,((x-a.lower[0])*vx+(y-a.lower[1])*vy)/(vx*vx+vy*vy)||0)),distance=Math.hypot(x-a.lower[0]-vx*t,y-a.lower[1]-vy*t),upper=a.upper.map((v,j)=>v+(b.upper[j]-v)*t);if(!best||distance<best.distance)best={distance,level:z(...upper)-p.height};}}return best&&best.distance<.05?best.level:null;};

  for(let j=0;j<steps;j++){const sample=t=>{const x=a[0]+vx*t,y=a[1]+vy*t;const originalZ=Number.isFinite(line[i-1][2])&&Number.isFinite(line[i][2])?line[i-1][2]+(line[i][2]-line[i-1][2])*t:null,sourceBankLevel=bankLevel(x,y);return point(x,y,Number.isFinite(contourValue)?contourValue:originalZ??sourceBankLevel??(z(x,y)+.08));};for(const [u,v] of detailLineParts(sample(lo+(hi-lo)*j/steps),sample(lo+(hi-lo)*(j+1)/steps),detailBoxes))g.positions.push(...u,...v);}
  counts[name]=(counts[name]||0)+1;
 }
}
if(d.coast) covers['바다']=pc.difference(rect,d.coast.map(r=>[r.map(xy)]));
if(d.riverEstimate||d.localRoads?.waterFeatures?.length){
 const water=d.localRoads?.waterFeatures||[],source=water.some(f=>f.properties.water_code==='E003')?water.filter(f=>f.properties.water_code==='E003'):water;
 if(!source.length)throw Error('하천 면과 등고선·표고점이 있는 자료를 먼저 불러오세요.');
 const project=c=>typeof c[0]==='number'?xy(c):c.map(project),[west,south,east,north]=d.localRoads.bbox,coverage=[[[[west,south],[east,south],[east,north],[west,north],[west,south]].map(xy)]];
 covers['하천']=[pc.difference(unionAll(covers['하천']),coverage),...source.map(f=>pc.intersection(project(f.geometry.coordinates),rect))];
}
report({progress:65,message:'도로 연결과 레이어 정리 중'});
for(const k in covers)covers[k]=unionAll(covers[k]);
if(detailMask.length){
 buildings.splice(0,buildings.length,...buildings.flatMap(b=>pc.difference([b.poly],detailMask).map(poly=>({...b,poly}))));
 for(const name of Object.keys(covers))if(name!=='녹지')covers[name]=pc.difference(covers[name],detailMask);
 const within=p=>detailBoxes.some(b=>p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3]);
 for(let i=gisFeatures.length-1;i>=0;i--){const f=gisFeatures[i];if(f.category==='녹지')continue;
  if(f.geometry?.type==='MultiLineString'||f.geometry?.type==='LineString'){const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates,parts=lines.flatMap(r=>r.slice(1).flatMap((b,i)=>detailLineParts(r[i],b,detailBoxes)));if(parts.length){f.geometry={type:'MultiLineString',coordinates:parts};if(within(f.point))f.point=parts[0][0];}else gisFeatures.splice(i,1);}
  else if(['Polygon','MultiPolygon'].includes(f.geometry?.type)){const polys=pc.difference(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates,detailMask);if(polys.length){f.geometry={type:'MultiPolygon',coordinates:polys};if(within(f.point))f.point=polys[0][0][0];}else gisFeatures.splice(i,1);}
  else if(within(f.point))gisFeatures.splice(i,1);
 }
 counts['건물']=buildings.length;if(importedBuildings!==null)importedBuildings=buildings.filter(b=>b.properties.ngii_import).length;
}

if(importedRoads){counts['도로']=covers['도로'].length;counts['인도']=covers['인도'].length;counts['횡단보도']=covers['횡단보도'].length;}
const sourceBanks=[];
function segmentBounds(a,b){let lo=0,hi=1;const vx=b[0]-a[0],vy=b[1]-a[1];for(const [p,q] of [[-vx,a[0]+w/2],[vx,w/2-a[0]],[-vy,a[1]+h/2],[vy,h/2-a[1]]]){if(Math.abs(p)<1e-12){if(q<0)return null;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}return hi-lo>1e-8?[lo,hi]:null;}
for(const pair of sourcePairs){const nodes=sourceRibbons.get(pair);for(let i=1;i<nodes.length;i++){
 const u=nodes[i-1],v=nodes[i],ub=segmentBounds(u.upper,v.upper),lb=segmentBounds(u.lower,v.lower);if(!ub||!lb)continue;const lo=Math.max(ub[0],lb[0]),hi=Math.min(ub[1],lb[1]);if(hi-lo<1e-8)continue;const at=(a,b,t)=>a.map((x,k)=>x+(b[k]-x)*t),a=at(u.upper,v.upper,lo),b=at(u.upper,v.upper,hi),c=at(u.lower,v.lower,lo),e=at(u.lower,v.lower,hi),poly=[[[...a],[...b],[...e],[...c],[...a]]];
 if(!terrainPolygons([poly]).length||detailMask.length&&pc.intersection([poly],detailMask).length)continue;
 const panel={a,b,c,d:e,poly,height:pair.height,upperId:pair.upperId,lowerId:pair.lowerId,sourceProperties:pair.properties,absoluteElevationEstimated:true,relativeHeightFromSource:true};if(stepped)panel.topLevel=Math.floor((meshHeight((a[0]+b[0])/2,(a[1]+b[1])/2)-z0)/interval)*interval;
 if(u.water&&v.water){panel.waterA=at(u.water,v.water,lo);panel.waterB=at(u.water,v.water,hi);const connector=[[[...c],[...e],panel.waterB,panel.waterA,[...c]]];if(terrainPolygons([connector]).length&&(!detailMask.length||!pc.intersection([connector],detailMask).length))panel.connectorPoly=connector;}
 sourceBanks.push(panel);
}}
const sourceBankMask=unionAll(sourceBanks.flatMap(p=>[[p.poly],...(p.connectorPoly?[[p.connectorPoly]]:[])]));
if(sourceBankMask.length)for(const name in covers)covers[name]=pc.difference(covers[name],sourceBankMask);
if(covers['녹지'].length){const builtArea=unionAll(buildings.map(b=>[b.poly]));covers['녹지']=pc.difference(covers['녹지'],covers['도로'],covers['인도'],builtArea);}
// Offset the original sidewalk perimeter before selection/terrain cuts.
// A 360mm symmetric stroke clipped INSIDE the footprint yields a 180mm curb.
if(d.curb&&covers['인도'].length){
 const boundary=importedRoads?.sidewalkBoundaries||covers['인도'];
 const edges=unionAll(boundary.flatMap(poly=>poly.map(r=>bufferLine(r,.36,[-w/2,-h/2,w/2,h/2],48))));
 covers['경계석']=terrainPolygons(pc.intersection(covers['인도'],edges));
 covers['인도']=pc.difference(covers['인도'],covers['경계석']);
 counts['경계석']=covers['경계석'].length;
}
if(importedRoads)delete importedRoads.sidewalkBoundaries;
if(stepped){let occupied=[];for(const name of ['경계석','횡단보도','인도','도로','하천','녹지','바다']){covers[name]=terrainPolygons(pc.difference(covers[name],occupied));occupied=pc.union(occupied,covers[name]);}}

const bankConstraints=sourceBanks.filter(p=>p.waterA).flatMap(p=>[0,.5,1].map(t=>{const upper=p.a.map((v,i)=>v+(p.b[i]-v)*t),lower=p.c.map((v,i)=>v+(p.d[i]-v)*t),height=(stepped?z0+p.topLevel:meshHeight(...upper))-p.height;return {point:lower,height,sourceHeight:p.height};}));
let riverEstimate=d.riverEstimate&&covers['하천'].length?estimateRiverLevels(terrainPolygons(covers['하천']),d.localRoads,{xy,bankHeight:z,z0,interval,stepped,w,h,n,bankConstraints,requested:!!d.riverEstimate}):null;
if(riverEstimate)for(const panel of sourceBanks)if(panel.waterA){let best=null;const mid=panel.waterA.map((v,i)=>(v+panel.waterB[i])/2);for(const reach of riverEstimate.surfaces)for(const ring of reach.poly)for(const q of ring){const distance=Math.hypot(q[0]-mid[0],q[1]-mid[1]);if(!best||distance<best.distance)best={distance,level:reach.level};}if(best)panel.waterLevel=best.level;}

if(riverEstimate&&!riverEstimate.surfaces.length&&!d.riverEstimate)riverEstimate=null;
if(riverEstimate){if(!riverEstimate.surfaces.length)throw Error('선택 영역에 추정할 하천 면이 없습니다.');baseDepth=Math.max(baseDepth,...riverEstimate.surfaces.map(s=>-s.level+5));counts['하천']=riverEstimate.surfaces.length;}
const mask=unionAll([...Object.entries(covers).filter(([name])=>name!=='철도').map(([,polys])=>polys),sourceBankMask]),ground=d.cutGround!==false&&mask.length?pc.difference(rect,mask):[rect];
const groundDepth=.2;
const sidewalkVolume=!!d.sidewalkVolume&&covers['인도'].length>0,sidewalkDepth=.2;
const cad={gisFeatures,sourceTerrain:sourceTerrain?{contours:sourceTerrain.contours,spots:sourceTerrain.spots,method:sourceTerrain.method,estimatedBetweenReferences:true}:null,sourceBanks,detailExclusions:detailBoxes,riverEstimate,roadMarkings:{enabled:!!d.roadLines,provisional:true,source:'source-crosswalk-boundary',stripeWidth:.5,gap:.5},terrain:{groundDepth,sidewalkVolume,sidewalkDepth,w,h,count:surface.count,points:surface.points,polygons:terrainPolygons(ground),base:-baseDepth,lowerStep:!!d.lowerStep,interval},parapets:[],covers:Object.fromEntries(Object.entries(covers).map(([name,polys])=>[name,terrainPolygons(polys)])),buildings:[]};
cad.covers['원본 석축']=sourceBankMask;
if(riverEstimate){riverEstimate.banksConnected=!stepped;riverEstimate.bankCovers=cad.covers;riverEstimate.sourceBanks=sourceBanks;covers['하천']=riverEstimate.regularPolygons||[];}
if(stepped)cad.terrain.bands=makeSteps();
function coverOffset(name){if(sidewalkVolume&&['도로','횡단보도'].includes(name))return -sidewalkDepth;return -(d.lowerStep&&['도로','횡단보도','하천','바다'].includes(name)?interval:0);}
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
  for(const poly of polygons){face('대지',poly,()=>z0+level);face('대지',poly,()=>z0+level-groundDepth);
   for(const ring of poly)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],at=point(...a,z0+level),bt=point(...b,z0+level),ab=point(...a,z0+level-groundDepth),bb=point(...b,z0+level-groundDepth);tri('대지',at,ab,bb);tri('대지',at,bb,bt);}
  }
  for(const [name,polys] of Object.entries(layerCovers))for(const poly of polys){
   const bottom=(name==='경계석'||sidewalkVolume&&name==='인도')?z0+level-sidewalkDepth:z0-baseDepth;
   face(name,poly,()=>z0+level+coverOffset(name));if(name==='철도')continue;face(name,poly,()=>bottom);
   for(const ring of poly)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],at=point(...a,z0+level+coverOffset(name)),bt=point(...b,z0+level+coverOffset(name)),ab=point(...a,bottom),bb=point(...b,bottom);tri(name,at,ab,bb);tri(name,at,bb,bt);}
  }
  const lines=group('등고선');lines.lines=true;
  for(const poly of footprint)for(const ring of poly)for(let i=1;i<ring.length;i++)lines.positions.push(...point(...ring[i-1],z0+level+.04),...point(...ring[i],z0+level+.04));
 }
 return bands;
}
function clipEdge(poly,axis,limit,greater){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],inside=p=>greater?p[axis]>=limit:p[axis]<=limit,aa=inside(a),bb=inside(b);if(aa)out.push(a);if(aa!==bb){const t=(limit-a[axis])/(b[axis]-a[axis]);const hit=a.map((v,index)=>v+t*(b[index]-v));hit[axis]=limit;out.push(hit);}}return out;}
if(!stepped)for(const [k,polys] of [['대지',ground],...Object.entries(covers)])for(const p of terrainPolygons(polys)){const flat=earcut.flatten(p),ids=earcut(flat.vertices,flat.holes,2);for(let q=0;q<ids.length;q+=3){const t=ids.slice(q,q+3).map(v=>[flat.vertices[v*2],flat.vertices[v*2+1]]),i0=Math.max(0,Math.floor((Math.min(...t.map(v=>v[0]))+w/2)/dx)),i1=Math.min(n-1,Math.floor((Math.max(...t.map(v=>v[0]))+w/2)/dx)),j0=Math.max(0,Math.floor((Math.min(...t.map(v=>v[1]))+h/2)/dy)),j1=Math.min(n-1,Math.floor((Math.max(...t.map(v=>v[1]))+h/2)/dy));for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=-w/2+i*dx,y=-h/2+j*dy;let poly=t;for(const [axis,limit,greater] of [[0,x,true],[0,x+dx,false],[1,y,true],[1,y+dy,false]]){poly=clipEdge(poly,axis,limit,greater);if(poly.length<3)break;}if(poly.length<3)continue;const zz=k==='대지'?0:coverOffset(k);
// Split at the shared grid diagonal, so both sides of every layer boundary lie
// on the same plane, even when their polygon triangulations differ.
for(const side of [-1,1]){let part=[];const signed=p=>side*((p[1]-y)/dy-(p[0]-x)/dx);for(let v=0;v<poly.length;v++){const a=poly[v],b=poly[(v+1)%poly.length],sa=signed(a),sb=signed(b),ina=sa>=-1e-12,inb=sb>=-1e-12;if(ina)part.push(a);if(ina!==inb){const t=sa/(sa-sb);part.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}
for(let v=1;v<part.length-1;v++){let a=part[0],b=part[v],c=part[v+1];const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)<1e-10)continue;if(area<0)[b,c]=[c,b];tri(k,...[a,b,c].map(p=>point(...p,z(...p)+zz)));}}
}}}
if(!stepped)for(let j=0;j<n;j++){for(let i=0;i<n;i++){const x=-w/2+i*dx,y=-h/2+j*dy,a=[x,y],b=[x+dx,y],c=[x+dx,y+dy],e=[x,y+dy];for(const t of [[a,b,c,a],[a,c,e,a]]){const tz=t.slice(0,3).map(p=>z(...p));for(let level=Math.ceil(Math.min(...tz)/interval)*interval;level<=Math.max(...tz);level+=interval){if(tz.every(v=>Math.abs(v-level)<1e-8))continue;const found=new Map();const add=p=>found.set(p.map(v=>Math.round(v*10000)).join(','),p);for(let v=0;v<3;v++){let u=(v+1)%3;if(Math.abs(tz[v]-level)<1e-8)add(point(t[v][0],t[v][1],level+.04));if((tz[v]-level)*(tz[u]-level)<0){const f=(level-tz[v])/(tz[u]-tz[v]);add(point(t[v][0]+f*(t[u][0]-t[v][0]),t[v][1]+f*(t[u][1]-t[v][1]),level+.04));}}const hits=[...found.values()];if(hits.length===2){const g=group('등고선');g.lines=true;g.positions.push(...hits[0],...hits[1]);}}}}if(j%10===0)report({progress:68+Math.round(j/n*20),message:'지형 면 연결 중'});}
// Close every trimmed ground island and hole, including road/sidewalk boundaries.
if(!stepped&&groups['대지']){const slab=surfaceVolume(groups['대지'].positions.finish(),groundDepth);cad.groundVolumeParts=slab.parts;groups['대지'].positions=new MeshPositions();for(let i=0;i<slab.positions.length;i+=4096)groups['대지'].positions.push(...slab.positions.subarray(i,i+4096));}
if(riverEstimate&&!stepped&&riverEstimate.regularPolygons?.length&&groups['하천']){const normal=groups['하천'].positions.finish();cad.riverRegularPositions=normal;groups['하천'].positions=new MeshPositions();for(let i=0;i<normal.length;i+=4096)groups['하천'].positions.push(...normal.subarray(i,i+4096));}
if(riverEstimate)for(const {poly,level} of riverEstimate.surfaces){
 const top=z0+level,bottom=z0-baseDepth;face('하천',poly,()=>top);face('하천',poly,()=>bottom);
 for(const ring of poly)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];tri('하천',point(...a,top),point(...a,bottom),point(...b,bottom));tri('하천',point(...a,top),point(...b,bottom),point(...b,top));}
}
for(const panel of sourceBanks){
 const {a,b,c,d:lowB,height}=panel,vx=b[0]-a[0],vy=b[1]-a[1],length2=vx*vx+vy*vy;if(length2<1e-8)continue;
 const samples=riverBankSegments(a,b,w,h,n);for(const [u,v] of samples){const t=p=>((p[0]-a[0])*vx+(p[1]-a[1])*vy)/length2,lower=p=>{const s=t(p);return c.map((x,i)=>x+(lowB[i]-x)*s);},up=p=>stepped?z0+panel.topLevel:meshHeight(...p),U=point(...u,up(u)),V=point(...v,up(v)),A=point(...lower(u),up(u)-height),B=point(...lower(v),up(v)-height);tri('원본 석축',U,V,B);tri('원본 석축',U,B,A);
  if(panel.waterA&&Number.isFinite(panel.waterLevel)){const edge=p=>{const s=t(p);return panel.waterA.map((x,i)=>x+(panel.waterB[i]-x)*s);},C=point(...edge(u),z0+panel.waterLevel),D=point(...edge(v),z0+panel.waterLevel);tri('원본 석축',A,B,D);tri('원본 석축',A,D,C);}
 }
}counts['원본 석축']=new Set(sourceBanks.map(p=>p.upperId+'|'+p.lowerId)).size;
if(riverEstimate&&!stepped){
 const water=cad.covers['하천'],bankPositions=new MeshPositions();let bankFaces=0;
 for(const {poly,level} of riverEstimate.surfaces)for(const ring of poly)for(let i=1;i<ring.length;i++){
  const a=ring[i-1],b=ring[i];
  // The selection frame is a model cut, rather than a river bank.
  if([0,1].some(k=>Math.abs(Math.abs(a[k])-(k?h:w)/2)<1e-6&&Math.abs(a[k]-b[k])<1e-6))continue;
  for(const [lo,hi] of riverBankOpenIntervals(a,b,sourceBanks)){const at=t=>a.map((v,k)=>v+(b[k]-v)*t),A=at(lo),B=at(hi),offset=riverBankOffset(A,B,water,cad.covers,cad.terrain);
  for(const [u,v] of riverBankSegments(A,B,w,h,n)){
   const at=point(...u,z(...u)+offset),bt=point(...v,z(...v)+offset),ab=point(...u,z0+level),bb=point(...v,z0+level);
   if(Math.abs(at[2]-level)<1e-7&&Math.abs(bt[2]-level)<1e-7)continue;
   tri('대지',at,bt,bb);tri('대지',at,bb,ab);bankPositions.push(...at,...bt,...bb,...at,...bb,...ab);bankFaces+=2;
  }
 }}riverEstimate.bankFaces=bankFaces;cad.riverBankPositions=bankPositions.finish();
}
for(const {poly,height,usage,properties,heightEstimated} of buildings){const zs=poly[0].map(p=>z(...p)),base=Math.max(...zs),bottom=Math.min(...zs)-.02,roof=base+height;cad.buildings.push({poly,bottom:bottom-z0,roof:roof-z0,height,usage,properties,heightEstimated});face('건물',poly,()=>roof);face('건물',poly,()=>bottom);for(const r of poly)for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i];tri('건물',point(...a,bottom),point(...b,bottom),point(...b,roof));tri('건물',point(...a,bottom),point(...b,roof),point(...a,roof));}}
if(d.parapet){
 const height=Number(d.parapetHeight);if(!Number.isFinite(height)||height<.1||height>3)throw Error('파라펫 높이는 0.1–3m로 입력하세요.');
 for(const building of cad.buildings){
  const edges=unionAll(building.poly.map(r=>bufferLine(r,.4,[-w/2,-h/2,w/2,h/2]))),walls=terrainPolygons(pc.intersection([building.poly],edges));
  for(const poly of walls){const bottom=building.roof,roof=bottom+height;cad.parapets.push({poly,bottom,roof});face('파라펫',poly,()=>z0+roof);face('파라펫',poly,()=>z0+bottom);
   for(const ring of poly)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];tri('파라펫',point(...a,z0+bottom),point(...b,z0+bottom),point(...b,z0+roof));tri('파라펫',point(...a,z0+bottom),point(...b,z0+roof),point(...a,z0+roof));}
  }
 }counts['파라펫']=cad.parapets.length;
}
for(const name of ['인도','경계석'])if(!stepped&&groups[name]&&(name==='경계석'||sidewalkVolume)){const slab=surfaceVolume(groups[name].positions.finish(),sidewalkDepth);groups[name].positions=slab.positions;cad[name==='경계석'?'curbVolumeParts':'sidewalkVolumeParts']=slab.parts;}
const contours=group('등고선');if(detailBoxes.length){const clipped=[];for(let i=0;i<contours.positions.length;i+=6)for(const [a,b] of detailLineParts(contours.positions.slice(i,i+3),contours.positions.slice(i+3,i+6),detailBoxes))clipped.push(...a,...b);contours.positions=clipped;}const unique=new Map();for(let i=0;i<contours.positions.length;i+=6){const a=contours.positions.slice(i,i+3),b=contours.positions.slice(i+3,i+6),ka=a.map(v=>Math.round(v*10000)).join(','),kb=b.map(v=>Math.round(v*10000)).join(',');if(ka!==kb)unique.set(ka<kb?ka+'|'+kb:kb+'|'+ka,[...a,...b]);}contours.positions=[...unique.values()].flat();
counts['대지']=stepped?cad.terrain.bands.length:1;counts['등고선']=Math.floor(group('등고선').positions.length/6);return {groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{...v,positions:v.positions instanceof MeshPositions?v.positions.finish():new Float32Array(v.positions)}])),counts,estimated,skipped,z0,cad,importedRoads,importedBuildings};}
onmessage=e=>{activeRequestId=e.data.id;try{if(!e.data.osm.preparedGeo&&typeof osmtogeojson==='undefined')importScripts('vendor/osmtogeojson.js');const result=makeModel(e.data);postMessage({id:e.data.id,result},Object.values(result.groups).map(g=>g.positions.buffer));}catch(error){postMessage({id:e.data.id,error:String(error.message||error)});}};

