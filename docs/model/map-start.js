import {installSelection} from './selection.js?v=data-oct2';
import {installFilteredMap} from './vector-map.js?v=data-oct2';
const map=L.map('map',{zoomControl:true,minZoom:14,maxZoom:19}).setView([37.5665,126.978],16);
installFilteredMap(map,L);
window.contaSelection=installSelection(map);
window.resolveContaMap(map);

let resizeFrame;new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>map.invalidateSize({pan:false}));}).observe(document.getElementById("map"));

