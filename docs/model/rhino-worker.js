importScripts('vendor/terrain-cad.js','terrain-surface.js?v=official1','cad-export.js?v=no-sidewalk1','rhino-export.js?v=no-sidewalk1');
const ready=rhino3dm({locateFile:name=>name.endsWith('.wasm')?'vendor/terrain-cad.wasm':'vendor/'+name});
onmessage=async e=>{try{const bytes=buildRhinoFile(await ready,e.data.items,e.data.scale,e.data.cad);postMessage({bytes},[bytes.buffer]);}catch(error){postMessage({error:error.message||String(error)});}};
