// Apply the uploaded road footprint after building ordinary fallback roads.
(function(root){
root.applyNgiiRoads=function(data,ctx){
 if(!data)return null;
 const {pc,unionAll,bufferLine,xy,rect,covers,gisFeatures}=ctx,[west,south,east,north]=data.bbox;
 if(![west,south,east,north].every(Number.isFinite)||west>=east||south>=north)throw Error('불러온 도로 자료의 범위가 올바르지 않습니다.');
 const project=c=>typeof c[0]==='number'?xy(c):c.map(project),coverage=[[[[west,south],[east,south],[east,north],[west,north],[west,south]].map(xy)]],roads=[],sidewalks=[];
 let roadCount=0,sidewalkCount=0;
 for(const f of data.features){
  if(MilitaryPolicy.tagged(f.properties))throw Error('불러온 자료에 제외 대상 태그가 있습니다.');
  const g=f.geometry,p=f.properties||{};let polygons=[];
  if(g.type==='Polygon')polygons=[project(g.coordinates)];else if(g.type==='MultiPolygon')polygons=project(g.coordinates);
  else if(p.ngii_kind==='sidewalk'&&['LineString','MultiLineString'].includes(g.type)){
   const width=Number(p.width);if(!(width>0&&width<=100))throw Error('인도의 원본 폭이 올바르지 않습니다.');
   for(const line of g.type==='LineString'?[g.coordinates]:g.coordinates)polygons.push(...bufferLine(line.map(xy),width));
  }
  if(!polygons.length)continue;const clipped=pc.intersection(polygons,rect);if(!clipped.length)continue;
  if(p.ngii_kind==='road'){roads.push(clipped);roadCount++;}else if(p.ngii_kind==='sidewalk'){sidewalks.push(clipped);sidewalkCount++;}else continue;
  const b=f.bbox,point=xy([(b[0]+b[2])/2,(b[1]+b[3])/2]);gisFeatures.push({id:f.id,category:p.ngii_kind==='road'?'도로':'인도',properties:p,point});
 }
 // Keep server roads outside the source bounding rectangle only. In the source
 // rectangle, never union guessed-width strips over the original SHP boundary.
 covers['도로']=unionAll([pc.difference(unionAll(covers['도로']),coverage),...roads]);
 covers['인도']=unionAll(sidewalks);
 if(covers['인도'].length)covers['도로']=pc.difference(covers['도로'],covers['인도']);
 for(const f of data.references||[]){if(MilitaryPolicy.tagged(f.properties))continue;const b=f.bbox;gisFeatures.push({id:f.id,category:'기타 GIS',properties:{...f.properties,reference_only:true},point:xy([(b[0]+b[2])/2,(b[1]+b[3])/2]),geometry:{type:f.geometry.type,coordinates:project(f.geometry.coordinates)}});}
 return {roads:roadCount,sidewalks:sidewalkCount};
};
})(typeof self!=='undefined'?self:globalThis);
