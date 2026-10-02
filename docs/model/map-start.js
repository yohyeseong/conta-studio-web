import {installFilteredMap} from './vector-map.js?v=map4';
const map=L.map('map',{zoomControl:true}).setView([37.5665,126.978],16);
installFilteredMap(map,L);
window.resolveContaMap(map);
