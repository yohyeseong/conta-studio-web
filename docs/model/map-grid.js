import {get,inKorea} from './korea-data.js?v=packed2';
const ROOT='map-grid/20261002/',VERSION='895aa1a4fe0bd79c-mapgrid1';
export async function mapGrid(bounds){
 if(!inKorea(bounds))throw Error('전국 지도 범위 밖입니다.');
 const [w,s,e,n]=bounds,ids=[];for(let x=Math.floor(w/.01);x<=Math.floor(e/.01);x++)for(let y=Math.floor(s/.01);y<=Math.floor(n/.01);y++)ids.push({id:x+'_'+y,parent:Math.floor(x/5)+'_'+Math.floor(y/5)});
 if(ids.length>100)throw Error('지도를 더 확대해 주세요.');
 const parents=[...new Set(ids.map(i=>i.parent))],catalogs=new Map();
 const index=await get(ROOT+'index.json');if(index.schema!==1||index.version!==VERSION||!index.safeOnly||!index.complete||index.sourceDate!=='2026-10-02'||index.step!==.01||!index.catalogRows)throw Error('작은 구역 지도 검증 실패');
 await Promise.all(parents.filter(p=>{const [x,y]=p.split('_');return (index.catalogRows[x]||[]).some(([a,b])=>+y>=a&&+y<=b);}).map(async p=>{const cat=await get(ROOT+'catalog/'+p+'.json');if(cat.schema!==1||cat.version!==VERSION)throw Error('작은 지도 목록 불일치');catalogs.set(p,cat.tiles);}));
 const jobs=ids.map(i=>({id:i.id,info:catalogs.get(i.parent)?.[i.id]})).filter(j=>j.info),features=[];
 for(let i=0;i<jobs.length;i+=8){const tiles=await Promise.all(jobs.slice(i,i+8).map(j=>get(ROOT+'tiles/'+j.id+'.json.gz',j.info)));for(const tile of tiles){if(tile.schema!==1||tile.version!==VERSION||!tile.safeOnly||!Array.isArray(tile.features))throw Error('작은 지도 도형 검증 실패');for(const f of tile.features)if(MilitaryPolicy.overlaps(f.bbox,bounds)){if(MilitaryPolicy.tagged(f.properties))throw Error('지도 제외 대상 검증 실패');features.push(f);}}}
 return {type:'FeatureCollection',features};
}

