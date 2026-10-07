import {drawBuildingAnalysis,buildingAnalysis} from './site-building-analysis.mjs?v=legend2';
import {siteDiagram} from './site-diagram.mjs?v=legend2';
export const analyses=[
 ['gis','GIS 전체 자료','확보된 모든 레이어 · 명칭·건물 상세값'],
 ['plan','종합 평면','주변 요소와 선택 영역'],['volume','입체 매스','지형과 건물의 입체 관계'],
 ['green','녹지·수공간','녹지, 하천, 바다 분포'],['routes','동선 구조','도로·철도 영역 · 교통량 분석 아님'],
 ['fabric','건물·빈 공간','건물 외곽선과 비건물 영역'],['use-map','건물 용도','확인된 용도와 미상 구분'],
 ['building','건물 속성','엑셀 기준 · 용도·층수·구조·면적'],['height','건물 높이','모델 높이 분포 · 추정값 포함'],['density','건물 밀도','격자별 건물 개수 / ha'],
 ['terrain','지형 고도','제어점 보간 · 영역 최저점 기준'],['view','선택 위치 시야','지형과 건물로 보는 예상 시야']
].map(([id,title,note])=>({id,title,note}));
export const planar=id=>!['volume','view'].includes(id);
export function buildingDensity(cad,size=100){
 const {w,h}=cad.terrain,cols=Math.ceil(w/size),rows=Math.ceil(h/size),counts=new Map();
 for(const b of cad.buildings){const ring=b.poly[0];if(!ring?.length)continue;const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);const x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2,c=Math.min(cols-1,Math.max(0,Math.floor((x+w/2)/size))),r=Math.min(rows-1,Math.max(0,Math.floor((y+h/2)/size))),key=r*cols+c;counts.set(key,(counts.get(key)||0)+1);}
 return Array.from({length:rows*cols},(_,i)=>{const c=i%cols,r=Math.floor(i/cols),x=-w/2+c*size,y=-h/2+r*size,cw=Math.min(size,w/2-x),ch=Math.min(size,h/2-y),count=counts.get(i)||0;return {x,y,w:cw,h:ch,count,value:count/(cw*ch/10000)};});
}
const palette=['#f0ead1','#d8d59c','#b4be7a','#899b64','#596f53'];
export function diagramTheme(items,mode,style){
 if(style==='custom')return items;
 const base={'대지':'#f4f1e9','건물':'#d49a84','도로':'#ffffff','녹지':'#b9c7a3','하천':'#88bdce','바다':'#88bdce','철도':'#72818a','등고선':'#b5b6a7','파라펫':'#9d6d5e'};
 if(mode==='green')Object.assign(base,{'건물':'#e0e1da','도로':'#ffffff','녹지':'#5e8f66','철도':'#b1b8b8'});
 if(mode==='routes')Object.assign(base,{'건물':'#d6d9d8','도로':'#c87358','녹지':'#e6e7dc','철도':'#3e6c81'});
 if(mode==='use-map')Object.assign(base,{'건물':'#d8dad6','녹지':'#e6e8dd'});
 if(mode==='height')Object.assign(base,{'도로':'#ffffff','녹지':'#ecefe6','하천':'#c9dfe4'});
 return items.map(i=>({...i,color:base[i.name]||i.color}));
}
export function contourPaths(points,n,levels){
 const out=[];
 for(const level of levels){let lines=[];for(let j=0;j<n-1;j++)for(let i=0;i<n-1;i++){const a=points[j*n+i],b=points[j*n+i+1],c=points[(j+1)*n+i+1],d=points[(j+1)*n+i];for(const tri of [[a,b,c],[a,c,d]]){const hit=[];for(let k=0;k<3;k++){const p=tri[k],q=tri[(k+1)%3];if((p[2]<level&&q[2]>=level)||(q[2]<level&&p[2]>=level)){const t=(level-p[2])/(q[2]-p[2]);hit.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}if(hit.length===2&&Math.hypot(hit[0][0]-hit[1][0],hit[0][1]-hit[1][1])>1e-8)lines.push(hit);}}out.push({level,lines});}
 return out;
}
const ringArea=r=>Math.abs(r.reduce((a,p,i)=>i?a+r[i-1][0]*p[1]-p[0]*r[i-1][1]:a,0)/2);
const polygonArea=p=>Math.max(0,ringArea(p[0])-p.slice(1).reduce((sum,r)=>sum+ringArea(r),0));
export function analysisDiagram(cad,items,options,mode){
 let selected=diagramTheme(items,mode,options.style),settings={...options};
 const heights=cad.buildings.map(b=>Math.max(0,b.roof-b.bottom)).sort((a,b)=>a-b),greenArea=(cad.covers['녹지']||[]).reduce((sum,p)=>sum+polygonArea(p),0),area=cad.terrain.w*cad.terrain.h;
 settings.stats=[{label:'선택 면적',value:(area/1e6).toFixed(2)+' km²'},{label:'모델 건물',value:cad.buildings.length.toLocaleString()+'개'},{label:mode==='green'?'녹지 면적 비율':'건물 높이 중앙값',value:mode==='green'?(greenArea/area*100).toFixed(1)+'%':heights.length?heights[Math.floor(heights.length/2)].toFixed(1)+'m':'자료 없음'}];
 settings.accent=mode==='green'?'#548461':mode==='height'?'#486c9e':mode==='density'?'#c27644':'#b96955';
 if(mode==='green'||mode==='routes')settings.usage=false;
 if(mode==='fabric'){selected=selected.map(i=>({...i,color:i.name==='건물'?'#25313e':'#ffffff'}));settings.usage=false;}
 if(mode==='use-map')settings.usage=true;
 const buildingMode=['building','height','use-map'].includes(mode);const overlay=buildingMode||['density','terrain'].includes(mode);if(buildingMode){settings.usage=false;settings.gisLabels='none';const field=mode==='height'?'height':mode==='use-map'?'usage':options.buildingField||'levels',a=buildingAnalysis(cad,field,settings),available=a.values.filter(v=>v!==null).length;settings.stats[2]={label:'분류 가능한 건물',value:available.toLocaleString()+' / '+cad.buildings.length.toLocaleString()};}
 if(overlay)selected=selected.filter(i=>i.name!=='건물'&&i.name!=='파라펫');
 const result=siteDiagram(cad,selected,{...settings,legend:overlay?false:settings.legend});
 if(buildingMode){const field=mode==='height'?'height':mode==='use-map'?'usage':options.buildingField||'levels';if(!items.some(i=>i.name==='건물'))return result;return drawBuildingAnalysis(result,cad,field,settings);}
 if(!overlay)return result;
 const l=result.layout,xy=p=>[l.left+(p[0]+l.w/2)*l.scale,l.top+(l.h/2-p[1])*l.scale],path=poly=>poly.map(r=>r.map((p,i)=>(i?'L':'M')+xy(p).join(' ')).join(' ')+'Z').join(' ');
 let shapes='',labels=[],note='';
 if(mode==='density'){
  const size=Math.max(25,Number(options.grid)||100),cells=buildingDensity(cad,size),limits=[10,25,50,100,Infinity];labels=['10 미만','10–25','25–50','50–100','100 이상'].map((name,i)=>({name:name+' 개/ha',color:['#f7f0df','#e9d49b','#deb170','#cb8554','#a3503b'][i]}));
  for(const cell of cells){const [x,y]=xy([cell.x,cell.y+cell.h]);shapes+=`<rect x="${x}" y="${y}" width="${cell.w*l.scale}" height="${cell.h*l.scale}" fill="${['#f7f0df','#e9d49b','#deb170','#cb8554','#a3503b'][limits.findIndex(v=>cell.value<v)]}" stroke="white" stroke-width=".4"/>`;}
  note=`${size}m 격자 · 외곽선 바운딩박스 중심 기준 건물 개수 · 가장자리 격자는 실제 면적으로 보정`;
 }
 if(mode==='terrain'){
  const pts=cad.terrain.points,n=cad.terrain.count;if(!pts?.length||n<2)throw Error('지형 고도 자료가 없습니다.');
  const values=pts.map(p=>p[2]),min=Math.min(...values),max=Math.max(...values),span=max-min;
  for(let j=0;j<n-1;j++)for(let i=0;i<n-1;i++){const a=pts[j*n+i],b=pts[j*n+i+1],c=pts[(j+1)*n+i+1],d=pts[(j+1)*n+i],v=(a[2]+b[2]+c[2]+d[2])/4,idx=span>1e-8?Math.min(4,Math.floor((v-min)/span*5)):0;shapes+=`<path d="${path([[a,b,c,d,a]])}" fill="${palette[idx]}" stroke="${palette[idx]}" stroke-width=".3"/>`;}
  if(span>1e-8){const levels=Array.from({length:11},(_,i)=>min+span*(i+1)/12);for(const contour of contourPaths(pts,n,levels)){shapes+=`<path d="${contour.lines.map(([a,b])=>'M'+xy(a).join(' ')+'L'+xy(b).join(' ')).join(' ')}" fill="none" stroke="#43543f" stroke-width=".75" opacity=".55"/>`;}}
  labels=Array.from({length:span>1e-8?5:1},(_,i)=>({name:span>1e-8?`${(min+span*i/5).toFixed(1)}–${(min+span*(i+1)/5).toFixed(1)}m`:`${min.toFixed(1)}m`,color:palette[i]}));
  note='지형 제어점의 평균 상대 고도 · 해발 고도·정밀 측량값이 아닙니다. Copernicus DSM 기반';
 }
 if(mode==='density'||mode==='terrain'){
  if(items.some(i=>i.name==='도로'))shapes+=`<path d="${(cad.covers['도로']||[]).map(path).join(' ')}" fill="white" fill-rule="evenodd" opacity=".4"/>`;
  if(items.some(i=>i.name==='건물'))shapes+=`<path d="${cad.buildings.map(b=>path(b.poly)).join(' ')}" fill="none" stroke="#3a4a4c" stroke-width=".5" opacity=".35"/>`;
 }
 const legend=settings.legend?labels.map((v,i)=>`<rect x="${64+i*245}" y="${result.height-78}" width="18" height="12" rx="2" fill="${v.color}"/><text x="${90+i*245}" y="${result.height-67}" font-size="14">${v.name}</text>`).join(''):'';
 result.svg=result.svg.replace('<!--ANALYSIS-OVERLAY-->',shapes).replace('<!--ANALYSIS-LEGEND-->',legend).replace('<!--ANALYSIS-NOTE-->',note);
 return result;
}
