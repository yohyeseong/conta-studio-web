import {get} from './korea-data.js?v=packed2';
const ROOT='city-map/20261002/',VERSION='895aa1a4fe0bd79c-city1';
export async function cityMap(bounds){
 const index=await get(ROOT+'index.json');if(index.version!==VERSION||!index.safeOnly||!index.complete||index.step!==.1)throw Error('도시 지도 목록 검증 실패');
 const [w,s,e,n]=bounds,x0=Math.floor(w/.1),x1=Math.floor(e/.1),y0=Math.floor(s/.1),y1=Math.floor(n/.1),jobs=[];
 if((x1-x0+1)*(y1-y0+1)>256)throw Error('지도를 조금 확대하세요.');
 for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const id=x+'_'+y,info=index.tiles[id];if(info)jobs.push({id,info});}
 const features=[];for(let i=0;i<jobs.length;i+=8){const rows=await Promise.all(jobs.slice(i,i+8).map(j=>get(ROOT+'tiles/'+j.id+'.json.gz',j.info)));for(const row of rows){if(row.version!==VERSION||!row.safeOnly||!Array.isArray(row.features))throw Error('도시 지도 도형 검증 실패');features.push(...row.features);}}
 return {type:'FeatureCollection',features,bounds:[x0*.1,y0*.1,(x1+1)*.1,(y1+1)*.1]};
}
