import {polygonizeBoundaries} from './ngii-boundary.mjs?v=curb1';
// B010/B020 share SHP layer codes; retain their original geometry and attributes.
const decoder=new TextDecoder('utf-8'),overlap=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const fail=message=>{throw Error(message);};
async function bytes(blob,start,length){if(start<0||length<0||start+length>blob.size)fail('ZIP 파일의 위치 정보가 손상됐습니다.');return new Uint8Array(await blob.slice(start,start+length).arrayBuffer());}
const view=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const crcTable=Uint32Array.from({length:256},(_,v)=>{for(let j=0;j<8;j++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export async function zipDirectory(blob){
 if(blob.size>1024**3)fail('ZIP은 1GB 이하로 나누어 불러오세요.');
 const tail=await bytes(blob,Math.max(0,blob.size-65557),Math.min(blob.size,65557)),v=view(tail);let at=-1;
 for(let i=tail.length-22;i>=0;i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===tail.length){at=i;break;}
 if(at<0)fail('올바른 ZIP 파일이 아닙니다.');
 const count=v.getUint16(at+10,true),size=v.getUint32(at+12,true),offset=v.getUint32(at+16,true);
 if(v.getUint16(at+4,true)||v.getUint16(at+6,true)||count===65535||size===0xffffffff||offset===0xffffffff)fail('분할 ZIP·ZIP64는 지원하지 않습니다. 일반 ZIP으로 다시 압축하세요.');
 if(size>16*1024**2)fail('ZIP의 파일 목록이 너무 큽니다.');
 const data=await bytes(blob,offset,size),d=view(data),entries=new Map();let p=0;
 for(let i=0;i<count;i++){
  if(p+46>data.length||d.getUint32(p,true)!==0x02014b50)fail('ZIP 파일 목록이 손상됐습니다.');
  const flags=d.getUint16(p+8,true),method=d.getUint16(p+10,true),crc=d.getUint32(p+16,true),compressed=d.getUint32(p+20,true),length=d.getUint32(p+24,true),nl=d.getUint16(p+28,true),el=d.getUint16(p+30,true),cl=d.getUint16(p+32,true),local=d.getUint32(p+42,true);
  if(p+46+nl+el+cl>data.length)fail('ZIP 파일명이 손상됐습니다.');
  const name=decoder.decode(data.subarray(p+46,p+46+nl)).replace(/\\/g,'/'),key=name.toLowerCase();
  if(entries.has(key))fail('같은 이름의 파일이 ZIP에 중복되어 있습니다.');
  entries.set(key,{name,flags,method,crc,compressed,length,local});p+=46+nl+el+cl;
 }
 return entries;
}
export async function zipMember(blob,e){
 if(!e)fail('SHP의 연결 파일이 빠져 있습니다.');if(e.flags&1)fail('암호화된 ZIP은 지원하지 않습니다.');
 if(e.length>150*1024**2)fail(e.name+' 파일이 너무 큽니다. 영역을 나누어 받으세요.');
 const h=view(await bytes(blob,e.local,30));if(h.getUint32(0,true)!==0x04034b50)fail('ZIP 데이터가 손상됐습니다.');
 const start=e.local+30+h.getUint16(26,true)+h.getUint16(28,true),compressed=await bytes(blob,start,e.compressed);
 let out;if(e.method===0)out=compressed;else if(e.method===8){
  if(typeof DecompressionStream==='undefined')fail('현재 브라우저는 ZIP 압축 해제를 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용하세요.');
  const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let total=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>e.length||total>150*1024**2)fail('ZIP의 실제 압축 해제 크기가 올바르지 않습니다.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
  out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}
 }else fail('지원하지 않는 ZIP 압축 방식입니다.');
 if(out.length!==e.length||crc32(out)!==e.crc)fail(e.name+' 파일의 무결성 검사에 실패했습니다.');return out;
}
export function dbfRecords(b,encoding='utf-8'){
 if(b.length<33)fail('DBF 헤더가 올바르지 않습니다.');const v=view(b),count=v.getUint32(4,true),header=v.getUint16(8,true),size=v.getUint16(10,true),fields=[];let p=32,fieldSize=1;
 if(header>b.length||header<33||size<1||count>1e6||header+count*size>b.length)fail('DBF 레코드 크기가 올바르지 않습니다.');
 let text;try{text=new TextDecoder(encoding.replace(/^65001$/,'utf-8').replace(/^(949|51949|cp949)$/i,'euc-kr'));}catch{fail('지원하지 않는 DBF 문자 인코딩: '+encoding);}
 while(p+32<=header&&b[p]!==13){const name=text.decode(b.subarray(p,p+11)).split('\0')[0].toLowerCase(),type=String.fromCharCode(b[p+11]),length=b[p+16];fields.push({name,type,length});fieldSize+=length;p+=32;}
 if(b[p]!==13||fieldSize!==size)fail('DBF 필드 정의가 올바르지 않습니다.');
 return Array.from({length:count},(_,i)=>{let at=header+i*size;if(b[at]===42)return null;at++;const result={};for(const f of fields){const raw=text.decode(b.subarray(at,at+f.length)).replace(/\0/g,'').trim();at+=f.length;result[f.name]=['N','F'].includes(f.type)?raw===''?null:Number.isFinite(Number(raw))?Number(raw):null:raw;}return result;});
}
function area(r){return r.reduce((sum,p,i)=>i?sum+r[i-1][0]*p[1]-p[0]*r[i-1][1]:sum,0)/2;}
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++)if((ring[i][1]>p[1])!==(ring[j][1]>p[1])&&p[0]<(ring[j][0]-ring[i][0])*(p[1]-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0])yes=!yes;return yes;}
export function polygonParts(rings){
 // SHP shells are clockwise, holes counterclockwise. Assign holes by containment,
 // including multiple shells in one record; never flatten holes into filled roads.
 const shells=rings.filter(r=>area(r)<0).map(r=>[r]),holes=rings.filter(r=>area(r)>0);
 if(!shells.length&&holes.length)fail('SHP 면의 외곽 링 방향이 올바르지 않습니다.');
 for(const r of holes){const candidates=shells.filter(p=>inside(r[0],p[0])).sort((a,b)=>Math.abs(area(a[0]))-Math.abs(area(b[0])));if(!candidates.length)fail('SHP 면의 내부 구멍을 외곽에 연결할 수 없습니다.');candidates[0].push(r);}
 return shells;
}
export function shapeRecords(b,records,project){
 const v=view(b);if(b.length<100||v.getInt32(0)!==9994||v.getInt32(28,true)!==1000||v.getInt32(24)*2!==b.length)fail('SHP 헤더가 올바르지 않습니다.');
 let at=100,index=0;const result=[];
 while(at<b.length){if(at+12>b.length)fail('SHP 레코드가 잘렸습니다.');const length=v.getInt32(at+4)*2,start=at+8,end=start+length;if(length<4||end>b.length)fail('SHP 레코드 길이가 올바르지 않습니다.');const type=v.getInt32(start,true),properties=records[index++];at=end;
  if(type===0||properties===null)continue;if(![3,5,13,15,23,25].includes(type))fail('도로·인도 SHP는 선 또는 면 형식이어야 합니다.');
  if(length<44)fail('SHP 도형이 손상됐습니다.');const parts=v.getInt32(start+36,true),count=v.getInt32(start+40,true),pointAt=start+44+parts*4;if(parts<1||count<2||pointAt+count*16>end)fail('SHP 좌표 개수가 올바르지 않습니다.');
  const starts=Array.from({length:parts},(_,i)=>v.getInt32(start+44+i*4,true));starts.push(count);if(starts[0]!==0||starts.some((n,i)=>n<0||n>count||(i&&n<=starts[i-1])))fail('SHP 부분 도형 정보가 올바르지 않습니다.');
  const rings=[];for(let j=0;j<parts;j++){const ring=[];for(let i=starts[j];i<starts[j+1];i++){const x=v.getFloat64(pointAt+i*16,true),y=v.getFloat64(pointAt+i*16+8,true);if(!Number.isFinite(x)||!Number.isFinite(y))fail('유효하지 않은 SHP 좌표입니다.');ring.push([x,y]);}if([5,15,25].includes(type)){if(ring.length<4||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])fail('닫히지 않은 도로 면이 있습니다.');}rings.push(ring);}
  const polygons=[5,15,25].includes(type)?polygonParts(rings):null,convert=r=>r.map(p=>{const q=project(p);if(!q.every(Number.isFinite)||Math.abs(q[0])>180||Math.abs(q[1])>90)fail('좌표 변환 결과가 올바르지 않습니다. PRJ를 확인하세요.');return q.slice(0,2);}),geometry=polygons?{type:'MultiPolygon',coordinates:polygons.map(p=>p.map(convert))}:{type:'MultiLineString',coordinates:rings.map(convert)},bbox=[Infinity,Infinity,-Infinity,-Infinity];
  const walk=c=>{if(typeof c[0]==='number'){bbox[0]=Math.min(bbox[0],c[0]);bbox[1]=Math.min(bbox[1],c[1]);bbox[2]=Math.max(bbox[2],c[0]);bbox[3]=Math.max(bbox[3],c[1]);}else c.forEach(walk);};walk(geometry.coordinates);result.push({type:'Feature',geometry,properties,bbox});
 }
 if(index!==records.length)fail('SHP와 DBF의 레코드 수가 다릅니다.');return result;
}
export async function importNgiiZip(blob,proj4,onProgress=()=>{},clipping=globalThis.polygonClipping){
 onProgress('ZIP의 원본 선·도로 목록 확인 중',5);const directory=await zipDirectory(blob),layers=[...directory].filter(([name])=>/\.shp$/i.test(name)&&/^(?:n\d[al]_)?[abcdefh]\d{3}/i.test(name.split('/').at(-1))),features=[],buildingFeatures=[],references=[],sourceLines=[],warnings=[],summary=[];let bbox=[Infinity,Infinity,-Infinity,-Infinity];
 if(layers.length>200||[...directory].filter(([name])=>layers.some(([key])=>name.slice(0,name.lastIndexOf('.'))===key.slice(0,-4))).reduce((sum,[,e])=>sum+e.length,0)>250*1024**2)fail('도로·인도 자료가 너무 큽니다. 영역을 나누어 불러오세요.');
 if(!layers.length)fail('도로경계 A001·도로중심선 A002·인도 A003 SHP를 찾지 못했습니다.');
 for(let i=0;i<layers.length;i++){
  const [key,entry]=layers[i],stem=key.slice(0,-4),code=stem.split('/').at(-1).match(/[abcdefh]\d{3}/i)[0].toUpperCase();onProgress(entry.name+' 읽는 중',10+Math.round(i/layers.length*75));
  const dbf=directory.get(stem+'.dbf'),prj=directory.get(stem+'.prj');if(!dbf||!prj)fail(entry.name+'의 DBF 또는 PRJ가 빠져 있습니다.');
  const cpg=directory.get(stem+'.cpg'),encoding=cpg?decoder.decode(await zipMember(blob,cpg)).trim():'euc-kr',wkt=decoder.decode(await zipMember(blob,prj));let conversion;
  try{conversion=proj4(wkt,'EPSG:4326');}catch{fail(entry.name+'의 좌표계를 읽지 못했습니다.');}
  const records=dbfRecords(await zipMember(blob,dbf),encoding),shapes=shapeRecords(await zipMember(blob,entry),records,p=>conversion.forward(p));let imported=0,skipped=0;
  for(const f of shapes){const p=f.properties,polygon=f.geometry.type==='MultiPolygon';
   // B010 uses Korean DBF field names; B020 uses abbreviated English names.
   // Preserve originals for GIS diagrams and add common aliases for generation.
   for(const [field,alias] of Object.entries({'명칭':'name','주기':'anno','층수':'nmly','폭':'widt','높이':'height','도로명':'addr:street','건물본번':'addr:housenumber','용도':'building:use:original'}))if(p[field]!==undefined&&p[alias]===undefined)p[alias]=p[field];
   const usage=String(p['용도']||'');
   if(usage)p['building:use']=/주거|주택|아파트/.test(usage)?'residential':/교육|학교/.test(usage)?'school':/의료|병원/.test(usage)?'hospital':/상업|업무|판매|숙박/.test(usage)?'commercial':/공업|산업|공장|창고/.test(usage)?'industrial':/공공|문화|종교/.test(usage)?'public':'other';f.id='ngii/'+stem+'/'+(p.gid||p.ufid||imported+skipped);p.source_layer=entry.name;p.geometry_source='국토정보플랫폼 수치지도';p.ngii_import=true;
   const label=({A001:'도로경계',A002:'도로중심선',A003:'인도경계',A004:'횡단보도',A005:'안전지대',A006:'육교',A007:'교량',A008:'교차로',A009:'입체교차부',A016:'철도경계',A017:'철도중심선',B001:'건물경계',B002:'담장',F001:'원본 등고선',H001:'행정경계'})[code]||code;
   const coordinates=polygon?f.geometry.coordinates.flat():f.geometry.coordinates;
   sourceLines.push({...f,geometry:{type:'MultiLineString',coordinates},properties:{...p,source_line_layer:'원본 선 · '+label}});
   if(code==='B001'&&polygon){
    p.ngii_kind='building';p.building=({BDK001:'house',BDK002:'residential',BDK003:'apartments',BDK005:'roof'})[p.kind]||({'일반주택':'house','공동주택':'residential','아파트':'apartments','무벽건물':'roof'})[p['종류']]||'yes';const levels=Number(p.nmly);if(levels>0&&levels<1000)p['building:levels']=levels;
    const height=Number(p.height??p.heig??p.buld_hght);if(height>0&&height<2000)p.height=height;else delete p.height;
    p.name=p.name||p.anno||'';buildingFeatures.push(f);imported++;
   }
   else if(code==='A004'&&polygon){p.ngii_kind='crosswalk';features.push(f);imported++;}
   else if(code==='A001'&&polygon){p['area:highway']='road';p.ngii_kind='road';features.push(f);imported++;}
   else if(code==='A003'){
    p.ngii_kind='sidewalk';p.ngii_sidewalk=true;p.highway='footway';features.push(f);imported++;
   }else{p.ngii_kind='reference';if(['A001','A002'].includes(code))references.push(f);skipped++;}
  }
  summary.push({layer:entry.name,code,records:records.length,imported,references:skipped});
 }
 const roadLayerPresent=summary.some(s=>s.code==='A001'&&s.imported>0);
 if(!features.length&&!buildingFeatures.length&&!sourceLines.length)fail('생성할 수 있는 면이나 원본 선이 없습니다.');
 for(const f of (features.length||buildingFeatures.length?[...features,...buildingFeatures]:sourceLines))bbox=[Math.min(bbox[0],f.bbox[0]),Math.min(bbox[1],f.bbox[1]),Math.max(bbox[2],f.bbox[2]),Math.max(bbox[3],f.bbox[3])];
 const rawSidewalks=features.filter(f=>f.properties.ngii_kind==='sidewalk'),lineFeatures=rawSidewalks.filter(f=>f.geometry.type==='MultiLineString'),origin=[(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2],mx=111319.490793*Math.cos(origin[1]*Math.PI/180),my=111319.490793;
 const local=p=>[(p[0]-origin[0])*mx,(p[1]-origin[1])*my],world=p=>[p[0]/mx+origin[0],p[1]/my+origin[1]];
 onProgress('인도 경계선을 연결해 닫힌 면 확인 중',90);
 const boundary=polygonizeBoundaries(lineFeatures.flatMap(f=>f.geometry.coordinates.map(r=>r.map(local))));
 const widths=lineFeatures.flatMap(f=>f.geometry.coordinates.map(()=>Number(f.properties.widt))),ringArea=r=>Math.abs(r.reduce((sum,p,i)=>i?sum+r[i-1][0]*p[1]-p[0]*r[i-1][1]:sum,0)/2),perimeter=r=>r.reduce((sum,p,i)=>i?sum+Math.hypot(p[0]-r[i-1][0],p[1]-r[i-1][1]):sum,0);
 // Attribute widths only reject ambiguous parcel interiors. They never generate,
 // offset, expand or otherwise change a boundary vertex.
 let ambiguousFaces=0;let confirmed=boundary.polygons.filter((poly,i)=>{const known=boundary.polygonSources[i].map(id=>widths[id]).filter(v=>v>0&&v<=100),area=ringArea(poly[0])-poly.slice(1).reduce((sum,r)=>sum+ringArea(r),0),p=poly.reduce((sum,r)=>sum+perimeter(r),0),limit=known.length?Math.max(...known):null,valid=limit!==null?2*area/p<=limit+boundary.tolerance*2:poly.length>1;if(!valid)ambiguousFaces++;return valid;});
 // Some sidewalk loops close against an A001 road boundary, rather than another
 // A003 edge. Polygonize the source network together; never invent connecting lines.
 let roadBoundaryFaces=0,remainingOpen=boundary.openSegments.length;
 if(clipping&&lineFeatures.length){
  onProgress('도로 경계와 인도 경계를 함께 연결 중',93);
  const sidewalkLines=lineFeatures.flatMap(f=>f.geometry.coordinates.map(r=>r.map(local))),roadLines=features.filter(f=>f.properties.ngii_kind==='road').flatMap(f=>f.geometry.coordinates.flatMap(poly=>poly.map(r=>r.map(local))));
  const segments=[...sidewalkLines,...roadLines].reduce((n,r)=>n+r.length-1,0);
  if(segments<=15000){
   const network=polygonizeBoundaries([...sidewalkLines,...roadLines]),extra=[];
   for(let i=0;i<network.polygons.length;i++){
    const ids=network.polygonSources[i],known=ids.filter(id=>id<widths.length).map(id=>widths[id]).filter(v=>v>0&&v<=100);
    if(!known.length||!ids.some(id=>id>=widths.length))continue;
    const poly=network.polygons[i],a=ringArea(poly[0])-poly.slice(1).reduce((n,r)=>n+ringArea(r),0),p=poly.reduce((n,r)=>n+perimeter(r),0);
    if(2*a/p<=Math.max(...known)+network.tolerance*2)extra.push(poly);
   }
   if(extra.length){confirmed=clipping.union(...[...confirmed,...extra].map(poly=>[poly]));roadBoundaryFaces=extra.length;}
   remainingOpen=network.openSegments.length;
  }else warnings.push('큰 파일은 인도 단독 경계만 연결했습니다. 도로 연결 보완은 영역을 나누어 불러오세요.');
 }
 const derived=confirmed.map((poly,i)=>{const coordinates=poly.map(r=>r.map(world)),points=coordinates.flat(),bb=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];return {type:'Feature',id:'ngii/sidewalk-face/'+i,bbox:bb,geometry:{type:'MultiPolygon',coordinates:[coordinates]},properties:{ngii_import:true,ngii_kind:'sidewalk',ngii_sidewalk:true,boundary_polygonized:true,geometry_source:'국토정보플랫폼 연속수치지도 경계선 연결',source_layer:'A003',highway:'footway'}};});
 for(const f of lineFeatures)references.push({...f,id:f.id+'/source-boundary',properties:{...f.properties,ngii_kind:'reference',boundary_source:true}});
 const retained=features.filter(f=>f.properties.ngii_kind!=='sidewalk'||f.geometry.type==='MultiPolygon');features.splice(0,features.length,...retained,...derived);
 const boundaryStats={records:rawSidewalks.length,faces:derived.length,openSegments:remainingOpen,originalOpenSegments:boundary.openSegments.length,roadBoundaryFaces,tolerance:boundary.tolerance,ambiguousFaces};
 if(ambiguousFaces)warnings.push('인도로 확인되지 않은 닫힌 영역 '+ambiguousFaces+'개는 면을 만들지 않았습니다.');
 if(remainingOpen)warnings.push('닫히지 않은 인도 경계 '+remainingOpen+'구간은 면을 만들지 않았습니다.');
 const crosswalks=sourceLines.filter(f=>f.properties.source_line_layer==='원본 선 · 횡단보도').length;
 onProgress('도로·인도 좌표 변환 완료',100);return {features,roadLayerPresent,buildingFeatures,buildingLayerPresent:summary.some(s=>s.code==='B001'),references,sourceLines,crosswalks,bbox,summary,warnings,boundaryStats,roads:features.filter(f=>f.properties.ngii_kind==='road').length,sidewalks:features.filter(f=>f.properties.ngii_kind==='sidewalk').length,version:'ngii-b010-1'};
}
export const featuresForBounds=(dataset,bounds,sidewalks=true)=>({...dataset,buildingFeatures:(dataset.buildingFeatures||[]).filter(f=>overlap(f.bbox,bounds)),features:dataset.features.filter(f=>overlap(f.bbox,bounds)&&(sidewalks||f.properties.ngii_kind!=='sidewalk')),references:dataset.references.filter(f=>overlap(f.bbox,bounds)),sourceLines:(dataset.sourceLines||[]).filter(f=>overlap(f.bbox,bounds))});
