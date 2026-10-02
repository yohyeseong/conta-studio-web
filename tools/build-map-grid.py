import argparse,concurrent.futures,gzip,hashlib,json,math,pathlib,time
from shapely.geometry import shape,mapping,box
from shapely import make_valid
VERSION='895aa1a4fe0bd79c-mapgrid1'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def checked(root,path,info):
    data=(root/path).read_bytes()
    assert len(data)==info['bytes'] and hashlib.sha256(data).hexdigest()==info['sha256']
    raw=gzip.decompress(data);assert len(raw)==info['rawBytes'];return json.loads(raw)
def write(root,path,value):
    raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode();data=gzip.compress(raw,compresslevel=6,mtime=0)
    p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    return {'bytes':len(data),'rawBytes':len(raw),'sha256':hashlib.sha256(data).hexdigest()}
def column(task):
    source,dest,c=task;source=pathlib.Path(source);dest=pathlib.Path(dest)
    base=source/'prepared/20261002';roads=source/'supplemental/official-roads-20260914'
    cat=read(base/'map-catalog'/f'{c}.json');assert cat['version']=='895aa1a4fe0bd79c-prepared2'
    roadcat=read(roads/'catalog'/f'{c}.json')['tiles'] if (roads/'catalog'/f'{c}.json').exists() else {}
    count=total=0
    for ident in sorted(set(cat['tiles'])|set(roadcat)):
        if ident in cat['tiles']:
            tile=checked(base,f'map/detail/{ident}.json.gz',cat['tiles'][ident]['detail']);assert tile['safeOnly'] and tile['version']==cat['version']
            features={str(f['id']):f for f in tile['features']}
        else:features={}
        if ident in roadcat:
            roadtile=checked(roads,f'tiles/{ident}.json.gz',roadcat[ident]);assert roadtile['safeOnly'] and roadtile['version']=='official-roads-20260914-safe-v1'
            for f in roadtile['features']:features.setdefault(str(f['id']),f)
        px,py=map(int,ident.split('_'));buckets={}
        for f in features.values():
            dimension=2 if f['geometry']['type'].endswith('Polygon') else 1 if f['geometry']['type'].endswith('LineString') else 0
            geom=shape(f['geometry'])
            if not geom.is_valid:geom=make_valid(geom)
            if geom.is_empty:continue
            x0,y0,x1,y1=geom.bounds
            for x in range(max(px*5,math.floor(x0/.01)),min(px*5+4,math.floor(x1/.01))+1):
                for y in range(max(py*5,math.floor(y0/.01)),min(py*5+4,math.floor(y1/.01))+1):
                    region=box(x*.01,y*.01,(x+1)*.01,(y+1)*.01)
                    clipped=geom.intersection(region)
                    if clipped.is_empty:continue
                    # Intersection may include degenerate boundary points: keep the source dimension.
                    if clipped.geom_type=='GeometryCollection':
                        from shapely.ops import unary_union
                        parts=[p for p in clipped.geoms if (p.geom_type.endswith('Polygon') if dimension==2 else p.geom_type.endswith('LineString') if dimension==1 else p.geom_type.endswith('Point'))]
                        if not parts:continue
                        clipped=unary_union(parts)
                    if dimension==2 and not clipped.geom_type.endswith('Polygon'):continue
                    if dimension==1 and not clipped.geom_type.endswith('LineString'):continue
                    key=f'{x}_{y}';item={'type':'Feature','id':str(f['id'])+'@'+key,'geometry':mapping(clipped),'properties':f['properties'],'bbox':list(clipped.bounds)}
                    buckets.setdefault(key,[]).append(item)
        entries={}
        for key,items in buckets.items():
            entries[key]=write(dest,f'tiles/{key}.json.gz',{'schema':1,'version':VERSION,'safeOnly':True,'type':'FeatureCollection','features':items});count+=1;total+=entries[key]['bytes']
        (dest/'catalog').mkdir(parents=True,exist_ok=True)
        (dest/'catalog'/f'{ident}.json').write_text(json.dumps({'schema':1,'version':VERSION,'tiles':entries},separators=(',',':')))
    return count,total
def main():
    parser=argparse.ArgumentParser();parser.add_argument('source');parser.add_argument('output');parser.add_argument('--workers',type=int,default=2);parser.add_argument('--columns');a=parser.parse_args()
    source=pathlib.Path(a.source);dest=pathlib.Path(a.output);dest.mkdir(parents=True,exist_ok=True)
    index=read(source/'prepared/20261002/index.json');assert index['version']=='895aa1a4fe0bd79c-prepared2' and index['safeOnly']
    columns=a.columns.split(',') if a.columns else index['columns'];count=total=0;started=time.time()
    with concurrent.futures.ProcessPoolExecutor(a.workers) as pool:
        for n,(tiles,size) in enumerate(pool.map(column,[(str(source),str(dest),c) for c in columns]),1):count+=tiles;total+=size;print('MAP_COLUMN',n,len(columns),count,total,flush=True)
    rows={}
    for p in (dest/'catalog').glob('*.json'):
        x,y=p.stem.split('_');rows.setdefault(x,[]).append(int(y))
    ranges={}
    for x,values in rows.items():
        runs=[]
        for y in sorted(values):
            if runs and runs[-1][1]+1==y:runs[-1][1]=y
            else:runs.append([y,y])
        ranges[x]=runs
    (dest/'index.json').write_text(json.dumps({'schema':1,'version':VERSION,'safeOnly':True,'sourceDate':'2026-10-02','step':.01,'catalogStep':.05,'columns':columns,'tiles':count,'bytes':total,'complete':True,'sources':['OpenStreetMap','국토교통부 표준노드링크 2026-09-14'],'attribution':'© OpenStreetMap contributors · ODbL 1.0 · 국토교통부'},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('MAP_COMPLETE',count,total,round(time.time()-started),flush=True)
    p=dest/'index.json';manifest=read(p);manifest['catalogRows']=ranges;p.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
if __name__=='__main__':main()

