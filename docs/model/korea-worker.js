import {koreaData} from './korea-data.js?v=fix9';
import {preparedData} from './prepared-data.js?v=fix9';
import './military-policy.js?v=fix9';
onmessage=async e=>{try{if(e.data.geo){const source=await preparedData(e.data.bounds,e.data.geo==='model'?'model':'map',e.data.zoom);if(e.data.geo==='model'){MilitaryPolicy.assertPrepared(source,e.data.bounds);postMessage({id:e.data.id,source});}else postMessage({id:e.data.id,geo:source.preparedGeo});}else postMessage({id:e.data.id,osm:await koreaData(e.data.bounds)});}catch(error){postMessage({id:e.data.id,error:error.message});}};
