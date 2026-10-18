/* River boundary sampling shared by preview and native CAD exports. */
(function(root){
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++)if((ring[i][1]>p[1])!==(ring[j][1]>p[1])&&p[0]<(ring[j][0]-ring[i][0])*(p[1]-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0])yes=!yes;return yes;}
const contains=(polys,p)=>polys.some(poly=>inside(p,poly[0])&&!poly.slice(1).some(r=>inside(p,r)));
root.riverBankCovered=function(a,b,c,d){const distance=p=>{const x=d[0]-c[0],y=d[1]-c[1],t=Math.max(0,Math.min(1,((p[0]-c[0])*x+(p[1]-c[1])*y)/(x*x+y*y)||0));return Math.hypot(p[0]-c[0]-t*x,p[1]-c[1]-t*y);};return distance(a)<.002&&distance(b)<.002;};
root.riverBankOffset=function(a,b,water,covers,terrain){
 const x=b[0]-a[0],y=b[1]-a[1],length=Math.hypot(x,y);if(length<1e-9)return 0;
 for(const sign of [-1,1]){const probe=[(a[0]+b[0])/2-sign*y/length*.002,(a[1]+b[1])/2+sign*x/length*.002];if(contains(water,probe))continue;
  for(const name of ['횡단보도','경계석','인도','도로','녹지','바다'])if(contains(covers[name]||[],probe))return terrain.sidewalkVolume&&['도로','횡단보도'].includes(name)?-terrain.sidewalkDepth:-(terrain.lowerStep&&['도로','횡단보도','바다'].includes(name)?terrain.interval:0);
 }return 0;
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
