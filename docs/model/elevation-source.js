import {get,inKorea} from './korea-data.js?v=map-small1';
const ROOT='elevation/glo30-2021/',BASE='https://raw.githubusercontent.com/yohyeseong/conta-studio-web/korea-data/';
export async function elevationPlan(bounds,jobs,zoom=12){
 if(inKorea(bounds)){
  const index=await get(ROOT+'index.json');
  if(index.schema!==1||index.version!=='copernicus-glo30-2021-v1'||!index.complete||index.kind!=='DSM'||index.encoding!=='Terrarium RGB'||index.zoom!==zoom)throw Error('새 고도 자료의 완료 상태를 확인할 수 없습니다.');
  if(jobs.every(([x,y])=>index.tiles[zoom+'/'+x+'/'+y]))return {name:'Copernicus GLO-30 · 약 30m 표면 고도',tiles:new Map(jobs.map(([x,y])=>{const key=zoom+'/'+x+'/'+y;return [x+','+y,{url:BASE+ROOT+key+'.png',info:index.tiles[key]}];}))};
 }
 return {name:'Mapzen · 기본 고도',tiles:new Map(jobs.map(([x,y])=>[x+','+y,{url:`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`}]))};
}
