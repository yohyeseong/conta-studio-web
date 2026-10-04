import {installSelection} from './selection.js?v=packed2';
import {installFilteredMap} from './vector-map.js?v=source-fast4';
const map=L.map('map',{zoomControl:true,zoomAnimation:false,markerZoomAnimation:false,minZoom:10,maxZoom:19}).setView([37.5665,126.978],16);
installFilteredMap(map,L);
window.contaSelection=installSelection(map);
window.resolveContaMap(map);

let resizeFrame;new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>map.invalidateSize({pan:false}));}).observe(document.getElementById("map"));


