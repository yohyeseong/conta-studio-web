importScripts('vendor/proj4.js','vendor/polygon-clipping.js');
onmessage=async e=>{try{const {importNgiiFiles}=await import('./ngii-zip.mjs?v=source3'),result=await importNgiiFiles(e.data.files||[e.data.file],proj4,(message,progress)=>postMessage({message,progress}));postMessage({result});}catch(error){postMessage({error:error.message||String(error)});}};
