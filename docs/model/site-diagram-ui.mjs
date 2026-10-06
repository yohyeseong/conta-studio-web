import * as THREE from 'three';
import {siteDiagram} from './site-diagram.mjs';
import {diagramPdf} from './site-pdf.mjs';

export function openSiteDiagram(model,objects){
 const dialog=document.getElementById('site-dialog'),image=document.getElementById('site-image'),planButton=document.getElementById('site-plan'),volumeButton=document.getElementById('site-volume'),format=document.getElementById('site-format'),pngButton=document.getElementById('site-download'),caption=document.getElementById('site-caption');
 const items=Object.entries(objects).filter(([,o])=>o.visible).map(([name,o])=>({name,color:'#'+o.material.color.getHexString(),positions:o.geometry.attributes.position.array,lines:!!o.isLineSegments,object:o}));
 if(!items.length)throw Error('표시할 레이어를 켜주세요.');
 let mode='plan',url=null,plan=null,volume=null,revision=0;
 const download=(blob,name)=>{const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(href),10000);};
 const display=blob=>{if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);image.src=url;};
 function drawVolume(){
  const width=1400,height=1200,renderWidth=1272,renderHeight=920,renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false}),scene=new THREE.Scene(),meshes=[];
  renderer.setSize(renderWidth,renderHeight);renderer.setClearColor('#ffffff');
  scene.add(new THREE.HemisphereLight(0xffffff,0xc6cbd0,2));const light=new THREE.DirectionalLight(0xffffff,1.5);light.position.set(-300,-500,900);scene.add(light);
  const box=new THREE.Box3();
  try{
   for(const item of items){const o=item.object,material=item.lines?new THREE.LineBasicMaterial({color:item.color}):new THREE.MeshLambertMaterial({color:item.color,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}),mesh=item.lines?new THREE.LineSegments(o.geometry,material):new THREE.Mesh(o.geometry,material);meshes.push(mesh);scene.add(mesh);box.expandByObject(mesh);
    if(item.name==='건물'||item.name==='파라펫'){const edge=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,30),new THREE.LineBasicMaterial({color:'#34404d',transparent:true,opacity:.65}));edge.userData.ownGeometry=true;meshes.push(edge);scene.add(edge);}
   }
   const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),r=Math.max(size.length(),1),aspect=renderWidth/renderHeight,camera=new THREE.OrthographicCamera(-r*aspect/2,r*aspect/2,r/2,-r/2,.01,r*20);
   camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(1,-1,.9).normalize().multiplyScalar(r*4));camera.lookAt(center);camera.updateMatrixWorld();
   // Fit the actual projected bounds instead of a perspective screenshot.
   let spanX=0,spanY=0;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);spanX=Math.max(spanX,Math.abs(p.x));spanY=Math.max(spanY,Math.abs(p.y));}
   const half=Math.max(spanY,spanX/aspect)*1.07;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.render(scene,camera);
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.drawImage(renderer.domElement,64,100);ctx.fillStyle='#253649';ctx.font='bold 28px Arial';ctx.fillText('SITE DIAGRAM · 3D',64,48);ctx.font='14px Arial';ctx.fillText('CONTA STUDIO · 입체 다이어그램 · 정투영',64,74);
   // North follows the projected model axis in the fixed axonometric view.
   const origin=center.clone().project(camera),north=center.clone().add(new THREE.Vector3(0,r/10,0)).project(camera),dx=north.x-origin.x,dy=-(north.y-origin.y),len=Math.hypot(dx,dy),nx=dx/len,ny=dy/len;ctx.strokeStyle='#253649';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(1310,66);ctx.lineTo(1310+nx*28,66+ny*28);ctx.stroke();ctx.font='bold 18px Arial';ctx.fillText('N',1304+nx*40,72+ny*40);
   let x=64;ctx.font='15px Arial';for(const item of items){ctx.fillStyle=item.color;ctx.fillRect(x,1090,16,16);ctx.fillStyle='#253649';ctx.fillText(item.name,x+24,1104);x+=135;}
   ctx.fillStyle='#64748b';ctx.font='11px Arial';ctx.fillText('© OpenStreetMap contributors · 공식 건물 GIS건물통합정보 / VWorld · 국토교통부 · 생성한 모델의 입체 구성',64,1175);
   return canvas;
  }finally{for(const mesh of meshes){mesh.material.dispose();if(mesh.userData.ownGeometry)mesh.geometry.dispose();}renderer.dispose();renderer.forceContextLoss();}
 }
 async function select(next){const current=++revision;mode=next;planButton.setAttribute('aria-pressed',String(mode==='plan'));volumeButton.setAttribute('aria-pressed',String(mode==='volume'));pngButton.disabled=true;caption.textContent=mode==='plan'?'평면 · 북쪽 위 · 표시한 레이어와 색상 적용':'입체 · 정투영 · 표시한 레이어와 색상 적용';
  try{if(mode==='plan'){plan??=siteDiagram(model.cad,items);display(new Blob([plan.svg],{type:'image/svg+xml;charset=utf-8'}));}else{volume??=drawVolume();const blob=await new Promise(resolve=>volume.toBlob(resolve,'image/png'));if(current!==revision)return;if(!blob)throw Error('입체 이미지를 만들지 못했습니다.');display(blob);}await image.decode();if(current===revision)pngButton.disabled=false;}catch(error){if(current===revision)caption.textContent='생성 실패: '+error.message;}
 }
 planButton.onclick=()=>select('plan');volumeButton.onclick=()=>select('volume');
 pngButton.onclick=async()=>{const saveMode=mode,saveFormat=format.value;pngButton.disabled=true;try{let canvas=volume;if(saveMode==='plan'){canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;canvas.getContext('2d').drawImage(image,0,0);}let blob=await new Promise(resolve=>canvas.toBlob(resolve,saveFormat==='png'?'image/png':'image/jpeg',.95));if(!blob)throw Error('이미지 저장 실패');if(saveFormat==='pdf')blob=new Blob([diagramPdf(new Uint8Array(await blob.arrayBuffer()),canvas.width,canvas.height)],{type:'application/pdf'});download(blob,'ContaStudio-SITE-'+saveMode+'.'+saveFormat);}catch(error){caption.textContent='저장 실패: '+error.message;}finally{pngButton.disabled=false;}};
 dialog.onclose=()=>{revision++;if(url)URL.revokeObjectURL(url);image.removeAttribute('src');volume=null;};
 dialog.showModal();select('plan');
}
