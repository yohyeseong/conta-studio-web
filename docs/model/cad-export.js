function cadBuilding(r,building,factor){
 const e=new r.Extrusion();
 try{
  for(let i=0;i<building.poly.length;i++){
   let ring=building.poly[i].map(p=>[p[0]*factor,p[1]*factor,0]);
   const area=ring.reduce((sum,p,j)=>j?sum+ring[j-1][0]*p[1]-p[0]*ring[j-1][1]:sum,0);
   if((i===0&&area<0)||(i>0&&area>0))ring.reverse();
   const curve=new r.PolylineCurve(ring);
   try{if(!(i===0?e.setOuterProfile(curve,true):e.addInnerProfile(curve)))throw Error('건물 외곽선 처리에 실패했습니다.');}finally{curve.delete();}
  }
  if(!e.setPathAndUp([0,0,building.bottom*factor],[0,0,building.roof*factor],[0,1,0]))throw Error('건물 높이 처리에 실패했습니다.');
  const brep=e.toBrep(true);
  if(!brep||!brep.isValid||!brep.isSolid){if(brep)brep.delete();throw Error('건물 솔리드 검증에 실패했습니다.');}
  return brep;
 }finally{e.delete();}
}

function cadTerrain(r,terrain,factor,add){
 if(terrain.bands){
  for(const band of terrain.bands)for(const poly of band.polygons){const solid=cadBuilding(r,{poly,bottom:terrain.base,roof:band.level},factor);try{add(solid,'대지 · 계단 '+band.level+'m');}finally{solid.delete();}}
  return;
 }
 terrain={...terrain,polygons:terrainPolygons(terrain.polygons)};
 const {count,points,w,h,base}=terrain;
 const surface=r.NurbsSurface.create(3,false,4,4,count,count);
 try{
  surface.knotsU().createUniformKnots(1);surface.knotsV().createUniformKnots(1);
  for(let j=0;j<count;j++)for(let i=0;i<count;i++){
   const p=points[j*count+i];surface.points().set(i,j,[p[0]*factor,p[1]*factor,p[2]*factor,1]);
  }
  if(terrain.polygons.length){
   const top=r.createTerrainBrep({...terrain,factor});
   if(!top||!top.isValid){if(top)top.delete();throw Error('지형 경계 면 검증에 실패했습니다.');}
   try{add(top,'대지 · 매끄러운 지형');}finally{top.delete();}
  }
  // Four continuous ruled perimeter walls and one planar base retain the model pedestal.
  for(const [direction,parameter] of [[0,0],[0,count-3],[1,0],[1,count-3]]){
   const top=surface.isoCurve(direction,parameter),edge=[];
   for(let k=0;k<count;k++){
    const i=direction===0?k:(parameter===0?0:count-1),j=direction===0?(parameter===0?0:count-1):k,p=points[j*count+i];
    edge.push([p[0]*factor,p[1]*factor,base*factor]);
   }
   const bottom=r.NurbsCurve.create(false,3,edge);let wall,brep;
   try{wall=r.NurbsSurface.createRuledSurface(top,bottom);brep=r.Brep.createFromSurface(wall);if(!brep||!brep.isValid)throw Error('지형 옆면 검증에 실패했습니다.');add(brep,'대지 · 옆면');}
   finally{if(brep)brep.delete();if(wall)wall.delete();bottom.delete();top.delete();}
  }
  const boundary=new r.PolylineCurve([[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2],[-w/2,-h/2]].map(p=>[p[0]*factor,p[1]*factor,base*factor]));
  const plane=r.Plane.worldXY();plane.origin=[0,0,base*factor];let bottom;
  try{bottom=r.Brep.createTrimmedPlane(plane,boundary);if(!bottom||!bottom.isValid)throw Error('지형 바닥 검증에 실패했습니다.');add(bottom,'대지 · 바닥');}
  finally{if(bottom)bottom.delete();boundary.delete();}
 }finally{surface.delete();}
}

