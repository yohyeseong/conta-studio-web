import {koreaData} from './korea-data.js?v=speed2';
onmessage=async e=>{try{postMessage({id:e.data.id,osm:await koreaData(e.data.bounds)});}catch(error){postMessage({id:e.data.id,error:error.message});}};
