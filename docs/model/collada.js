// Each layer owns its indices. Input is already triangulated in local meters.
export function collada(items, scale=1) {
  if (!Number.isFinite(scale) || scale<=0) throw Error('잘못된 축척입니다.');
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const geometries=[],effects=[],materials=[],nodes=[];
  items.forEach((item,i)=>{
    const p=Array.from(item.positions), stride=item.lines?6:9;
    if(p.length%stride || p.some(v=>!Number.isFinite(v))) throw Error(`${item.name}: 유효하지 않은 메시 좌표`);
    if(!p.length)return;
    const id=`g${i}`, count=p.length/3;
    const rgb=item.color||[.7,.7,.7];
    if(rgb.length!==3 || rgb.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('잘못된 재질 색상');
    effects.push(`<effect id="e${i}"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${rgb.join(' ')} 1</color></diffuse></lambert></technique></profile_COMMON></effect>`);
    materials.push(`<material id="m${i}" name="${esc(item.name)}"><instance_effect url="#e${i}"/></material>`);
    const primitive=item.lines?'lines':'triangles';
    geometries.push(`<geometry id="${id}" name="${esc(item.name)}"><mesh><source id="${id}p"><float_array id="${id}a" count="${p.length}">${p.map(v=>v*scale).join(' ')}</float_array><technique_common><accessor source="#${id}a" count="${count}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="${id}v"><input semantic="POSITION" source="#${id}p"/></vertices><${primitive} count="${p.length/stride}" material="surface"><input semantic="VERTEX" source="#${id}v" offset="0"/><p>${Array.from({length:count},(_,j)=>j).join(' ')}</p></${primitive}></mesh></geometry>`);
    nodes.push(`<node id="n${i}" name="${esc(item.name)}" type="NODE"><instance_geometry url="#${id}"><bind_material><technique_common><instance_material symbol="surface" target="#m${i}"/></technique_common></bind_material></instance_geometry></node>`);
  });
  if(!geometries.length)throw Error('저장할 표시 레이어가 없습니다.');
  return `<?xml version="1.0" encoding="utf-8"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><contributor><authoring_tool>Conta Studio Web</authoring_tool><comments>Map data © OpenStreetMap contributors, ODbL 1.0. Estimated heights and widths are not surveyed measurements.</comments></contributor><created>2026-09-30T00:00:00Z</created><modified>2026-09-30T00:00:00Z</modified><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset><library_effects>${effects.join('')}</library_effects><library_materials>${materials.join('')}</library_materials><library_geometries>${geometries.join('')}</library_geometries><library_visual_scenes><visual_scene id="Scene" name="Conta Studio">${nodes.join('')}</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#Scene"/></scene></COLLADA>`;
}
