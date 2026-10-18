// Rhino surfaces and solids are native Breps; linework is curves. No mesh fallback.
function buildRhinoFile(rhino,items,scale,cad){
 if(!cad?.terrain||!Array.isArray(cad.buildings))throw Error("모델을 다시 생성한 뒤 저장하세요.");
 if(!Number.isFinite(scale)||scale<1||scale>100000)throw Error('축척 범위를 확인하세요.');
 const doc=new rhino.File3dm();let reopened;
 try{
  doc.applicationName='Conta Studio Web';doc.applicationUrl='https://yohyeseong.github.io/conta-studio-web/model/';
  doc.startSectionComments='Ministry of Land, Infrastructure and Transport GIS integrated building information, VWorld (2026-09-09), official footprints/heights/floors prioritized; OSM contributors / ODbL 1.0; Republic of Korea Ministry of Land standard node/link roads (2026-09-14); Copernicus GLO-30 DSM: Produced using Copernicus WorldDEM-30; copyright DLR e.V. 2010-2014 and Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA; all rights reserved. Other regions: Mapzen/AWS, USGS, NOAA. Estimated context model.';
  doc.settings().modelUnitSystem=rhino.UnitSystem.Millimeters;doc.settings().modelAbsoluteTolerance=0.001;
  const factor=1000/scale;let expected=0;const brepIndices=new Set(),solidIndices=new Set();
  for(const item of items){
   const p=item.positions;if(!p.length)continue;
   if(p.length%(item.lines?6:9)||!p.every(Number.isFinite))throw Error('유효하지 않은 모델 좌표');
   const color={r:Math.round(item.color[0]*255),g:Math.round(item.color[1]*255),b:Math.round(item.color[2]*255),a:255};
   const material=new rhino.Material();material.name=item.name;material.diffuseColor=color;material.ambientColor=color;material.transparency=0;material.reflectivity=0;material.shine=0;const materialIndex=doc.materials().add(material);material.delete();
   const layer=new rhino.Layer();layer.name=item.name;layer.color=color;layer.plotColor=color;layer.renderMaterialIndex=materialIndex;const index=doc.layers().add(layer);layer.delete();
   const attr=new rhino.ObjectAttributes();attr.name=item.name;attr.layerIndex=index;attr.objectColor=color;attr.colorSource=rhino.ObjectColorSource.ColorFromLayer;attr.plotColor=color;attr.materialIndex=materialIndex;attr.materialSource=rhino.ObjectMaterialSource.MaterialFromLayer;attr.wireDensity=-1;
   try{
    const add=(brep,name)=>{attr.name=name;brepIndices.add(expected);if(brep.isSolid)solidIndices.add(expected);doc.objects().addBrep(brep,attr);expected++;};
    if(item.name==='대지'){cadTerrain(rhino,cad.terrain,factor,add);if(cad.riverEstimate?.banksConnected)cadRiverBanks(rhino,cad.terrain,cad.riverEstimate,factor,add);}
    else if(item.name==='건물'){for(let i=0;i<cad.buildings.length;i++){const b=cadBuilding(rhino,cad.buildings[i],factor);try{add(b,'건물 '+(i+1));}finally{b.delete();}}}
    else if(item.name==='하천'&&cad.riverEstimate?.enabled){for(const reach of cad.riverEstimate.surfaces){const b=cadBuilding(rhino,{poly:reach.poly,bottom:cad.terrain.base,roof:reach.level},factor);try{add(b,'하천 · 표고 자료 기반 높이 추정');}finally{b.delete();}}}
    else if(item.name==='파라펫'){for(const wall of cad.parapets||[]){const b=cadBuilding(rhino,wall,factor);try{add(b,'파라펫');}finally{b.delete();}}}
    else if(['도로','인도','경계석','횡단보도','녹지','하천','철도','바다'].includes(item.name)){if(!cad.covers?.[item.name])throw Error('모델을 다시 생성한 뒤 저장하세요.');cadCover(rhino,cad.terrain,cad.covers[item.name],factor,add,item.name);}
    else if(item.lines){
     let chain=[];const same=(a,b)=>a&&b&&a.every((v,i)=>v===b[i]);
     const flush=()=>{if(chain.length>1){const curve=new rhino.PolylineCurve(chain);try{if(!curve.isValid)throw Error('원본 선 검증에 실패했습니다.');doc.objects().addCurve(curve,attr);expected++;}finally{curve.delete();}}chain=[];};
     for(let i=0;i<p.length;i+=6){const a=Array.from(p.slice(i,i+3),v=>v*factor),b=Array.from(p.slice(i+3,i+6),v=>v*factor);if(same(a,b))continue;if(chain.length&&!same(chain.at(-1),a))flush();if(!chain.length)chain.push(a);chain.push(b);}flush();
    }
    else{throw Error(item.name+' 레이어의 NURBS 저장 형식이 준비되지 않았습니다. 메시로 자동 변환하지 않습니다.');}
   }finally{attr.delete();}
  }
  if(!expected)throw Error('표시한 레이어가 없습니다.');
  const options=new rhino.File3dmWriteOptions();let bytes;try{options.version=7;bytes=doc.toByteArrayOptions(options);}finally{options.delete();}
  reopened=rhino.File3dm.fromByteArray(bytes);if(!reopened||reopened.objects().count!==expected)throw Error('Rhino 파일 검증에 실패했습니다.');
  for(let i=0;i<reopened.objects().count;i++){const object=reopened.objects().get(i);if(!object)throw Error('Rhino 객체 읽기 실패: '+i+' / '+expected);const geometry=object.geometry();if(!geometry)throw Error('Rhino 도형 읽기 실패: '+i+' / '+expected);try{if(!geometry.isValid)throw Error('저장된 객체 검증에 실패했습니다.');if(brepIndices.has(i)&&typeof geometry.isSurface!=='boolean')throw Error('NURBS 저장 형식 검증에 실패했습니다.');if(solidIndices.has(i)&&(!geometry.isSolid||!geometry.isManifold))throw Error('닫힌 폴리서피스 검증에 실패했습니다.');}finally{geometry.delete();}}
  return bytes;
 }finally{if(reopened)reopened.delete();doc.delete();}
}


