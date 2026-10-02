import {installSelection} from './selection.js?v=fix5';
import {installFilteredMap} from './vector-map.js?v=fix5';
const map=L.map('map',{zoomControl:true}).setView([37.5665,126.978],16);
installFilteredMap(map,L);
window.contaSelection=installSelection(map);
window.resolveContaMap(map);
