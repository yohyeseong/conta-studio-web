export function installSelection(map){
 const $=id=>document.getElementById(id);let selection,start,drawMode=false;
 const state={bounds:null,busy:false,ready:false,onChange:null,refresh(){if(!this.bounds)return;const lat=this.bounds.getCenter().lat,w=(this.bounds.getEast()-this.bounds.getWest())*111319.490793*Math.cos(lat*Math.PI/180),h=(this.bounds.getNorth()-this.bounds.getSouth())*111319.490793,valid=w>=1&&h>=1&&w<=3000&&h<=3000&&w*h<=4e6;this.valid=valid;$('area').textContent=`${(w/1000).toFixed(2)} × ${(h/1000).toFixed(2)} km · ${(w*h/1e6).toFixed(3)} km²`;$('generate').disabled=!valid||this.busy||!this.ready;$('status').textContent=!valid?'각 변 1m–3km, 면적 4km² 이하로 선택하세요.':!this.ready?'영역 선택됨 · 3D 작업 공간 준비 중…':'선택 영역 준비됨';}};
 function select(a,b){state.bounds=L.latLngBounds(a,b);if(selection)selection.setBounds(state.bounds);else selection=L.rectangle(state.bounds,{color:'#d99930',weight:2,fillOpacity:.08,interactive:false}).addTo(map);state.onChange?.(state.bounds);state.refresh();}
 map.on('contextmenu',e=>L.DomEvent.preventDefault(e.originalEvent));
 map.on('mousedown',e=>{if(e.originalEvent.button===2&&!state.busy&&!drawMode){start=e.latlng;map.dragging.disable();}});
 map.on('mousemove',e=>{if(start&&!drawMode)select(start,e.latlng);});
 map.on('mouseup',e=>{if(start&&!drawMode){select(start,e.latlng);start=null;map.dragging.enable();}});
 document.addEventListener('mouseup',()=>{if(!drawMode){start=null;map.dragging.enable();}});
 $('select-mode').onclick=()=>{if(state.busy)return;drawMode=!drawMode;start=null;$('select-mode').classList.toggle('active',drawMode);$('select-mode').textContent=drawMode?'두 모서리를 누르세요':'영역 그리기';};
 map.on('click',e=>{if(!drawMode||state.busy)return;if(!start){start=e.latlng;$('status').textContent='반대쪽 모서리를 누르세요.';}else{select(start,e.latlng);start=null;drawMode=false;$('select-mode').classList.remove('active');$('select-mode').textContent='영역 그리기';}});
 return state;
}
