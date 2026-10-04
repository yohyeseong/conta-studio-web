import {koreaData} from './korea-data.js?v=model-fast3';
import {preparedData} from './prepared-data.js?v=model-fast3';
import {modelMetadata} from './model-packed.js?v=model-fast3';
import {officialMetadata} from './official-packed.js?v=model-fast3';
import './military-policy.js?v=packed2';
onmessage=async e=>{try{if(e.data.geo==='prepare'){await Promise.all([modelMetadata(e.data.bounds),officialMetadata(e.data.bounds)]);postMessage({id:e.data.id,source:{ready:true}});}else if(e.data.geo){const source=await preparedData(e.data.bounds,e.data.geo==='model'?'model':'map',e.data.zoom,(message,progress)=>postMessage({id:e.data.id,message,progress}));if(e.data.geo==='model'){MilitaryPolicy.assertPrepared(source,e.data.bounds);postMessage({id:e.data.id,source});}else postMessage({id:e.data.id,geo:source.preparedGeo});}else postMessage({id:e.data.id,osm:await koreaData(e.data.bounds)});}catch(error){postMessage({id:e.data.id,error:error.message});}};

