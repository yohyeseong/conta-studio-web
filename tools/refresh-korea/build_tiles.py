"""Offline only: PBF -> existing RAM privacy filter -> safe index -> static tiles.

Never distribute the source PBF or the SQLite index. Resume verifies each tile's
content hash. Publish index.json only after the full requested coverage succeeds.
"""
import argparse, concurrent.futures, gzip, hashlib, json, math, sqlite3, sys, time
from pathlib import Path

STEP = .05  # 4.3–4.7 km E/W and 5.56 km N/S in South Korea
KEYS = {'building','building:part','highway','area:highway','landuse','leisure','natural','waterway','railway','place','man_made','amenity'}
def pack(x): return json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()
def ids_for(b):
    w,s,e,n=b
    return [(x,y) for x in range(math.floor(w/STEP),math.floor(e/STEP)+1) for y in range(math.floor(s/STEP),math.floor(n/STEP)+1)]
def bounds(x,y):return [round(x*STEP,8),round(y*STEP,8),round((x+1)*STEP,8),round((y+1)*STEP,8)]
def init(app,root,out):
    global provider, destination, tagged
    sys.path.insert(0,app)
    from korea_data_provider import KoreaDataProvider
    from sensitive_filter import tagged as check
    tagged=check;provider=KoreaDataProvider(root);destination=Path(out)
def tile(job):
    x,y=job;ident=f'{x}_{y}';path=destination/'tiles'/f'{ident}.json.gz';receipt=destination/'receipts'/f'{ident}.json'
    if receipt.exists() and path.exists():
        info=json.loads(receipt.read_text());data=path.read_bytes()
        if hashlib.sha256(data).hexdigest()==info['sha256']:return ident,info
    started=time.perf_counter();nodes,ways,relations=provider._records(bounds(x,y),0)
    # Preserve complete polygon members, along with every original tag/node ID.
    required={ref for members,t in relations.values() for kind,ref,role in members if kind=='w'}
    ways={i:v for i,v in ways.items() if KEYS.intersection(v[1]) or i in required}
    required_nodes={ref for refs,t in ways.values() for ref in refs}
    required_nodes.update(ref for members,t in relations.values() for kind,ref,role in members if kind=='n')
    nodes={i:v for i,v in nodes.items() if i in required_nodes or KEYS.intersection(v[2])}
    if any(tagged(v[-1]) for group in (nodes,ways,relations) for v in group.values()):raise ValueError('Safe input validation failed')
    elements=[]
    for i,(lon,lat,tags) in nodes.items():elements.append(dict(type='node',id=i,lon=lon,lat=lat,tags=tags))
    for i,(refs,tags) in ways.items():
        xy=[nodes[r][:2] for r in refs]
        if not xy:continue
        elements.append(dict(type='way',id=i,nodes=refs,tags=tags,bbox=[min(p[0] for p in xy),min(p[1] for p in xy),max(p[0] for p in xy),max(p[1] for p in xy)]))
    for i,(members,tags) in relations.items():elements.append(dict(type='relation',id=i,tags=tags,members=[dict(type={'n':'node','w':'way','r':'relation'}[k],ref=r,role=role) for k,r,role in members]))
    raw=pack(dict(elements=elements));data=gzip.compress(raw,compresslevel=6,mtime=0)
    if len(data)>24*1024*1024:raise ValueError('Tile exceeds static asset limit; reduce tile size')
    path.parent.mkdir(parents=True,exist_ok=True);receipt.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp');tmp.write_bytes(data);tmp.replace(path)
    info=dict(bytes=len(data),rawBytes=len(raw),sha256=hashlib.sha256(data).hexdigest(),elements=len(elements),seconds=round(time.perf_counter()-started,3))
    receipt.write_text(json.dumps(info),encoding='utf-8');return ident,info
def main():
    p=argparse.ArgumentParser();p.add_argument('--app-dir',required=True);p.add_argument('--safe-index',required=True);p.add_argument('--pbf');p.add_argument('--date',default='2026-09-18');p.add_argument('--output',required=True);p.add_argument('--workers',type=int,default=4);p.add_argument('--bbox',type=float,nargs=4,default=[124,33,132,39]);a=p.parse_args()
    sys.path.insert(0,a.app_dir)
    if a.pbf:
        from korea_safe_index import build
        build(a.pbf,a.safe_index,a.date,lambda message:print(message,flush=True))
    from korea_data_provider import KoreaDataProvider
    source=KoreaDataProvider(a.safe_index);out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
    from korea_safe_index import digest
    # Privacy-policy rebuilds must invalidate caches even for the same PBF.
    signature=hashlib.sha256(pack(dict(source=source.metadata['sha256'],safe_index=digest(source.path),step=STEP,bbox=a.bbox,schema=1))).hexdigest()[:16]
    marker=out/'build.json'
    if marker.exists() and json.loads(marker.read_text())['version']!=signature:raise ValueError('Use a new output directory for changed source/coverage')
    marker.write_text(json.dumps(dict(version=signature)),encoding='utf-8')
    # R-tree existence queries avoid work for empty ocean cells.
    db=sqlite3.connect(source.path.as_uri()+'?mode=ro',uri=True);jobs=[]
    for x,y in ids_for(a.bbox):
        w,s,e,n=bounds(x,y)
        if any(db.execute(f'SELECT 1 FROM {table} WHERE e>=? AND w<=? AND n>=? AND s<=? LIMIT 1',(w,e,s,n)).fetchone() for table in ('way_bounds','node_bounds','relation_bounds')):jobs.append((x,y))
    db.close();print(json.dumps(dict(tile_count=len(jobs),version=signature)),flush=True)
    result={};started=time.perf_counter()
    with concurrent.futures.ProcessPoolExecutor(max_workers=a.workers,initializer=init,initargs=(a.app_dir,a.safe_index,a.output)) as pool:
        for i,(ident,info) in enumerate(pool.map(tile,jobs)):
            result[ident]=info
            if i%50==0:print(json.dumps(dict(done=i+1,total=len(jobs),seconds=round(time.perf_counter()-started))),flush=True)
    index=dict(schema=1,version=signature,step=STEP,coverage=a.bbox,sourceDate=source.metadata['data_date'],safeOnly=True,attribution='© OpenStreetMap contributors · ODbL 1.0',tiles=result)
    tmp=out/'index.tmp';tmp.write_bytes(pack(index));tmp.replace(out/'index.json')
    print(json.dumps(dict(complete=True,tiles=len(result),gzipBytes=sum(v['bytes'] for v in result.values()),seconds=round(time.perf_counter()-started))),flush=True)
if __name__=='__main__':main()
