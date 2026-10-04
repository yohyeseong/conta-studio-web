import {officialFeatures} from './official-packed.js?v=official1';
import {mergeOfficial} from './official-details.js?v=official1';
const W=256*2**19;
const ll=(x,y)=>[x/W*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/W)))*180/Math.PI];
const area=r=>Math.abs(r.reduce((a,p,i)=>i?a+r[i-1][0]*p[1]-p[0]*r[i-1][1]:a,0))/2;
const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
self.onmessage=async e=>{if(e.data.prepare){await officialFeatures(e.data.bounds).catch(()=>{});return;}const {id,bounds,records}=e.data;try{
 const features=records.filter(r=>r.kind===1&&r.mode===3).flatMap((r,i)=>{
  const rings=r.paths.map(p=>{const ring=[];for(let k=0;k<p.points.length;k+=2)ring.push(ll(p.points[k],p.points[k+1]));if(ring.length&&(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1]))ring.push(ring[0]);return ring;}).filter(r=>r.length>=4);
  const sizes=rings.map(area),depth=rings.map((ring,i)=>rings.filter((other,j)=>sizes[j]>sizes[i]&&inside(ring[0],other)).length),polys=rings.flatMap((ring,i)=>depth[i]%2?[]:[[ring,...rings.filter((hole,j)=>depth[j]===depth[i]+1&&inside(hole[0],ring))]]);
  if(!polys.length)return [];const points=rings.flat(),bbox=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
  return [{type:'Feature',id:'map/'+i,bbox,properties:{building:'yes',name:r.name},geometry:{type:'MultiPolygon',coordinates:polys}}];
 });
 const details=await officialFeatures(bounds),merged=mergeOfficial({type:'FeatureCollection',features},details);self.postMessage({id,geo:merged.geo,officialBuildings:details.length});
 }catch(error){self.postMessage({id,error:error.message});}};
