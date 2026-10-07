const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function buildingLabel(b,field){
 const p=b.properties||{},name=p.name||p['name:ko'],levels=p['building:levels'],basement=p['building:levels:underground'],height=Number(p.height),use=b.usage&&b.usage!=='용도 미상'?b.usage:null;
 const h=b.heightEstimated===false&&Number.isFinite(b.height)?b.height.toFixed(1)+'m':height>0?height.toFixed(1)+'m':Number.isFinite(b.roof-b.bottom)?'약 '+(b.roof-b.bottom).toFixed(1)+'m (추정)':'';
 const address=p['addr:full']||[p['addr:street'],p['addr:housenumber']].filter(Boolean).join(' ');
 const choices={name:name?[name]:[],height:h?[h]:[],levels:[levels?levels+'층':null,basement?'지하 '+basement+'층':null].filter(Boolean),usage:use?[use]:[],address:address?[address]:[]};
 return field==='all'?[name,h,levels?levels+'층':null,basement?'지하 '+basement+'층':null,use,address].filter(Boolean):choices[field]||[];
}
export function gisLabels(cad,layout,options,items){
 const names=new Set(items.map(i=>i.name)),field=options.gisLabels||'none',size=Number(options.labelSize)||9,xy=p=>[layout.left+(p[0]+layout.w/2)*layout.scale,layout.top+(layout.h/2-p[1])*layout.scale];
 if(field==='none'&&!options.gisNames)return '';
 const text=(point,lines)=>{if(!lines.length)return '';const [x,y]=xy(point);return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" fill="#27343c" stroke="white" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke" font-weight="500">${lines.map((line,i)=>`<tspan x="${x}" dy="${i?size*1.15:0}">${escape(line)}</tspan>`).join('')}</text>`;};
 let out='';
 if(names.has('건물'))for(const b of cad.buildings){const ring=b.poly[0],xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),point=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];out+=text(point,buildingLabel(b,field));}
 if(options.gisNames)for(const f of cad.gisFeatures||[]){if(f.category==='건물'||!names.has(f.category))continue;const p=f.properties||{},name=p.name||p['name:ko'];if(name)out+=text(f.point,[name]);if(f.category==='기타 GIS'){const [x,y]=xy(f.point);out+=`<circle cx="${x}" cy="${y}" r="3" fill="#a66853" stroke="white" stroke-width="1"/>`;}}
 return `<g aria-label="GIS 상세 정보">${out}</g>`;
}
