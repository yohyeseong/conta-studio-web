import {addOfficialRoads} from './official-roads.js?v=data-oct2';
import {get,inKorea} from './korea-data.js?v=data-oct2';
const ROOT='prepared/20261002/',VERSION='895aa1a4fe0bd79c-prepared2';
export async function preparedData(bounds,kind='model',zoom=16){
 if(!inKorea(bounds))throw Error('전국 데이터 범위 밖입니다.');
 const index=await get(ROOT+'index.json');if(index.schema!==1||index.version!==VERSION||!index.safeOnly||index.sourceDate!=='2026-10-02')throw Error('가공 데이터 버전 불일치');
 const step=kind==='map'?index.mapStep:index.modelStep,[w,s,e,n]=bounds,ids=[];
 for(let x=Math.floor(w/step);x<=Math.floor(e/step);x++)for(let y=Math.floor(s/step);y<=Math.floor(n/step);y++)ids.push({id:x+'_'+y,column:String(kind==='map'?x:Math.floor(x/5))});
 if(ids.length>100)throw Error('선택 영역을 줄이거나 지도를 확대하세요.');
 const catalogs=new Map();await Promise.all([...new Set(ids.map(v=>v.column))].filter(c=>index.columns.includes(c)).map(async c=>{const value=await get(ROOT+kind+'-catalog/'+c+'.json');if(value.version!==VERSION)throw Error('가공 데이터 목록 불일치');catalogs.set(c,value);}));
 const features=new Map(),zones=new Map(),jobs=new Map();const lod='detail';
 for(const v of ids){const catalog=catalogs.get(v.column);if(!catalog)continue;if(kind==='map'){const info=catalog.tiles[v.id]?.[lod];if(info)jobs.set(v.id,{path:'map/'+lod+'/'+v.id+'.json.gz',info});}else for(const id of catalog.tiles[v.id]||[]){const info=catalog.buckets[id];if(!info)throw Error('지역 도형 참조 누락');jobs.set(id,{path:'model/'+id+'.json.gz',info});}}
 if(jobs.size>150)throw Error('선택 지역의 도형이 너무 많습니다. 영역을 줄여주세요.');
 const tasks=[...jobs.values()],concurrency=kind==='model'?8:4;for(let i=0;i<tasks.length;i+=concurrency){const tiles=await Promise.all(tasks.slice(i,i+concurrency).map(v=>get(ROOT+v.path,v.info)));
  for(const tile of tiles){if(!tile)continue;if(tile.schema!==1||tile.version!==VERSION||!tile.safeOnly||!Array.isArray(tile.features))throw Error('가공 지도 검증 실패');for(const z of tile.zones||[])if(MilitaryPolicy.overlaps(z,bounds))zones.set(z.join(','),z);for(const f of tile.features)if(MilitaryPolicy.overlaps(f.bbox,bounds)&&!features.has(f.id))features.set(f.id,f);}
 }
 const geo={type:'FeatureCollection',features:[...features.values()]};return addOfficialRoads({preparedGeo:geo,zones:[...zones.values()],dataVersion:VERSION},bounds);
}
