export function installSelection(map){
 const $=id=>document.getElementById(id);let selection,start,drawMode=false;const pane=map.createPane('conta-selection');pane.style.zIndex='750';pane.style.pointerEvents='none';
 const state={bounds:null,busy:false,ready:false,onChange:null,refresh(){if(!this.bounds)return;const lat=this.bounds.getCenter().lat,w=(this.bounds.getEast()-this.bounds.getWest())*111319.490793*Math.cos(lat*Math.PI/180),h=(this.bounds.getNorth()-this.bounds.getSouth())*111319.490793,valid=w>=1&&h>=1&&w<=5000.001&&h<=5000.001&&w*h<=25e6+1;const held=MilitaryPolicy.reviewOverlap([this.bounds.getWest(),this.bounds.getSouth(),this.bounds.getEast(),this.bounds.getNorth()]);this.valid=valid&&!held;$('area').textContent=`${(w/1000).toFixed(2)} × ${(h/1000).toFixed(2)} km · ${(w*h/1e6).toFixed(3)} km²`;$('generate').disabled=!this.valid||this.busy||!this.ready;$('status').textContent=held?'용산 일대 임시 제외 구역이 포함되어 생성할 수 없습니다. 공개 공원 일부를 포함해 경계를 검토 중입니다.':!valid?'각 변 1m–5km, 면적 25km² 이하로 선택하세요.':!this.ready?'영역 선택됨 · 3D 작업 공간 준비 중…':'선택 영역 준비됨';}};
 function select(a,b){state.bounds=L.latLngBounds(a,b);if(selection)selection.setBounds(state.bounds);else selection=L.rectangle(state.bounds,{pane:'conta-selection',color:'#ff9f00',weight:3,fillColor:'#ffb321',fillOpacity:.18,interactive:false}).addTo(map);selection.bringToFront();state.refresh();state.onChange?.(state.bounds);}
 map.on('contextmenu',e=>L.DomEvent.preventDefault(e.originalEvent));
 map.on('mousedown',e=>{if(e.originalEvent.button===2&&!state.busy&&!drawMode){start=e.latlng;map.dragging.disable();}});
 map.on('mousemove',e=>{if(start&&!drawMode)select(start,e.latlng);});
 map.on('mouseup',e=>{if(start&&!drawMode){select(start,e.latlng);start=null;map.dragging.enable();}});
 document.addEventListener('mouseup',()=>{if(!drawMode){start=null;map.dragging.enable();}});
 $('select-mode').onclick=()=>{if(state.busy)return;drawMode=!drawMode;start=null;$('select-mode').classList.toggle('active',drawMode);$('select-mode').textContent=drawMode?'두 모서리를 누르세요':'영역 그리기';};
 map.on('click',e=>{if(!drawMode||state.busy)return;if(!start){start=e.latlng;$('status').textContent='반대쪽 모서리를 누르세요.';}else{select(start,e.latlng);start=null;drawMode=false;$('select-mode').classList.remove('active');$('select-mode').textContent='영역 그리기';}});
 document.querySelectorAll('[data-area-km]').forEach(button=>{button.onclick=()=>{if(state.busy)return;const size=Number(button.dataset.areaKm)*1000,c=map.getCenter(),latHalf=size/2/111319.490793,lonHalf=latHalf/Math.cos(c.lat*Math.PI/180);drawMode=false;start=null;$('select-mode').classList.remove('active');$('select-mode').textContent='영역 그리기';select([c.lat-latHalf,c.lng-lonHalf],[c.lat+latHalf,c.lng+lonHalf]);map.fitBounds(state.bounds,{padding:[18,18],animate:false});};});
 return state;
}

