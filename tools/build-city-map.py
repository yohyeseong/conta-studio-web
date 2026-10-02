import pathlib,json,gzip,hashlib,sys,collections
from shapely.geometry import shape,mapping,box
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);(out/'tiles').mkdir(parents=True,exist_ok=True)
version='895aa1a4fe0bd79c-city1';groups=collections.defaultdict(list)
for cp in sorted((root/'map-catalog').glob('*.json')):
    cat=json.loads(cp.read_text());assert cat['version']=='895aa1a4fe0bd79c-prepared2'
    for ident,info in cat['tiles'].items():
        x,y=map(int,ident.split('_'));groups[(x//2,y//2)].append((ident,info['overview']))
index={'version':version,'safeOnly':True,'sourceDate':'2026-10-02','step':.1,'tiles':{}}
roads={'motorway','trunk','primary','secondary','tertiary','motorway_link','trunk_link','primary_link','secondary_link','tertiary_link'}
for (x,y),jobs in sorted(groups.items()):
    features={};region=box(x*.1,y*.1,(x+1)*.1,(y+1)*.1)
    for ident,info in jobs:
        data=(root/'map/overview'/f'{ident}.json.gz').read_bytes();assert len(data)==info['bytes'] and hashlib.sha256(data).hexdigest()==info['sha256']
        tile=json.loads(gzip.decompress(data));assert tile['safeOnly'] and tile['version']=='895aa1a4fe0bd79c-prepared2'
        for f in tile['features']:
            t=f['properties'];fid=f['id']
            if fid in features or t.get('building') or t.get('building:part'):continue
            if not (t.get('highway') in roads or t.get('railway') in ('rail','subway','light_rail') or t.get('waterway') in ('river','canal') or t.get('natural') in ('water','wood') or t.get('landuse') in ('forest','grass','recreation_ground') or t.get('leisure')=='park' or t.get('place')):continue
            g=shape(f['geometry']).intersection(region)
            if g.is_empty:continue
            if g.geom_type.endswith('Polygon') and g.area<.000002:continue
            g=g.simplify(.00012,preserve_topology=True)
            if g.is_empty or g.geom_type=='GeometryCollection':continue
            f={**f,'geometry':mapping(g),'bbox':list(g.bounds)};features[fid]=f
    if not features:continue
    ident=f'{x}_{y}';raw=json.dumps({'version':version,'safeOnly':True,'features':list(features.values())},ensure_ascii=False,separators=(',',':')).encode();data=gzip.compress(raw,mtime=0)
    (out/'tiles'/f'{ident}.json.gz').write_bytes(data);index['tiles'][ident]={'bytes':len(data),'rawBytes':len(raw),'sha256':hashlib.sha256(data).hexdigest()}
index['complete']=True;(out/'index.json').write_text(json.dumps(index,separators=(',',':')))
print(json.dumps({'tiles':len(index['tiles']),'bytes':sum(t['bytes'] for t in index['tiles'].values())}))