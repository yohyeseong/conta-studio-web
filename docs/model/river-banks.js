/* River boundary sampling shared by preview and native CAD exports. */
(function(root){
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++)if((ring[i][1]>p[1])!==(ring[j][1]>p[1])&&p[0]<(ring[j][0]-ring[i][0])*(p[1]-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0])yes=!yes;return yes;}
const contains=(polys,p)=>polys.some(poly=>inside(p,poly[0])&&!poly.slice(1).some(r=>inside(p,r)));
// Pair a whole lower-bank trace with one continuous shoreline arc. Preserve all
// vertices of both traces; per-panel nearest points can jump across a river bend.
root.riverBankRibbon=function(pair,polygons,maxDistance=20){
 const nodes=pair.nodes;if(nodes.length<2)return nodes;
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 function project(p,r){let best={distance:Infinity},along=0;for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i],vx=b[0]-a[0],vy=b[1]-a[1],len=distance(a,b),t=Math.max(0,Math.min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/(len*len)||0)),q=[a[0]+t*vx,a[1]+t*vy],d=distance(p,q);if(d<best.distance)best={distance:d,along:along+t*len,point:q};along+=len;}return {...best,total:along};}
 const probe=[nodes[0].lower,nodes[Math.floor(nodes.length/2)].lower,nodes.at(-1).lower];let best;
 for(const poly of polygons)for(const ring of poly){const projections=probe.map(p=>project(p,ring));if(projections.some(p=>p.distance>maxDistance))continue;const score=projections.reduce((s,p)=>s+p.distance,0);if(!best||score<best.score)best={ring,projections,score};}
 if(!best)return nodes;const {ring,projections:[start,,end]}=best,total=start.total;
 let delta=(end.along-start.along+total)%total;if(delta>total/2)delta-=total;
 const lowerLengths=[0];for(let i=1;i<nodes.length;i++)lowerLengths.push(lowerLengths.at(-1)+distance(nodes[i-1].lower,nodes[i].lower));const lowerLength=lowerLengths.at(-1);
 if(Math.abs(delta)<1e-5||Math.abs(delta)>Math.max(lowerLength*2,lowerLength+40))return nodes;
 const water=[{t:0,point:start.point},{t:1,point:end.point}];let along=0;
 for(let i=1;i<ring.length;i++){along+=distance(ring[i-1],ring[i]);let relative=delta>0?(along-start.along+total)%total:-((start.along-along+total)%total),t=relative/delta;if(t>1e-8&&t<1-1e-8)water.push({t,point:ring[i]});}
 water.sort((a,b)=>a.t-b.t);const lower=nodes.map((node,i)=>({...node,t:lowerLengths[i]/lowerLength})),ts=[...lower.map(p=>p.t),...water.map(p=>p.t)].sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-8);
 function sample(list,t,key){let i=1;while(i<list.length-1&&list[i].t<t)i++;const a=list[i-1],b=list[i],u=(t-a.t)/(b.t-a.t),A=a[key],B=b[key];return A.map((v,j)=>v+(B[j]-v)*u);}
 return ts.map(t=>({upper:sample(lower,t,'upper'),lower:sample(lower,t,'lower'),water:sample(water,t,'point'),along:t*lowerLength}));
};
// Subtract the union of covered shoreline intervals, including collinear panels.
root.riverBankOpenIntervals=function(a,b,panels){
 const vx=b[0]-a[0],vy=b[1]-a[1],l2=vx*vx+vy*vy,length=Math.sqrt(l2);if(length<1e-9)return [];
 const along=p=>((p[0]-a[0])*vx+(p[1]-a[1])*vy)/l2,off=p=>Math.abs((p[0]-a[0])*vy-(p[1]-a[1])*vx)/length,ranges=[];
 for(const p of panels||[]){if(!p.waterA||off(p.waterA)>.002||off(p.waterB)>.002)continue;const u=along(p.waterA),v=along(p.waterB),lo=Math.max(0,Math.min(u,v)),hi=Math.min(1,Math.max(u,v));if(hi>lo)ranges.push([lo,hi]);}
 ranges.sort((a,b)=>a[0]-b[0]);let end=0;const open=[],tol=.002/length;
 for(const [lo,hi] of ranges){if(lo>end+tol)open.push([end,lo]);end=Math.max(end,hi);}if(end<1-tol)open.push([end,1]);return open;
};
root.riverBankCovered=function(a,b,c,d){const distance=p=>{const x=d[0]-c[0],y=d[1]-c[1],t=Math.max(0,Math.min(1,((p[0]-c[0])*x+(p[1]-c[1])*y)/(x*x+y*y)||0));return Math.hypot(p[0]-c[0]-t*x,p[1]-c[1]-t*y);};return distance(a)<.002&&distance(b)<.002;};
root.riverBankOffset=function(a,b,water,covers,terrain){
 const x=b[0]-a[0],y=b[1]-a[1],length=Math.hypot(x,y);if(length<1e-9)return 0;
 for(const sign of [-1,1]){const probe=[(a[0]+b[0])/2-sign*y/length*.002,(a[1]+b[1])/2+sign*x/length*.002];if(contains(water,probe))continue;
  for(const name of ['횡단보도','경계석','인도','도로','녹지','바다'])if(contains(covers[name]||[],probe))return terrain.sidewalkVolume&&['도로','횡단보도'].includes(name)?-terrain.sidewalkDepth:-(terrain.lowerStep&&['도로','횡단보도','바다'].includes(name)?terrain.interval:0);
 }return -(terrain.groundDepth||0);
};
root.riverBankSegments=function(a,b,w,h,n){
 const dx=w/n,dy=h/n,ts=[0,1],vx=b[0]-a[0],vy=b[1]-a[1],add=t=>{if(t>1e-10&&t<1-1e-10)ts.push(t);};
 if(Math.abs(vx)>1e-12)for(let i=1;i<n;i++)add((-w/2+i*dx-a[0])/vx);
 if(Math.abs(vy)>1e-12)for(let j=1;j<n;j++)add((-h/2+j*dy-a[1])/vy);
 const start=(a[1]+h/2)/dy-(a[0]+w/2)/dx,delta=vy/dy-vx/dx;
 if(Math.abs(delta)>1e-12)for(let k=-n;k<=n;k++)add((k-start)/delta);
 const values=ts.sort((a,b)=>a-b).filter((t,i,all)=>!i||t-all[i-1]>1e-10),at=t=>[a[0]+vx*t,a[1]+vy*t];
 return values.slice(1).map((t,i)=>[at(values[i]),at(t)]);
};
})(typeof self!=='undefined'?self:globalThis);
