// Apply only fully received and integrity-checked road polygons. Uploaded source
// geometry is applied afterwards and remains the highest-priority boundary.
(function(root){root.applyVerifiedRoadAreas=function(data,{pc,unionAll,xy,rect,covers,gisFeatures}){
 const result={state:data?.state||'unavailable',regions:[],faces:0,complete:data?.complete===true,reason:data?.reason||'',provider:data?.provider||'VWorld',ngii:data?.ngii||'',receivedTiles:data?.receivedTiles||0,expectedTiles:data?.expectedTiles||0};
 if(!data?.regions?.length)return result;
 for(const region of data.regions){const masks=(region.coverage||[region.bbox]).map(([w,s,e,n])=>[[[w,s],[e,s],[e,n],[w,n],[w,s]].map(xy)]),coverage=pc.intersection(unionAll(masks.map(p=>[p])),rect);if(!coverage.length)continue;
  const project=c=>typeof c[0]==='number'?xy(c).map(v=>Math.round(v*1000)/1000):c.map(project),parts=[];
  for(const f of region.features){const g=f.geometry,polys=g.type==='Polygon'?[project(g.coordinates)]:project(g.coordinates);parts.push(pc.intersection(polys,coverage));}
  const roads=unionAll(parts);covers['도로']=unionAll([pc.difference(unionAll(covers['도로']),coverage),roads]);
  result.regions.push({id:region.id,name:region.name,bbox:region.bbox});result.faces+=roads.length;
  for(let i=0;i<roads.length;i++)gisFeatures.push({id:region.id+'/road/'+i,category:'도로',properties:{geometry_source:'VWorld 수신 도로 면',source_layer:'vl_rodway_bndry_1518',source_zoom:18,cartographic:true},point:roads[i][0][0]});
 }
 if(result.regions.length)result.state=data?.complete===false?'partial':'applied';return result;
};})(typeof self!=='undefined'?self:globalThis);
