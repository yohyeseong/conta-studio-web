/* Original survey elevations take precedence; the surface between them is inferred. */
(function(root){
function nearest(p,a,b){const x=b[0]-a[0],y=b[1]-a[1],length=x*x+y*y,t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/length||0));return {point:[a[0]+x*t,a[1]+y*t],t,distance:Math.hypot(p[0]-a[0]-x*t,p[1]-a[1]-y*t)};}
root.sourceElevationField=function(data,xy,fallback){
 const refs=(data?.elevationFeatures||[]).map(f=>{const point=f.geometry.type==='Point'?xy(f.geometry.coordinates):null,lines=f.geometry.type==='MultiLineString'?f.geometry.coordinates.map(r=>r.map(xy)):[],points=point?[point]:lines.flat(),height=f.properties.elevation,bbox=points.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);return {height,point,lines,bbox};}).filter(f=>Number.isFinite(f.height));
 if(!refs.length)return null;const cache=new Map(),a=xy(data.bbox.slice(0,2)),b=xy(data.bbox.slice(2));
 const bboxDistance=(p,b)=>Math.hypot(Math.max(b[0]-p[0],0,p[0]-b[2]),Math.max(b[1]-p[1],0,p[1]-b[3]));
 function height(x,y){if(x<a[0]-.001||x>b[0]+.001||y<a[1]-.001||y>b[1]+.001)return fallback(x,y);const key=x+','+y;if(cache.has(key))return cache.get(key);const p=[x,y],near=new Map();
  for(const f of refs.map(f=>({f,d:bboxDistance(p,f.bbox)})).sort((a,b)=>a.d-b.d).slice(0,32).map(v=>v.f)){let d=f.point?Math.hypot(x-f.point[0],y-f.point[1]):Infinity;for(const r of f.lines)for(let i=1;i<r.length;i++)d=Math.min(d,nearest(p,r[i-1],r[i]).distance);const key=f.point?'point:'+f.point.join(','):'contour:'+f.height,old=near.get(key);if(!old||d<old.distance)near.set(key,{distance:d,height:f.height});}
  const values=[...near.values()].sort((a,b)=>a.distance-b.distance).slice(0,8);let value;if(!values.length||values[0].distance>1000)value=fallback(x,y);else if(values[0].distance<1e-5)value=values[0].height;else{let sum=0,total=0;for(const v of values){const weight=1/Math.max(.01,v.distance)**2;sum+=v.height*weight;total+=weight;}value=sum/total;}if(cache.size<100000)cache.set(key,value);return value;
 }
 return {height,minHeight:Math.min(...refs.map(f=>f.height)),contours:refs.filter(f=>!f.point).length,spots:refs.filter(f=>f.point).length,estimatedBetweenReferences:true,method:'original-elevations-first-distance-interpolation',bbox:data.bbox};
};
root.sourceBankPairs=function(data,xy){
 const raw=(data?.bankFeatures||[]).flatMap(f=>f.geometry.coordinates.map((r,index)=>({id:f.id+'/'+index,line:r.map(xy),part:f.properties.bank_part,height:f.properties.bank_height,kind:f.properties.bank_kind,properties:f.properties}))),upper=raw.filter(f=>f.part==='upper'&&f.height>0&&f.height<100),lower=raw.filter(f=>f.part==='lower'),pairs=[];
 function project(p,line){let result={distance:Infinity},along=0;for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),v=nearest(p,a,b);if(v.distance<result.distance)result={...v,along:along+v.t*length};along+=length;}return result;}
 const length=r=>r.reduce((n,p,i)=>i?n+Math.hypot(p[0]-r[i-1][0],p[1]-r[i-1][1]):n,0);
 for(const low of lower){let candidates=[];for(const high of upper){if(low.kind&&high.kind&&low.kind!==high.kind)continue;const matches=low.line.map(p=>project(p,high.line)),distances=matches.map(p=>p.distance).sort((a,b)=>a-b),average=distances.reduce((a,b)=>a+b,0)/distances.length,coverage=Math.abs(matches.at(-1).along-matches[0].along)/Math.max(.01,length(low.line));if(average<=Math.max(8,high.height*2)&&distances[Math.floor(distances.length*.8)]<=Math.max(12,high.height*3)&&coverage>.65&&coverage<1.35)candidates.push({high,matches,score:average+Math.abs(1-coverage)*5});}
  candidates.sort((a,b)=>a.score-b.score);if(!candidates.length)continue;if(candidates[1]&&candidates[1].score-candidates[0].score<.2)continue;const {high,matches}=candidates[0];let nodes=low.line.map((p,i)=>({upper:matches[i].point,lower:p,along:matches[i].along}));if(nodes.at(-1).along<nodes[0].along)nodes.reverse();if(nodes.some((v,i)=>i&&v.along<nodes[i-1].along-.05))continue;
  // Preserve every original upper vertex as well as every lower vertex.
  let along=0;for(let i=1;i<high.line.length;i++){along+=Math.hypot(high.line[i][0]-high.line[i-1][0],high.line[i][1]-high.line[i-1][1]);if(along<=nodes[0].along+1e-6||along>=nodes.at(-1).along-1e-6)continue;const j=nodes.findIndex((v,k)=>k&&v.along>=along);if(j<1)continue;const a=nodes[j-1],b=nodes[j],t=(along-a.along)/(b.along-a.along);nodes.splice(j,0,{upper:high.line[i],lower:a.lower.map((v,k)=>v+(b.lower[k]-v)*t),along});}
  pairs.push({upperId:high.id,lowerId:low.id,height:high.height,properties:high.properties,nodes: nodes.filter((v,i)=>!i||v.along-nodes[i-1].along>1e-6),relativeHeightFromSource:true,absoluteElevationEstimated:true});
 }
 return pairs;
};
})(typeof self!=='undefined'?self:globalThis);
