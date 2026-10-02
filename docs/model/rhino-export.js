function buildRhinoFile(rhino,items,scale){
 if(!Number.isFinite(scale)||scale<1||scale>100000)throw Error('축척 범위를 확인하세요.');
 const doc=new rhino.File3dm();let reopened;
 try{
  doc.applicationName='Conta Studio Web';doc.applicationUrl='https://yohyeseong.github.io/conta-studio-web/model/';
  doc.startSectionComments='OSM contributors / ODbL 1.0; DEM Mapzen/AWS, USGS, NOAA. Estimated context model.';
  doc.settings().modelUnitSystem=rhino.UnitSystem.Millimeters;doc.settings().modelAbsoluteTolerance=0.001;
  const factor=1000/scale;let expected=0;
  for(const item of items){
   const p=item.positions;if(!p.length)continue;
   if(p.length%(item.lines?6:9)||!p.every(Number.isFinite))throw Error('유효하지 않은 모델 좌표');
   const color={r:Math.round(item.color[0]*255),g:Math.round(item.color[1]*255),b:Math.round(item.color[2]*255),a:255};
   const layer=new rhino.Layer();layer.name=item.name;layer.color=color;const index=doc.layers().add(layer);layer.delete();
   const attr=new rhino.ObjectAttributes();attr.name=item.name;attr.layerIndex=index;attr.objectColor=color;attr.colorSource=rhino.ObjectColorSource.ColorFromLayer;
   try{
    if(item.lines){for(let i=0;i<p.length;i+=6){const a=Array.from(p.slice(i,i+3),v=>v*factor),b=Array.from(p.slice(i+3,i+6),v=>v*factor);doc.objects().addLine(a,b,attr);expected++;}}
    else{const mesh=new rhino.Mesh(),lookup=new Map();try{
     const vertex=i=>{const a=[p[i]*factor,p[i+1]*factor,p[i+2]*factor],key=a.join(',');if(!lookup.has(key))lookup.set(key,mesh.vertices().add(...a));return lookup.get(key);};
     for(let i=0;i<p.length;i+=9)mesh.faces().addTriFace(vertex(i),vertex(i+3),vertex(i+6));
     mesh.normals().computeNormals();mesh.compact();doc.objects().addMesh(mesh,attr);expected++;
    }finally{mesh.delete();}}
   }finally{attr.delete();}
  }
  if(!expected)throw Error('표시한 레이어가 없습니다.');
  const options=new rhino.File3dmWriteOptions();let bytes;try{options.version=7;bytes=doc.toByteArrayOptions(options);}finally{options.delete();}
  reopened=rhino.File3dm.fromByteArray(bytes);if(!reopened||reopened.objects().count!==expected)throw Error('Rhino 파일 검증에 실패했습니다.');
  return bytes;
 }finally{if(reopened)reopened.delete();doc.delete();}
}
