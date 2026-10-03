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
