import {koreaData} from './korea-data.js?v=fix7';
import './vendor/osmtogeojson.js';
import './military-policy.js';
onmessage=async e=>{try{const osm=await koreaData(e.data.bounds);if(e.data.geo){const geo=MilitaryPolicy.inspect(osm).geo;if(e.data.zoom<16)geo.features=geo.features.filter(f=>{const t=f.properties||{};return t.place||['motorway','trunk','primary','secondary','tertiary'].includes(t.highway)||t.landuse||t.leisure||t.waterway||t.natural==='water';});postMessage({id:e.data.id,geo});}else postMessage({id:e.data.id,osm});}catch(error){postMessage({id:e.data.id,error:error.message});}};