function cadCover(r,terrain,polygons,factor,add,name){
 if(terrain.bands){
  for(const band of terrain.bands){const polys=band.covers[name];if(!polys?.length)continue;
   if(name==='철도'){cadCover(r,{...terrain,bands:null,points:terrain.points.map(p=>[p[0],p[1],band.level])},polys,factor,add,name);continue;}
   for(const poly of polys){const offset=terrain.sidewalkVolume&&['도로','횡단보도'].includes(name)?terrain.sidewalkDepth:(terrain.lowerStep&&['도로','횡단보도','하천','바다'].includes(name)?terrain.interval:0);const solid=cadBuilding(r,{poly,bottom:(name==='경계석'||terrain.sidewalkVolume&&name==='인도')?band.level-.2:terrain.base,roof:band.level-offset},factor);try{add(solid,name);}finally{solid.delete();}}
  }return;
 }
 const clean=terrainPolygons(polygons);if(!clean.length)return;
 if(name==='경계석'||terrain.sidewalkVolume&&name==='인도'){
  if(typeof r.createTerrainSolidBrep!=='function')throw Error('NURBS 저장 모듈을 새로 불러온 뒤 다시 저장하세요.');
  for(const poly of clean){const solid=r.createTerrainSolidBrep({...terrain,points:terrain.points,polygons:[poly],factor,solidThickness:.2});
   if(!solid||!solid.isValid||!solid.isSolid||!solid.isManifold){if(solid)solid.delete();throw Error('200mm 인도 NURBS 솔리드 검증에 실패했습니다.');}
   try{add(solid,name+' · 200mm NURBS 솔리드');}finally{solid.delete();}
  }return;
 }
 const offset=terrain.sidewalkVolume&&['도로','횡단보도'].includes(name)?terrain.sidewalkDepth:(terrain.lowerStep&&['도로','횡단보도','하천','바다'].includes(name)?terrain.interval:0);
 const points=terrain.points.map(p=>[p[0],p[1],p[2]-offset]);
 const brep=r.createTerrainBrep({...terrain,points,polygons:clean,factor});
 if(!brep||!brep.isValid){if(brep)brep.delete();throw Error(name+' 경계 면 검증에 실패했습니다.');}
 try{add(brep,name);}finally{brep.delete();}
}


// Exact terrain edge curves are lofted to the flat river edge. Preserve NURBS.
function cadRiverBanks(r,terrain,estimate,factor,add){
 const water=estimate.bankCovers['하천'];
 for(const reach of estimate.surfaces){
  const top=r.createTerrainBrep({...terrain,polygons:[reach.poly],factor});
  if(!top||!top.isValid){if(top)top.delete();throw Error('하천 연결 경계를 만들 수 없습니다.');}
  try{for(let i=0;i<top.edges().count;i++){
   const edge=top.edges().get(i);let upper,lower,wall,brep,flatten;
   try{
    const a=edge.pointAtStart.map(v=>v/factor),b=edge.pointAtEnd.map(v=>v/factor);
    if([0,1].some(k=>Math.abs(Math.abs(a[k])-(k?terrain.h:terrain.w)/2)<1e-6&&Math.abs(a[k]-b[k])<1e-6))continue;
    upper=edge.toNurbsCurve();const offset=riverBankOffset(a,b,water,estimate.bankCovers,terrain);if(offset)upper.translate([0,0,offset*factor]);
    const domain=upper.domain,difference=Array.from({length:9},(_,j)=>Math.abs(upper.pointAt(domain[0]+(domain[1]-domain[0])*j/8)[2]-reach.level*factor));
    if(Math.max(...difference)<1e-7)continue;
    lower=edge.toNurbsCurve();flatten=r.Transform.identity();flatten.m22=0;flatten.m23=reach.level*factor;if(!lower.transform(flatten))throw Error('하천 연결 경계 높이 처리 실패');
    wall=r.NurbsSurface.createRuledSurface(upper,lower);brep=r.Brep.createFromSurface(wall);if(!brep||!brep.isValid)throw Error('하천 연결 NURBS 면 검증 실패');add(brep,'하천과 대지 연결면');
   }finally{if(brep)brep.delete();if(wall)wall.delete();if(flatten)flatten.delete();if(lower)lower.delete();if(upper)upper.delete();edge.delete();}
  }}finally{top.delete();}
 }
}
