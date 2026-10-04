import {addOfficialDetails} from './official-details.js?v=model-fast3';
import {officialFeatures} from './official-packed.js?v=model-fast3';
import {packedModel} from './model-packed.js?v=model-fast3';
import {inKorea} from './korea-data.js?v=model-fast3';
export async function preparedData(bounds,kind='model',zoom=16,onProgress=()=>{}){
 if(kind==='map')return {preparedGeo:await (await import('./map-grid.js?v=packed2')).mapGrid(bounds)};
 if(!inKorea(bounds))throw Error('전국 데이터 범위 밖입니다.');
 const officialPending=officialFeatures(bounds).then(value=>({value}),error=>({error}));
 const source=await packedModel(bounds,onProgress);onProgress('공식 건물 외곽선·높이 적용 중',48);
 const official=await officialPending;if(official.error)throw official.error;
 return addOfficialDetails(source,bounds,official.value);
}
