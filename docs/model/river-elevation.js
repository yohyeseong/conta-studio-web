/* Estimated reach levels, not surveyed water level or bed depth. */
(function(root){
root.estimateRiverLevels=function(polygons,data,{xy,bankHeight,z0,interval,stepped,w,h,n}){
 const refs=(data.elevationFeatures||[]).map(f=>({height:f.properties.elevation,point:f.geometry.type==='Point'?xy(f.geometry.coordinates):null,lines:f.geometry.type==='MultiLineString'?f.geometry.coordinates.map(r=>r.map(xy)):[]})).filter(f=>Number.isFinite(f.height));
 if(!refs.length)throw Error('높이 추정용 등고선·표고점이 있는 ZIP을 먼저 불러오세요.');
 const dist=(p,a,b)=>{const x=b[0]-a[0],y=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y)||0));return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);};
 const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])yes=!yes;return yes;};
 function height(p){const nearest=new Map();for(const f of refs){let distance=f.point?Math.hypot(p[0]-f.point[0],p[1]-f.point[1]):Infinity;for(const r of f.lines)for(let i=1;i<r.length;i++)distance=Math.min(distance,dist(p,r[i-1],r[i]));const key=f.point?'point:'+f.point.join(','):'contour:'+f.height,previous=nearest.get(key);if(!previous||distance<previous.distance)nearest.set(key,{distance,height:f.height});}const values=[...nearest.values()].sort((a,b)=>a.distance-b.distance).slice(0,8);if(!values.length||values[0].distance>1000)return null;if(values[0].distance<.001)return values[0].height;let sum=0,total=0;for(const v of values){const weight=1/Math.max(1,v.distance)**2;sum+=v.height*weight;total+=weight;}return sum/total;}
 const surfaces=[];
 for(const poly of polygons){
  const samples=[];for(const r of poly)for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/20));for(let j=0;j<steps;j++)samples.push([a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps]);}
  // Include interior grid points so the level cannot exceed a valley within a reach.
  const banks=[...samples];for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const p=[-w/2+i*w/n,-h/2+j*h/n];if(inside(p,poly[0])&&!poly.slice(1).some(r=>inside(p,r)))banks.push(p);}
  const stride=Math.max(1,Math.ceil(samples.length/256)),estimates=samples.filter((_,i)=>i%stride===0).map(height).filter(v=>v!==null).sort((a,b)=>a-b);if(!estimates.length)throw Error('하천 주변 1km 안에 표고 자료가 없습니다. 해당 지역의 수치지도 ZIP을 불러오세요.');
  const interpolated=estimates[Math.floor((estimates.length-1)*.25)],bankLimit=banks.reduce((min,p)=>Math.min(min,bankHeight(...p)),Infinity);let absoluteLevel=Math.min(interpolated,bankLimit);if(stepped)absoluteLevel=z0+Math.floor((absoluteLevel-z0+1e-8)/interval)*interval;
  surfaces.push({poly,level:absoluteLevel-z0,absoluteLevel,interpolated,bankLimit,sampleCount:estimates.length,estimated:true});
 }
 return {enabled:true,method:'nearby-contour-spot-idw-lower-quartile-bank-cap',estimated:true,contours:refs.filter(f=>!f.point).length,spots:refs.filter(f=>f.point).length,surfaces};
};
})(typeof self!=='undefined'?self:globalThis);
