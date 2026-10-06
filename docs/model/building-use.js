(function(){
 const colors={'주거':'#d9ae79','상업·업무':'#b68bbd','교육':'#81aeca','의료':'#dd9390','공공·문화':'#95b6a5','산업':'#a6a4c4','기타':'#c5bea8','용도 미상':'#deded9'};
 function classify(t){
  const use=String(t['building:use']||t.building||'').toLowerCase(),amenity=String(t.amenity||'').toLowerCase();
  if(['hospital','clinic','doctors','dentist'].includes(amenity)||['hospital','clinic'].includes(use))return '의료';
  if(['school','university','college','kindergarten'].includes(amenity)||['school','university','college','kindergarten'].includes(use))return '교육';
  if(['townhall','library','community_centre','arts_centre','courthouse','police','fire_station','place_of_worship'].includes(amenity)||['civic','public','government','church','cathedral','mosque','temple','museum'].includes(use))return '공공·문화';
  if(t.shop||t.office||['retail','commercial','office','hotel','supermarket','warehouse_retail'].includes(use)||['restaurant','cafe','bank','bar'].includes(amenity))return '상업·업무';
  if(['house','apartments','residential','detached','semidetached_house','terrace','bungalow','dormitory'].includes(use))return '주거';
  if(t.industrial||['industrial','factory','warehouse'].includes(use))return '산업';
  if(use&&!['yes','no','building'].includes(use))return '기타';
  return '용도 미상';
 }
 globalThis.ContaBuildingUse={colors,classify};
})();
