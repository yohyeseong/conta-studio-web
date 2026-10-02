/* Shared map/generation policy. Source tagging is not a complete facility registry. */
(function(root){
const has=(v,word)=>String(v||'').toLowerCase().split(';').map(s=>s.trim()).includes(word);
function tagged(t={}){return (t.military!==undefined&&!['no','false','0',''].includes(String(t.military).toLowerCase()))||['landuse','access','building','aerodrome','operator:type'].some(k=>has(t[k],'military'));}
function box(g){let out=[Infinity,Infinity,-Infinity,-Infinity];function walk(c){if(typeof c?.[0]==='number'){out[0]=Math.min(out[0],c[0]);out[1]=Math.min(out[1],c[1]);out[2]=Math.max(out[2],c[0]);out[3]=Math.max(out[3],c[1]);}else if(Array.isArray(c))c.forEach(walk);}walk(g?.coordinates);return Number.isFinite(out[0])?out:null;}
const overlaps=(a,b)=>a&&b&&a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
function inspect(osm){if(!osm||!Array.isArray(osm.elements)||osm.remark)throw Error('지도 제외 구역 확인에 실패했습니다. 다시 시도하세요.');const geo=osmtogeojson(osm,{flatProperties:true});const excluded=geo.features.filter(f=>tagged(f.properties));const zones=excluded.map(f=>box(f.geometry)).filter(Boolean);const safe=geo.features.filter(f=>{if(tagged(f.properties))return false;const b=box(f.geometry);return !zones.some(z=>overlaps(b,z));});return {geo:{type:'FeatureCollection',features:safe},zones};}
function assertSelection(osm,bounds){const result=inspect(osm);if(result.zones.some(z=>overlaps(z,bounds)))throw Error('선택 영역에 제외 대상 구역이 포함되어 있습니다. 다른 영역을 선택하세요.');return result;}
function query(b,zoom){const [w,s,e,n]=b,bbox=[s,w,n,e].join(',');const tags='^(building|building:part|highway|area:highway|landuse|leisure|natural|waterway|railway|military|access|aerodrome|operator:type)$';return `[out:json][timeout:45][maxsize:33554432];(nwr[~"${tags}"~"."](${bbox});node[place][name](${bbox}););out body;>;out skel qt;`;}

function assertPrepared(value,bounds){if(!value||value.dataVersion!=='4e05284bc04d8ff5-prepared2'||!Array.isArray(value.preparedGeo?.features)||!Array.isArray(value.zones))throw Error('가공 데이터 검증 실패');if(value.zones.some(z=>overlaps(z,bounds)))throw Error('선택 영역에 제외 대상 구역이 포함되어 있습니다. 다른 영역을 선택하세요.');if(value.preparedGeo.features.some(f=>tagged(f.properties)))throw Error('제외 대상 데이터 검증 실패');return {geo:value.preparedGeo,zones:value.zones};}
root.MilitaryPolicy={tagged,box,overlaps,inspect,assertSelection,assertPrepared,query};
})(typeof self!=='undefined'?self:globalThis);
