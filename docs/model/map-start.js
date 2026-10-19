import {installSelection} from './selection.js?v=river1';
import {installFilteredMap} from './vector-map.js?v=exclude1';
import {installNgiiMap} from './ngii-map.mjs?v=ngii1';
const map=L.map('map',{zoomControl:true,attributionControl:false,fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false,minZoom:10,maxZoom:19}).setView([37.5665,126.978],16);
installFilteredMap(map,L);
installNgiiMap(map,L);
window.contaSelection=installSelection(map);
window.resolveContaMap(map);

let resizeFrame;new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>map.invalidateSize({pan:false}));}).observe(document.getElementById("map"));



