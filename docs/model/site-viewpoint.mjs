export function insideBuilding(point,buildings){
 const inside=(ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 return buildings.some(b=>inside(b.poly[0])&&!b.poly.slice(1).some(inside));
}
export function groundHeight(point,objects,terrain){
 let height=-Infinity;for(const [name,o] of Object.entries(objects)){if(name==='건물'||name==='파라펫'||o.isLineSegments)continue;const p=o.geometry.attributes.position.array;
  for(let i=0;i<p.length;i+=9){const ax=p[i],ay=p[i+1],bx=p[i+3],by=p[i+4],cx=p[i+6],cy=p[i+7],den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-10)continue;const a=((by-cy)*(point[0]-cx)+(cx-bx)*(point[1]-cy))/den,b=((cy-ay)*(point[0]-cx)+(ax-cx)*(point[1]-cy))/den,c=1-a-b;if(Math.min(a,b,c)>=-1e-6)height=Math.max(height,a*p[i+2]+b*p[i+5]+c*p[i+8]);}
 }
 if(Number.isFinite(height))return height;
 let nearest=Infinity;for(const p of terrain.points){const d=(p[0]-point[0])**2+(p[1]-point[1])**2;if(d<nearest){nearest=d;height=p[2];}}return Number.isFinite(height)?height:0;
}
