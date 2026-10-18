/* Provisional zebra stripes inside source crosswalk polygons.
 * Orientation comes from the original (unclipped) minimum-area rectangle.
 * Replace this synthesis with surveyed marking geometry when an API provides it.
 */
(function(root){
root.crosswalkStripes=function(polygons,pc,unionAll){
 const stripes=[];
 for(const poly of polygons){
  const points=poly[0].slice(0,-1);if(points.length<3)continue;
  let best=null;
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-6)continue;
   const ux=(b[0]-a[0])/length,uy=(b[1]-a[1])/length,coords=points.map(p=>[p[0]*ux+p[1]*uy,-p[0]*uy+p[1]*ux]),lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
   for(const q of coords)for(let k=0;k<2;k++){lo[k]=Math.min(lo[k],q[k]);hi[k]=Math.max(hi[k],q[k]);}
   const area=(hi[0]-lo[0])*(hi[1]-lo[1]);if(!best||area<best.area-1e-8)best={ux,uy,lo,hi,area};
  }
  if(!best)continue;
  let {ux,uy,lo,hi}=best;
  // Repeat along the crossing's long axis; each bar spans its short axis.
  if(hi[1]-lo[1]>hi[0]-lo[0]){[ux,uy]=[-uy,ux];[lo,hi]=[[lo[1],-hi[0]],[hi[1],-lo[0]]];}
  const length=hi[0]-lo[0],breadth=hi[1]-lo[1],width=.5,gap=.5,inset=Math.min(.25,breadth*.1),count=Math.floor((length-.4+gap)/(width+gap));
  if(count<1||count>1000||breadth<=inset*2)continue;
  const start=(lo[0]+hi[0]-(count*width+(count-1)*gap))/2,world=(u,v)=>[u*ux-v*uy,u*uy+v*ux];
  for(let i=0;i<count;i++){
   const u=start+i*(width+gap),v=lo[1]+inset,end=hi[1]-inset,ring=[world(u,v),world(u+width,v),world(u+width,end),world(u,end),world(u,v)];
   stripes.push(pc.intersection([poly],[[ring]]));
  }
 }
 return unionAll(stripes);
};
})(typeof self!=='undefined'?self:globalThis);
