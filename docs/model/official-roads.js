import {get} from './korea-data.js?v=data-oct2';
const ROOT='supplemental/official-roads-20260914/',VERSION='official-roads-20260914-safe-v1';
export async function addOfficialRoads(value,bounds){
 const index=await get(ROOT+'index.json');if(index.schema!==1||index.version!==VERSION||index.safeOnly!==true||index.sourceDate!=='2026-09-14'||index.widthKnown!==false)throw Error('공식 도로 자료 검증 실패');
 const [w,s,e,n]=bounds,step=index.step,ids=[];for(let x=Math.floor(w/step);x<=Math.floor(e/step);x++)for(let y=Math.floor(s/step);y<=Math.floor(n/step);y++)ids.push(x+'_'+y);
 if(ids.length>100)throw Error('공식 도로 조회 영역이 너무 큽니다.');
 const catalogs=new Map();await Promise.all([...new Set(ids.map(id=>id.split('_')[0]))].filter(c=>index.columns.includes(c)).map(async c=>{const cat=await get(ROOT+'catalog/'+c+'.json');if(cat.version!==VERSION)throw Error('공식 도로 목록 불일치');catalogs.set(c,cat.tiles);}));
 const features=new Map(value.preparedGeo.features.map(f=>[f.id,f]));
 for(let i=0;i<ids.length;i+=4){const tiles=await Promise.all(ids.slice(i,i+4).map(async id=>{const info=catalogs.get(id.split('_')[0])?.[id];return info?get(ROOT+'tiles/'+id+'.json.gz',info):null;}));for(const tile of tiles){if(!tile)continue;if(tile.schema!==1||tile.version!==VERSION||!tile.safeOnly||!Array.isArray(tile.features))throw Error('공식 도로 지역 자료 검증 실패');for(const f of tile.features){if(f.geometry?.type!=='LineString'||MilitaryPolicy.tagged(f.properties))throw Error('공식 도로 도형 검증 실패');if(MilitaryPolicy.overlaps(f.bbox,bounds)&&!features.has(f.id))features.set(f.id,f);}}}
 return {...value,preparedGeo:{type:'FeatureCollection',features:[...features.values()]},officialRoadVersion:VERSION};
}
