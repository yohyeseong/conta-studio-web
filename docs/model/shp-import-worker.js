importScripts('vendor/proj4.js');
onmessage=async e=>{try{const {importNgiiZip}=await import('./ngii-zip.mjs?v=zip3'),result=await importNgiiZip(e.data.file,proj4,(message,progress)=>postMessage({message,progress}));postMessage({result});}catch(error){postMessage({error:error.message||String(error)});}};
