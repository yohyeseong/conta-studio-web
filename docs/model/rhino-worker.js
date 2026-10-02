importScripts('vendor/rhino3dm.js','rhino-export.js?v=fix9');
const ready=rhino3dm({locateFile:name=>'vendor/'+name});
onmessage=async e=>{try{const bytes=buildRhinoFile(await ready,e.data.items,e.data.scale);postMessage({bytes},[bytes.buffer]);}catch(error){postMessage({error:error.message||String(error)});}};
