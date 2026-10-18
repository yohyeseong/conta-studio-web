import {featuresForBounds} from './ngii-zip.mjs?v=source1';
export function setupRoadImport(map,{canChange,onChange,onGenerate}){
 const $=id=>document.getElementById(id),input=$('road-zip-file'),choose=$('road-zip-open'),clear=$('road-zip-clear'),generate=$('road-zip-generate'),cancel=$('road-zip-cancel'),note=$('road-zip-status'),sidewalks=$('road-zip-sidewalks');
 choose.disabled=false;
 if(!map.getPane('conta-imported-roads')){const pane=map.createPane('conta-imported-roads');pane.style.zIndex='590';pane.style.pointerEvents='none';}
 let generating=false;
 const refreshControls=()=>{choose.disabled=!!worker||generating||!canChange();clear.disabled=!data||!!worker||generating||!canChange();generate.hidden=!data;generate.disabled=!data||!!worker||generating||!canChange();generate.textContent=generating?'생성 중…':'선택 파일로 콘타 생성';};
 let data=null,revision=0,overlay=null,worker=null,timer=null,sequence=0;
 const show=message=>note.textContent=message,finish=()=>{clearTimeout(timer);worker?.terminate();worker=null;cancel.hidden=true;choose.disabled=false;input.value='';refreshControls();},redraw=()=>{
  if(overlay)map.removeLayer(overlay);if(!data){overlay=null;return;}
  overlay=L.geoJSON({type:'FeatureCollection',features:[...data.features,...(data.buildingFeatures||[])].filter(f=>(sidewalks.checked||f.properties.ngii_kind!=='sidewalk')&&!MilitaryPolicy.tagged(f.properties)&&!MilitaryPolicy.reviewZones.some(z=>MilitaryPolicy.overlaps(z.bbox,f.bbox)))},{pane:'conta-imported-roads',interactive:false,style:f=>({color:f.properties.ngii_kind==='building'?'#5d6872':f.properties.ngii_kind==='sidewalk'?'#c08b50':'#386a85',weight:f.properties.ngii_kind==='sidewalk'?2:1,fillColor:'#7299ab',fillOpacity:.3})}).addTo(map);
 };
 choose.onclick=()=>{if(!canChange()){show('모델 생성이 끝난 뒤 자료를 변경하세요.');return;}input.click();};
 cancel.onclick=()=>{sequence++;finish();show('불러오기를 취소했습니다. 이전 자료는 유지됩니다.');};
 clear.onclick=()=>{if(!canChange())return;data=null;revision++;redraw();refreshControls();onChange();show('ZIP 적용을 해제했습니다. 기본 도로 자료로 다시 생성할 수 있습니다.');};
 generate.onclick=async()=>{
  if(!data||worker||generating||!canChange())return;
  const [w,s,e,n]=data.bbox,b=L.latLngBounds([s,w],[n,e]),lat=b.getCenter().lat,width=(e-w)*111319.490793*Math.cos(lat*Math.PI/180),height=(n-s)*111319.490793;
  if(width<=5000&&height<=5000&&width*height<=25e6){map.fitBounds(b,{padding:[24,24],animate:false});window.contaSelection.setBounds(b);}
  const selected=window.contaSelection.bounds;
  if(!window.contaSelection.valid||!selected||selected.getEast()<w||selected.getWest()>e||selected.getNorth()<s||selected.getSouth()>n){show('파일 범위 안에서 각 변 5km·면적 25km² 이하의 생성 가능한 영역을 선택하세요.');return;}
  generating=true;refreshControls();
  try{await onGenerate();}finally{generating=false;refreshControls();}
 };
 sidewalks.onchange=()=>{if(!canChange()){sidewalks.checked=!sidewalks.checked;return;}revision++;redraw();onChange();show(data?'인도 '+(sidewalks.checked?'포함':'제외')+' · 선택 영역으로 다시 생성하세요.':'ZIP을 먼저 불러오세요.');};
 input.onchange=()=>{const file=input.files?.[0];if(!file)return;if(!canChange()){input.value='';return;}
  const current=++sequence;choose.disabled=true;clear.disabled=true;generate.disabled=true;cancel.hidden=false;show('ZIP 파일 목록 확인 중…');worker=new Worker('shp-import-worker.js?v=source1');timer=setTimeout(()=>{if(current===sequence){sequence++;finish();show('불러오기 시간이 초과됐습니다. 자료를 작은 영역으로 나누어 주세요.');}},120000);
  worker.onmessage=e=>{if(current!==sequence)return;const {result,error,message,progress}=e.data;if(message)show(message+' · '+progress+'%');
   if(error){finish();show('불러오기 실패: '+error+' 이전 자료는 유지됩니다.');return;}if(!result)return;
   data=result;data.filename=file.name;revision++;finish();redraw();onChange();
   const [w,s,east,n]=data.bbox,b=L.latLngBounds([s,w],[n,east]),lat=b.getCenter().lat,width=(east-w)*111319.490793*Math.cos(lat*Math.PI/180),height=(n-s)*111319.490793;
   map.fitBounds(b,{padding:[24,24],animate:false});if(width<=5000&&height<=5000&&width*height<=25e6)window.contaSelection.setBounds(b);
   show(file.name+' · 도로 면 '+data.roads+'개 · 인도 '+data.sidewalks+'개 · 참고 선 '+data.references.length+'개'+(data.boundaryStats?.openSegments?' · 열린 경계 '+data.boundaryStats.openSegments+'구간 면 생성 제외':'')+(data.boundaryStats?.ambiguousFaces?' · 확인 필요 '+data.boundaryStats.ambiguousFaces+'영역 제외':'')+' · 파일 건물 '+(data.buildingFeatures?.length||0)+'개'+' · 원본 선 '+data.sourceLines.length+'개 · 횡단보도 '+data.crosswalks+'개(현재 ZIP 기준)'+' · '+(width>5000||height>5000?'사용할 영역을 선택하세요.':'선택 파일로 콘타 생성 버튼을 누르세요.'));
  };worker.onerror=e=>{if(current!==sequence)return;finish();show('ZIP 처리 오류: '+(e.message||'파일을 확인하세요.')+' 이전 자료는 유지됩니다.');};worker.postMessage({file});
 };
 return {hasRiverElevation:()=>!!(data?.waterFeatures?.length&&data?.elevationFeatures?.length),refreshControls,get loading(){return !!worker;},key:()=>revision+':'+sidewalks.checked,forBounds:bounds=>data?featuresForBounds(data,bounds,sidewalks.checked):null,summary:()=>data?'ZIP 도로 '+data.roads+'개 · 인도 '+(sidewalks.checked?data.sidewalks:0)+'개 · 파일 건물 '+(data.buildingFeatures?.length||0)+'개':''};
}
