const fs=require('fs'),path=require('path'),assert=require('assert');
(async()=>{
 const r=await require(path.resolve('runtime/terrain-cad.js'))({wasmBinary:fs.readFileSync('runtime/terrain-cad.wasm')});
 const points=[];for(let j=0;j<4;j++)for(let i=0;i<4;i++)points.push([i*10/3-5,j*10/3-5,i*j*.17]);
 const outer=[[-5,-5],[5,-5],[5,5],[-5,5],[-5,-5]],hole=[[-2,-1],[-1,2],[2,1],[1,-2],[-2,-1]];
 const b=r.createTerrainBrep({count:4,w:10,h:10,factor:1,points,polygons:[[outer,hole]]});
 assert(b&&b.isValid,'trimmed terrain must be valid');assert.equal(b.faces().count,1);assert.equal(b.faces().get(0).loops.count,2);
 const surface=b.faces().get(0).underlyingSurface();assert.equal(surface.degree(0),3);assert.equal(surface.degree(1),3);surface.delete();
 const d=new r.File3dm(),a=new r.ObjectAttributes();d.objects().addBrep(b,a);
 const bytes=d.toByteArray(),opened=r.File3dm.fromByteArray(bytes);assert.equal(opened.objects().count,1);
 fs.writeFileSync('runtime/trimmed-smoke.3dm',bytes);console.log('Valid trimmed bicubic NURBS face with an oblique inner hole, saved and reopened.');
 for(const count of [4,7])for(const factor of [1,1000]){
  const spans=count-3,knots=[0,0,0,0];for(let k=1;k<spans;k++)knots.push(k);knots.push(spans,spans,spans,spans);
  const points=[];for(let j=0;j<count;j++)for(let i=0;i<count;i++){const x=-5+(knots[i+1]+knots[i+2]+knots[i+3])/3/spans*10,y=-5+(knots[j+1]+knots[j+2]+knots[j+3])/3/spans*10;points.push([x,y,.03*x*x+.02*y*y+.01*x*y]);}
  const solid=r.createTerrainSolidBrep({count,w:10,h:10,factor,points,polygons:[[outer,hole]],solidThickness:.2});
  assert(solid&&solid.isValid,'curved sidewalk solid must be valid');assert(solid.isSolid,'sidewalk must be a closed oriented solid');assert(solid.isManifold,'sidewalk solid must be manifold');
  const top=solid.faces().get(0).underlyingSurface(),bottom=solid.faces().get(1).underlyingSurface();assert.equal(top.degree(0),3);assert.equal(top.degree(1),3);
  const u=spans*.3,v=spans*.6,at=top.pointAt(u,v),low=bottom.pointAt(spans-u,v);assert(Math.abs(at[0]-low[0])<1e-6);assert(Math.abs(at[1]-low[1])<1e-6);assert(Math.abs(at[2]-low[2]-.2*factor)<1e-6,'vertical thickness must be 200mm before scale');top.delete();bottom.delete();
  const doc=new r.File3dm(),attr=new r.ObjectAttributes();doc.objects().addBrep(solid,attr);const bytes=doc.toByteArray(),read=r.File3dm.fromByteArray(bytes),geometry=read.objects().get(0).geometry();assert(geometry.isValid&&geometry.isSolid&&geometry.isManifold,'saved NURBS solid must reopen valid and closed');
  fs.writeFileSync('runtime/solid-'+count+'-'+factor+'.3dm',bytes);console.log('Verified 200mm closed bicubic NURBS solid with a hole, count',count,'scale factor',factor,'faces',solid.faces().count);geometry.delete();read.delete();attr.delete();doc.delete();solid.delete();
 }
 opened.delete();d.delete();a.delete();b.delete();
})().catch(e=>{console.error(e);process.exit(1)});

