import {SkpBuilder} from './vendor/openskp/create.mjs';

export function buildSkp(items,scale,cad,progress=()=>{}){
 if(!Number.isFinite(scale)||scale<1||scale>100000)throw Error('축척은 1–100000 범위로 입력하세요.');
 if(!items.length)throw Error('표시된 레이어가 없습니다.');
 const builder=new SkpBuilder(),factor=1000/(scale*25.4),materials=new Map(),layers=new Map();
 for(const item of items)materials.set(item.name,builder.addMaterial(item.name,item.color.map(v=>Math.round(Math.max(0,Math.min(1,v))*255))));
 for(const item of items)layers.set(item.name,builder.addLayer(item.name));
 const point=p=>p.map(v=>{if(!Number.isFinite(v))throw Error('모델 좌표가 올바르지 않습니다.');return Math.round(v*factor*1e9)/1e9;});
 const open=ring=>ring.length>1&&ring[0].every((v,i)=>v===ring[ring.length-1][i])?ring.slice(0,-1):ring;
 const orient=(ring,positive)=>{const r=open(ring),area=r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p[0]*q[1]-q[0]*p[1];},0);return (area>0)===positive?r:[...r].reverse();};
 let groups=0,faces=0;
 // Clipping and Float32 conversion can leave zero-area triangles in the preview.
 // Match the writer's plane test after conversion; those triangles have no surface.
 const hasSurface=ring=>{
  const normal=[0,0,0];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];normal[0]+=(a[1]-b[1])*(a[2]+b[2]);normal[1]+=(a[2]-b[2])*(a[0]+b[0]);normal[2]+=(a[0]-b[0])*(a[1]+b[1]);}
  return Math.hypot(...normal)>=1e-9;
 };
 function prism(shape,item,name,surface=false){
  const rings=shape.poly.map((r,i)=>orient(r,i===0)),material=materials.get(item.name);
  builder.addGroup(group=>{
   const face=(ring,holes=[])=>{group.addFace(ring.map(point),{material,backMaterial:material,holes:holes.map(r=>r.map(point))});faces++;};
   const at=(r,z)=>r.map(p=>[p[0],p[1],z]);
   face(at(rings[0],shape.roof),rings.slice(1).map(r=>at(r,shape.roof)));
   if(surface)return;
   face(at([...rings[0]].reverse(),shape.bottom),rings.slice(1).map(r=>at([...r].reverse(),shape.bottom)));
   for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];face([[...a,shape.bottom],[...b,shape.bottom],[...b,shape.roof],[...a,shape.roof]]);}
  },{name,material,layer:layers.get(item.name)});groups++;
 }
 for(let index=0;index<items.length;index++){
  const item=items[index],material=materials.get(item.name),layer=layers.get(item.name);
  progress(90+Math.round(index/items.length*7),'SketchUp · '+item.name+' 저장 중');
  if(item.name==='건물'||item.name==='파라펫'){
   const shapes=item.name==='건물'?cad.buildings:cad.parapets;
   for(let i=0;i<shapes.length;i++)prism(shapes[i],item,item.name+' '+(i+1));
  }else if(cad.terrain.bands&&!item.lines){
   let count=0;for(const band of cad.terrain.bands){
    const polys=item.name==='대지'?band.polygons:band.covers[item.name]||[];
    const offset=item.name==='대지'?0:(item.name==='철도'?.05:.025)-(cad.terrain.lowerStep&&['도로','하천','바다'].includes(item.name)?cad.terrain.interval:0);
    for(const poly of polys)prism({poly,bottom:cad.terrain.base,roof:band.level+offset},item,item.name+' '+(++count),item.name==='철도');
   }
  }else{
   builder.addGroup(group=>{
    const p=item.positions;
    if(item.lines){for(let i=0;i<p.length;i+=6)group.addPolyline([point(Array.from(p.slice(i,i+3))),point(Array.from(p.slice(i+3,i+6)))],{material});}
    else for(let i=0;i<p.length;i+=9){const ring=[0,3,6].map(j=>point(Array.from(p.slice(i+j,i+j+3))));if(!hasSurface(ring))continue;group.addFace(ring,{material,backMaterial:material,softEdges:true,smoothEdges:true,hiddenEdges:true});faces++;}
   },{name:item.name,material,layer});groups++;
  }
 }
 if(!groups)throw Error('저장할 도형이 없습니다.');
 progress(98,'SketchUp 파일 구성 중');return {bytes:builder.toBytes(),groups,faces};
}
