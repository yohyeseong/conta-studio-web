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
 opened.delete();d.delete();a.delete();b.delete();
})().catch(e=>{console.error(e);process.exit(1)});
