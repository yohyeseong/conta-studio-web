/* Cubic height surface in metres. Affine XY uses clamped-knot Greville abscissae. */
function terrainPolygons(polygons){
 // Boolean clipping can leave zero-area numerical slivers. Retain real boundaries.
 const area=ring=>Math.abs(ring.reduce((a,p,i)=>i?a+ring[i-1][0]*p[1]-p[0]*ring[i-1][1]:a,0)/2);
 return polygons.flatMap(poly=>{
  const clean=poly.map(ring=>{
   const tolerance=1e-6,out=[];for(const p of ring)if(!out.length||Math.hypot(p[0]-out.at(-1)[0],p[1]-out.at(-1)[1])>tolerance)out.push(p);
   if(out.length){if(Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])>tolerance)out.push(out[0]);else out[out.length-1]=out[0];}
   return out;
  });
  if(clean[0].length<4||area(clean[0])<1e-8)return [];
  return [[clean[0],...clean.slice(1).filter(r=>r.length>=4&&area(r)>=1e-8)]];
 });
}
function terrainSurface(w,h,n,rawHeight,z0){
 const count=n+1,spans=count-3,knots=[0,0,0,0];
 for(let i=1;i<spans;i++)knots.push(i);knots.push(spans,spans,spans,spans);
 const points=[];
 for(let j=0;j<count;j++)for(let i=0;i<count;i++){
  const gx=(knots[i+1]+knots[i+2]+knots[i+3])/3,gy=(knots[j+1]+knots[j+2]+knots[j+3])/3;
  const x=-w/2+gx/spans*w,y=-h/2+gy/spans*h;
  points.push([x,y,rawHeight(x,y)-z0]);
 }
 function basis(t){
  t=Math.max(0,Math.min(spans,t));let span=t===spans?count-1:3+Math.floor(t);
  const b=[1,0,0,0],left=[0,0,0,0],right=[0,0,0,0];
  for(let j=1;j<=3;j++){left[j]=t-knots[span+1-j];right[j]=knots[span+j]-t;let saved=0;
   for(let r=0;r<j;r++){const v=b[r]/(right[r+1]+left[j-r]);b[r]=saved+right[r+1]*v;saved=left[j-r]*v;}b[j]=saved;
  }return {start:span-3,b};
 }
 const height=(x,y)=>{const u=basis((x+w/2)/w*spans),v=basis((y+h/2)/h*spans);let value=0;
  for(let j=0;j<4;j++)for(let i=0;i<4;i++)value+=u.b[i]*v.b[j]*points[(v.start+j)*count+u.start+i][2];return value+z0;
 };
 return {count,points,height};
}
