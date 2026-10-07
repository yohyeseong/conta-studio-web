import './building-use.js?v=site3';
import {gisLabels} from './site-gis.mjs?v=gis2';
// Plan diagrams use original polygon boundaries instead of projected mesh triangles.
export function siteDiagram(cad,items,options={}){
 const w=cad.terrain.w,h=cad.terrain.h;if(!(w>0&&h>0))throw Error('생성된 모델의 영역 정보가 없습니다.');
 const width=1400,mapHeight=Math.max(420,Math.min(1400,1304*h/w)),height=Math.ceil(mapHeight+340),scale=Math.min(1304/w,mapHeight/h),left=(width-w*scale)/2,top=150+(mapHeight-h*scale)/2;
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const number=v=>Number(v.toFixed(3)),xy=p=>[number(left+(p[0]+w/2)*scale),number(top+(h/2-p[1])*scale)];
 const path=poly=>poly.map(r=>r.map((p,i)=>(i?'L':'M')+xy(p).join(' ')).join(' ')+'Z').join(' ');
 const parts=[],legend=[],byName=new Map(items.map(i=>[i.name,i]));
 for(const name of ['대지','바다','하천','녹지','도로','철도','등고선','건물','파라펫']){
  const item=byName.get(name);if(!item)continue;
  const color=/^#[\da-f]{6}$/i.test(item.color)?item.color:'#aaaaaa';
  let polys=name==='대지'?cad.terrain.polygons:name==='건물'?cad.buildings.map(b=>b.poly):name==='파라펫'?cad.parapets.map(b=>b.poly):cad.covers[name]||[];
  if(name==='등고선'){const p=item.positions;let d='';for(let i=0;i<p.length;i+=6)d+='M'+xy([p[i],p[i+1]]).join(' ')+'L'+xy([p[i+3],p[i+4]]).join(' ');parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width=".6" opacity=".55"/>`);}
  else if(name==='건물'&&options.usage){const buckets=new Map();for(const b of cad.buildings){const use=b.usage||'용도 미상';if(!buckets.has(use))buckets.set(use,[]);buckets.get(use).push(b.poly);}for(const [use,polys] of buckets){const fill=ContaBuildingUse.colors[use]||ContaBuildingUse.colors['용도 미상'];parts.push(`<path d="${polys.map(path).join(' ')}" fill="${fill}" fill-rule="evenodd" stroke="${options.outline===false?fill:'#374151'}" stroke-width=".7"/>`);legend.push({name:use,color:fill});}continue;}
  else if(polys.length)parts.push(`<path d="${polys.map(path).join(' ')}" fill="${color}" fill-rule="evenodd" stroke="${name==='건물'&&options.outline!==false?'#374151':color}" stroke-width="${name==='건물'&&options.outline!==false?'.7':'.2'}" stroke-linejoin="round"/>`);
  else continue;
  legend.push({name,color});
 }
 const target=w/5,power=10**Math.floor(Math.log10(target)),bar=[5,2,1].map(v=>v*power).find(v=>v<=target)||power/2,barX=64,barY=height-114;
 const accent=options.accent||'#bb6758';
 const swatches=legend.map((v,i)=>`<rect x="${64+(i%8)*160}" y="${height-78+Math.floor(i/8)*25}" width="12" height="12" rx="2" fill="${v.color}"/><text x="${84+(i%8)*160}" y="${height-67+Math.floor(i/8)*25}" font-size="14">${escape(v.name)}</text>`).join('');
 const stats=options.stats||[{label:'선택 면적',value:number(w*h/1e6)+' km²'},{label:'모델 건물',value:cad.buildings.length.toLocaleString()+'개'},{label:'분석 자료',value:'OSM + 공식 GIS'}];
 const metrics=stats.map((v,i)=>`<text x="${850+i*170}" y="47" font-size="12" fill="#7e858b" letter-spacing="1">${escape(v.label)}</text><text x="${850+i*170}" y="76" font-size="22" font-weight="bold">${escape(v.value)}</text>`).join('');
 const cx=xy([0,0])[0],cy=xy([0,0])[1],radius=Math.min(w,h)/4;
 const reference=options.reference?`<circle cx="${cx}" cy="${cy}" r="${radius*scale}" fill="none" stroke="${accent}" stroke-width="1.6" stroke-dasharray="6 6" opacity=".8"/><circle cx="${cx}" cy="${cy}" r="9" fill="white" stroke="${accent}" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="3" fill="${accent}"/><rect x="${cx+14}" y="${cy-31}" width="104" height="24" rx="4" fill="white" fill-opacity=".94"/><text x="${cx+22}" y="${cy-14}" font-size="12" fill="${accent}">선택 영역 중심</text><text x="${cx+radius*scale+8}" y="${cy-8}" font-size="12" fill="${accent}">${number(radius)}m</text>`:'';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${/^#[\da-f]{6}$/i.test(options.background||'')?options.background:'white'}"/><g font-family="Arial, sans-serif" fill="#27343c"><rect x="48" y="32" width="4" height="52" fill="${accent}"/><text x="66" y="45" font-size="12" letter-spacing="2.5" fill="${accent}">CONTA STUDIO / SITE ANALYSIS</text><text x="64" y="80" font-size="30" font-weight="bold">${escape(options.title||'SITE DIAGRAM')}</text>${metrics}<path d="M48 108H1352" stroke="#d9dddf"/><text x="48" y="132" font-size="12" fill="#7b8287">${number(w/1000)} × ${number(h/1000)} km · 북쪽 위 · 생성된 모델 기준</text><svg x="${left}" y="${top}" width="${w*scale}" height="${h*scale}" viewBox="${left} ${top} ${w*scale} ${h*scale}"><rect x="${left}" y="${top}" width="${w*scale}" height="${h*scale}" fill="#f4f3ee"/>${parts.join('')}<!--ANALYSIS-OVERLAY-->${gisLabels(cad,{left,top,scale,w,h},options,items)}${reference}${options.viewpoint?'<circle cx="'+xy(options.viewpoint)[0]+'" cy="'+xy(options.viewpoint)[1]+'" r="7" fill="#e04a43" stroke="white" stroke-width="2"/>':''}</svg><rect x="${left}" y="${top}" width="${w*scale}" height="${h*scale}" fill="none" stroke="#d9dddf"/>${options.north===false?'':'<g transform="translate(1319 129)"><circle r="20" fill="white" stroke="#d9dddf"/><path d="M0-14L-5 9L0 5L5 9Z" fill="#27343c"/><text x="0" y="-27" text-anchor="middle" font-size="13" font-weight="bold">N</text></g>'}<text x="64" y="${height-157}" font-size="12" fill="#6b757b"><!--ANALYSIS-NOTE--></text><path d="M${barX} ${barY-6}V${barY}H${barX+bar*scale}V${barY-6}" fill="none" stroke="#27343c" stroke-width="2"/><text x="${barX}" y="${barY-12}" font-size="13">${number(bar)} m</text>${options.legend===false?'':swatches}<!--ANALYSIS-LEGEND--><path d="M48 ${height-37}H1352" stroke="#d9dddf"/><text x="48" y="${height-16}" font-size="10" fill="#849095">© OpenStreetMap contributors · VWorld / 국토교통부 · Copernicus DSM · CONTA STUDIO</text></g></svg>`;
 return {svg,width,height,layout:{left,top,scale,w,h}};
}
