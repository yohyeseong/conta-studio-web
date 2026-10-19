importScripts('river-banks.js?v=source3','vendor/terrain-cad.js?v=nurbs-solid1','terrain-surface.js?v=official1','cad-export.js?v=source3','rhino-export.js?v=sourceonly1');
const ready=rhino3dm({locateFile:name=>name.endsWith('.wasm')?'vendor/terrain-cad.wasm?v=nurbs-solid1':'vendor/'+name});
onmessage=async e=>{try{const bytes=buildRhinoFile(await ready,e.data.items,e.data.scale,e.data.cad);postMessage({bytes},[bytes.buffer]);}catch(error){postMessage({error:error.message||String(error)});}};

