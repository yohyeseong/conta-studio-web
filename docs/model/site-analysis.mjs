import {siteDiagram} from './site-diagram.mjs?v=site3';
export const analyses=[
 ['plan','종합 평면','주변 요소와 선택 영역'],['volume','입체 매스','지형과 건물의 입체 관계'],
 ['green','녹지·수공간','녹지, 하천, 바다 분포'],['routes','동선 구조','도로·철도 영역 · 교통량 분석 아님'],
 ['fabric','건물·빈 공간','건물 외곽선과 비건물 영역'],['usage','건물 용도','확인된 용도와 미상 구분'],
 ['height','건물 높이','모델 높이 분포 · 추정값 포함'],['density','건물 밀도','격자별 건물 개수 / ha'],
 ['terrain','지형 고도','제어점 보간 · 영역 최저점 기준'],['view','선택 위치 시야','지형과 건물로 보는 예상 시야']
].map(([id,title,note])=>({id,title,note}));
export const planar=id=>!['volume','view'].includes(id);
export function buildingDensity(cad,size=100){
 const {w,h}=cad.terrain,cols=Math.ceil(w/size),rows=Math.ceil(h/size),counts=new Map();
 for(const b of cad.buildings){const ring=b.poly[0];if(!ring?.length)continue;const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);const x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2,c=Math.min(cols-1,Math.max(0,Math.floor((x+w/2)/size))),r=Math.min(rows-1,Math.max(0,Math.floor((y+h/2)/size))),key=r*cols+c;counts.set(key,(counts.get(key)||0)+1);}
 return Array.from({length:rows*cols},(_,i)=>{const c=i%cols,r=Math.floor(i/cols),x=-w/2+c*size,y=-h/2+r*size,cw=Math.min(size,w/2-x),ch=Math.min(size,h/2-y),count=counts.get(i)||0;return {x,y,w:cw,h:ch,count,value:count/(cw*ch/10000)};});
}
const palette=['#edf1e8','#c9d9ac','#9ebd80','#759760','#476c48'];
export function analysisDiagram(cad,items,options,mode){
 let selected=items.map(i=>({...i})),settings={...options};
 if(mode==='green'||mode==='routes'){const focus=mode==='green'?['녹지','하천','바다']:['도로','철도'];selected=selected.map(i=>({...i,color:focus.includes(i.name)?i.color:'#e7e9ec'}));settings.usage=false;}
 if(mode==='fabric'){selected=selected.map(i=>({...i,color:i.name==='건물'?'#25313e':'#ffffff'}));settings.usage=false;}
 if(mode==='usage')settings.usage=true;
 const overlay=['density','height','terrain'].includes(mode);
 if(overlay)selected=selected.filter(i=>i.name!=='건물'&&i.name!=='파라펫').map(i=>({...i,color:'#eceff2'}));
 const result=siteDiagram(cad,selected,{...settings,legend:overlay?false:settings.legend});
 if(!overlay)return result;
 const l=result.layout,xy=p=>[l.left+(p[0]+l.w/2)*l.scale,l.top+(l.h/2-p[1])*l.scale],path=poly=>poly.map(r=>r.map((p,i)=>(i?'L':'M')+xy(p).join(' ')).join(' ')+'Z').join(' ');
 let shapes='',labels=[],note='';
 if(mode==='height'){
  const colors=['#d7e8ef','#a4cedb','#74a6c6','#526f9e','#423f73'],limits=[10,20,40,80,Infinity];labels=['10m 미만','10–20m','20–40m','40–80m','80m 이상'];
  cad.buildings.forEach(b=>{const value=Math.max(0,b.roof-b.bottom),color=colors[limits.findIndex(v=>value<v)];shapes+=`<path d="${path(b.poly)}" fill="${color}" fill-rule="evenodd" stroke="${settings.outline?'#374151':color}" stroke-width=".6"/>`;});
  note='모델의 지붕–바닥 높이 · 원본 높이와 층수·기본 층고 추정값이 함께 포함됩니다.';labels=labels.map((name,i)=>({name,color:colors[i]}));
 }
 if(mode==='density'){
  const size=Math.max(25,Number(options.grid)||100),cells=buildingDensity(cad,size),limits=[10,25,50,100,Infinity];labels=['10 미만','10–25','25–50','50–100','100 이상'].map((name,i)=>({name:name+' 개/ha',color:palette[i]}));
  for(const cell of cells){const [x,y]=xy([cell.x,cell.y+cell.h]);shapes+=`<rect x="${x}" y="${y}" width="${cell.w*l.scale}" height="${cell.h*l.scale}" fill="${palette[limits.findIndex(v=>cell.value<v)]}" stroke="white" stroke-width=".4"/>`;}
  note=`${size}m 격자 · 외곽선 바운딩박스 중심 기준 건물 개수 · 가장자리 격자는 실제 면적으로 보정`;
 }
 if(mode==='terrain'){
  const pts=cad.terrain.points,n=cad.terrain.count;if(!pts?.length||n<2)throw Error('지형 고도 자료가 없습니다.');
  const values=pts.map(p=>p[2]),min=Math.min(...values),max=Math.max(...values),span=max-min;
  for(let j=0;j<n-1;j++)for(let i=0;i<n-1;i++){const a=pts[j*n+i],b=pts[j*n+i+1],c=pts[(j+1)*n+i+1],d=pts[(j+1)*n+i],v=(a[2]+b[2]+c[2]+d[2])/4,idx=span>1e-8?Math.min(4,Math.floor((v-min)/span*5)):0;shapes+=`<path d="${path([[a,b,c,d,a]])}" fill="${palette[idx]}" stroke="${palette[idx]}" stroke-width=".3"/>`;}
  labels=Array.from({length:span>1e-8?5:1},(_,i)=>({name:span>1e-8?`${(min+span*i/5).toFixed(1)}–${(min+span*(i+1)/5).toFixed(1)}m`:`${min.toFixed(1)}m`,color:palette[i]}));
  note='지형 제어점의 평균 상대 고도 · 해발 고도·정밀 측량값이 아닙니다. Copernicus DSM 기반';
 }
 const legend=settings.legend?labels.map((v,i)=>`<rect x="${64+i*230}" y="${result.height-66}" width="16" height="16" fill="${v.color}"/><text x="${88+i*230}" y="${result.height-53}" font-size="14">${v.name}</text>`).join(''):'';
 result.svg=result.svg.replace('</svg><rect x=',`${shapes}</svg><rect x=`).replace('<path d="M64 ',`<text x="64" y="${result.height-120}" font-size="12" fill="#64748b">${note}</text>${legend}<path d="M64 `);
 return result;
}
