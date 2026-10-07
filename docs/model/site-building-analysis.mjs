import {usageCodes,structureCodes} from './building-legend.mjs?v=legend2';
const esc=s=>String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const buildingFields={
 height:{name:'건물 높이',unit:'m',limits:[10,20,40,80],aliases:['HEIGHT','height']},
 levels:{name:'지상 층수',unit:'층',limits:[2,5,10,20],aliases:['GRND_FLR','building:levels']},
 basement:{name:'지하 층수',unit:'층',limits:[1,2,3,5],aliases:['UGRND_FLR','building:levels:underground']},
 usage:{name:'건물 용도 · 대분류',aliases:['USABILITY'],categorical:true},
 usageDetail:{name:'건물 용도 · 세부 코드',aliases:['USABILITY'],categorical:true},
 structure:{name:'건물 구조',aliases:['STRCT_CD'],categorical:true},
 footprint:{name:'건축면적',unit:'m²',limits:[100,300,1000,3000],aliases:['ARCHAREA']},
 totalarea:{name:'연면적',unit:'m²',limits:[500,2000,10000,50000],aliases:['TOTALAREA']},
 coverage:{name:'건폐율',unit:'%',limits:[20,40,60,80],aliases:['BC_RAT']},
 floorarea:{name:'용적률',unit:'%',limits:[100,200,400,800],aliases:['VL_RAT']},
 approval:{name:'승인연도',unit:'년',limits:[1980,2000,2010,2020],aliases:['USEAPR_DAY']}
};
const source=(p,keys)=>{for(const key of keys){const v=p[key]??p[key.toLowerCase()];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v;}return null;};
export function usageName(properties,detail=false){
 const raw=source(properties,['USABILITY']);if(raw===null)return null;
 const code=String(raw).trim().toUpperCase().replace(/\.0$/,'').padStart(5,'0');let item=usageCodes[code];
 if(!item)return '미등록 용도 코드 '+code;
 if(detail)return item.name+' ('+code+')';
 const seen=new Set();while(item.parent!=='00000'&&usageCodes[item.parent]&&!seen.has(item.parent)){seen.add(item.parent);item=usageCodes[item.parent];}
 return item.name;
}
export function buildingValue(b,field,includeEstimated=true){
 const definition=buildingFields[field],p=b.properties||{};
 if(!definition)return null;
 if(field==='usage'||field==='usageDetail')return usageName(p,field==='usageDetail')||(b.usage&&b.usage!=='용도 미상'?'OSM 분류 · '+b.usage:null);
 let raw=source(p,definition.aliases);
 if(field==='structure')return raw===null?null:structureCodes[String(raw).trim().padStart(2,'0')]||'미등록 구조 코드 '+raw;
 if(field==='height'){
  let value=raw===null?NaN:parseFloat(raw);if(/ft/i.test(String(raw)))value*=.3048;
  if(value>0&&Number.isFinite(value))return value;
  if(b.heightEstimated===false&&b.height>0)return b.height;
  return includeEstimated&&b.roof>b.bottom?b.roof-b.bottom:null;
 }
 if(field==='approval'){
  const date=String(raw??'').replace(/[-./]/g,'');if(!/^\d{8}$/.test(date))return null;
  const y=Number(date.slice(0,4)),m=Number(date.slice(4,6)),d=Number(date.slice(6,8)),check=new Date(Date.UTC(y,m-1,d));
  return y>=1800&&check.getUTCFullYear()===y&&check.getUTCMonth()===m-1&&check.getUTCDate()===d?y:null;
 }
 const value=raw===null?NaN:Number(raw);return Number.isFinite(value)&&value>=0?value:null;
}
export function parseBuildingLimits(text,field){
 const defaults=buildingFields[field]?.limits||[];if(!String(text||'').trim())return defaults;
 const values=String(text).split(/[,，\s]+/).filter(Boolean).map(Number);
 if(!values.length||values.length>6||values.some((v,i)=>!Number.isFinite(v)||v<=0||(i&&v<=values[i-1])))throw Error('분류 경계는 양수 1~6개를 작은 값부터 입력하세요. 예: 10, 20, 40, 80');
 return values;
}
const shades=['#dbe6eb','#b4ced5','#8babbf','#677eaa','#575581','#3e395e','#28263b'];
function categoryColor(name){let h=0;for(const c of name)h=(h*31+c.charCodeAt(0))>>>0;return `hsl(${h%360} 32% 65%)`;}
export function buildingAnalysis(cad,field,options={}){
 const def=buildingFields[field]||buildingFields.height,values=cad.buildings.map(b=>buildingValue(b,field,options.includeEstimated!==false)),groups=[],counts=new Map(),limits=def.categorical?[]:parseBuildingLimits(options.buildingLimits,field);
 if(def.categorical){for(const v of values)if(v!==null)counts.set(v,(counts.get(v)||0)+1);for(const [name,count] of [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])))groups.push({name,color:categoryColor(name),count});}
 else{for(let i=0;i<=limits.length;i++){const name=i===0?limits[0]+def.unit+' 미만':i===limits.length?limits[i-1]+def.unit+' 이상':limits[i-1]+'–'+limits[i]+def.unit;groups.push({name,color:shades[i],count:0});}}
 const missing=values.filter(v=>v===null).length;if(missing)groups.push({name:'자료 없음',color:'#dcdedb',count:missing});
 const assignments=values.map(v=>{if(v===null)return groups.length-1;if(def.categorical)return groups.findIndex(g=>g.name===v);const i=limits.findIndex(n=>v<n),index=i<0?limits.length:i;groups[index].count++;return index;});
 const note='F_FAC_BUILDING.xlsx 속성·코드표 기준 · '+def.name+' · 값 있음 '+(values.length-missing).toLocaleString()+' / '+values.length.toLocaleString()+'개'+(field==='height'?(options.includeEstimated===false?' · 원본 높이만':' · 층수·기본 층고로 추정한 높이 포함'):' · 미수신 값은 자료 없음');
 return {groups,assignments,values,note};
}
export function drawBuildingAnalysis(result,cad,field,options){
 const analysis=buildingAnalysis(cad,field,options),l=result.layout,xy=p=>[l.left+(p[0]+l.w/2)*l.scale,l.top+(l.h/2-p[1])*l.scale],path=p=>p.map(r=>r.map((p,i)=>(i?'L':'M')+xy(p).join(' ')).join(' ')+'Z').join(' ');
 let shapes='';cad.buildings.forEach((b,i)=>{const color=analysis.groups[analysis.assignments[i]]?.color||'#dcdedb';shapes+=`<path d="${path(b.poly)}" fill="${color}" fill-rule="evenodd" stroke="${options.outline===false?color:'#374151'}" stroke-width=".65"/>`;if(options.buildingLabels&&analysis.values[i]!==null){const r=b.poly[0],xs=r.map(p=>p[0]),ys=r.map(p=>p[1]),[x,y]=xy([(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2]),v=analysis.values[i],text=typeof v==='number'?Number(v.toFixed(1))+(buildingFields[field]?.unit||''):v;shapes+=`<text x="${x}" y="${y}" text-anchor="middle" font-size="${options.labelSize||9}" fill="#27343c" stroke="white" stroke-width="2.8" paint-order="stroke">${esc(text)}</text>`;}});
 // Long code legends extend the sheet instead of covering the map or dropping categories.
 const wrap=s=>Array.from(String(s)).reduce((a,c,i)=>{if(i%30===0)a.push('');a[a.length-1]+=c;return a;},[]),lines=analysis.groups.map(g=>wrap(g.name+' · '+g.count.toLocaleString()+'개')),lineCount=Math.max(1,...lines.map(a=>a.length)),rowHeight=lineCount*14+12;
 const rows=options.legend===false?0:Math.ceil(analysis.groups.length/3),extra=Math.max(0,rows*rowHeight-38),old=result.height;
 if(extra){result.height+=extra;result.svg=result.svg.replace(`height="${old}" viewBox="0 0 ${result.width} ${old}"`,`height="${result.height}" viewBox="0 0 ${result.width} ${result.height}"`);result.svg=result.svg.replace(`<path d="M48 ${old-37}H1352"`, `<path d="M48 ${result.height-37}H1352"`).replace(`<text x="48" y="${old-16}"`, `<text x="48" y="${result.height-16}"`);}
 const legend=options.legend===false?'':analysis.groups.map((g,i)=>{const x=64+i%3*430,y=old-78+Math.floor(i/3)*rowHeight;return `<rect x="${x}" y="${y}" width="14" height="12" rx="2" fill="${g.color}"/><text x="${x+21}" y="${y+11}" font-size="12">${lines[i].map((line,j)=>`<tspan x="${x+21}" dy="${j?14:0}">${esc(line)}</tspan>`).join('')}</text>`;}).join('');
 result.svg=result.svg.replace('<!--ANALYSIS-OVERLAY-->',shapes).replace('<!--ANALYSIS-NOTE-->',esc(analysis.note)).replace('<!--ANALYSIS-LEGEND-->',legend);result.analysis=analysis;return result;
}
