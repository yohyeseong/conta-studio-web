// Plan diagrams use original polygon boundaries instead of projected mesh triangles.
export function siteDiagram(cad,items){
 const w=cad.terrain.w,h=cad.terrain.h;if(!(w>0&&h>0))throw Error('생성된 모델의 영역 정보가 없습니다.');
 const width=1400,mapHeight=Math.max(300,Math.min(1000,1272*h/w)),height=Math.ceil(mapHeight+240),scale=Math.min(1272/w,mapHeight/h),left=(width-w*scale)/2,top=100+(mapHeight-h*scale)/2;
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const number=v=>Number(v.toFixed(3)),xy=p=>[number(left+(p[0]+w/2)*scale),number(top+(h/2-p[1])*scale)];
 const path=poly=>poly.map(r=>r.map((p,i)=>(i?'L':'M')+xy(p).join(' ')).join(' ')+'Z').join(' ');
 const parts=[],legend=[],byName=new Map(items.map(i=>[i.name,i]));
 for(const name of ['대지','바다','하천','녹지','도로','철도','등고선','건물','파라펫']){
  const item=byName.get(name);if(!item)continue;
  const color=/^#[\da-f]{6}$/i.test(item.color)?item.color:'#aaaaaa';
  let polys=name==='대지'?cad.terrain.polygons:name==='건물'?cad.buildings.map(b=>b.poly):name==='파라펫'?cad.parapets.map(b=>b.poly):cad.covers[name]||[];
  if(name==='등고선'){const p=item.positions;let d='';for(let i=0;i<p.length;i+=6)d+='M'+xy([p[i],p[i+1]]).join(' ')+'L'+xy([p[i+3],p[i+4]]).join(' ');parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width=".6" opacity=".55"/>`);}
  else if(polys.length)parts.push(`<path d="${polys.map(path).join(' ')}" fill="${color}" fill-rule="evenodd" stroke="${name==='건물'?'#374151':color}" stroke-width="${name==='건물'?'.7':'.2'}" stroke-linejoin="round"/>`);
  else continue;
  legend.push({name,color});
 }
 const target=w/5,power=10**Math.floor(Math.log10(target)),bar=[5,2,1].map(v=>v*power).find(v=>v<=target)||power/2,barX=64,barY=height-98;
 const swatches=legend.map((v,i)=>`<rect x="${64+i*135}" y="${height-66}" width="16" height="16" rx="2" fill="${v.color}"/><text x="${88+i*135}" y="${height-53}" font-size="15">${escape(v.name)}</text>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" fill="#253649"><text x="64" y="48" font-size="28" font-weight="bold">SITE DIAGRAM</text><text x="64" y="74" font-size="14">CONTA STUDIO · ${number(w/1000)} × ${number(h/1000)} km · 북쪽 위</text><svg x="${left}" y="${top}" width="${w*scale}" height="${h*scale}" viewBox="${left} ${top} ${w*scale} ${h*scale}">${parts.join('')}</svg><rect x="${left}" y="${top}" width="${w*scale}" height="${h*scale}" fill="none" stroke="#c8d0da"/><text x="1320" y="45" text-anchor="middle" font-size="18" font-weight="bold">N</text><path d="M1320 53L1309 79L1320 73L1331 79Z"/><path d="M${barX} ${barY-6}V${barY}H${barX+bar*scale}V${barY-6}" fill="none" stroke="#253649" stroke-width="2"/><text x="${barX}" y="${barY-12}" font-size="14">${number(bar)} m</text>${swatches}<text x="64" y="${height-20}" font-size="11" fill="#64748b">© OpenStreetMap contributors · 공식 건물 GIS건물통합정보 / VWorld · 국토교통부 · 생성한 모델의 평면 구성</text></g></svg>`;
 return {svg,width,height};
}
