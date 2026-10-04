"""Reindex the already published, hash-verified safe geometry without simplifying it."""
import concurrent.futures,gzip,hashlib,json,math,pathlib,sys,struct
SOURCE=pathlib.Path(sys.argv[1]);OUT=pathlib.Path(sys.argv[2]);BASE=SOURCE/'prepared/20261002';ROADS=SOURCE/'supplemental/official-roads-20260914'
VERSION='895aa1a4fe0bd79c-prepared2';EDITION='model-20261002-v1'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def digest(b):return hashlib.sha256(b).hexdigest()
def overlap(a,b):return a[0]<=b[2] and a[2]>=b[0] and a[1]<=b[3] and a[3]>=b[1]
def checked(p,info):
 b=p.read_bytes();assert len(b)==info['bytes'] and digest(b)==info['sha256'];raw=gzip.decompress(b);assert len(raw)==info['rawBytes'];v=json.loads(raw);assert v['safeOnly'] and v['schema']==1;return v
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
def column(c):
 catalog=read(BASE/'model-catalog'/f'{c}.json');assert catalog['version']==VERSION
 roadcat=read(ROADS/'catalog'/f'{c}.json')['tiles'] if (ROADS/'catalog'/f'{c}.json').exists() else {}
 # One parent keeps assets below the free-plan file limit; child ranges preserve complete geometry.
 parents={};cells={}
 for key in catalog['tiles']:
  x,y=map(int,key.split('_'));cells.setdefault(y//5,set()).add(key)
 for key in roadcat:
  px,py=map(int,key.split('_'))
  for x in range(px*5,px*5+5):
   for y in range(py*5,py*5+5):cells.setdefault(py,set()).add(f'{x}_{y}')
 cache={};counts=total=0
 for py,keys in sorted(cells.items()):
  data=bytearray(b'CMG1'+struct.pack('<I',0x895aa1a4));tiles={}
  road=checked(ROADS/'tiles'/f'{c}_{py}.json.gz',roadcat[f'{c}_{py}']) if f'{c}_{py}' in roadcat else None
  if road:assert road['version']=='official-roads-20260914-safe-v1'
  for key in sorted(keys):
   x,y=map(int,key.split('_'));bounds=[x/100,y/100,(x+1)/100,(y+1)/100];features={};zones={}
   for bucket in catalog['tiles'].get(key,[]):
    if bucket not in cache:cache[bucket]=checked(BASE/'model'/f'{bucket}.json.gz',catalog['buckets'][bucket])
    tile=cache[bucket];assert tile['version']==VERSION
    for z in tile.get('zones',[]):
     if overlap(z,bounds):zones[tuple(z)]=z
    for f in tile['features']:
     if overlap(f['bbox'],bounds):features.setdefault(str(f['id']),f)
   if road:
    for f in road['features']:
     if overlap(f['bbox'],bounds):features.setdefault(str(f['id']),f)
   if not features and not zones:continue
   value={'schema':1,'version':VERSION,'safeOnly':True,'features':list(features.values()),'zones':list(zones.values())}
   raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode();chunk=gzip.compress(raw,compresslevel=6,mtime=0)
   tiles[key]={'offset':len(data),'bytes':len(chunk),'rawBytes':len(raw),'sha256':digest(chunk),'features':len(features)};data.extend(chunk);counts+=1
  if tiles:
   assert len(data)<25*1024*1024,('Asset too large',c,py,len(data));p=OUT/EDITION/f'{c}_{py}.pack';p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);parents[str(py)]={'bytes':len(data),'sha256':digest(data),'tiles':tiles};total+=len(data)
  # Drop complete shapes only after all referencing cells in this parent have been written.
  if len(cache)>200:cache.clear()
 write(OUT/EDITION/f'{c}.json',{'version':EDITION,'safeOnly':True,'parents':parents});return counts,total,len(parents)
if __name__=='__main__':
 index=read(BASE/'index.json');roads=read(ROADS/'index.json');assert index['version']==VERSION and index['safeOnly'] and index['sourceDate']=='2026-10-02';assert roads['safeOnly'] and roads['version']=='official-roads-20260914-safe-v1'
 columns=sorted(set(index['columns'])|set(roads['columns']));results=[]
 with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
  for c,r in zip(columns,pool.map(column,columns)):results.append(r);print(c,r,flush=True)
 assert sum(r[2] for r in results)+len(columns)+3000<20000
 write(OUT/EDITION/'index.json',{'schema':1,'version':EDITION,'dataVersion':VERSION,'safeOnly':True,'complete':True,'step':.01,'columns':columns,'sourceDate':'2026-10-02','officialRoadVersion':roads['version'],'tiles':sum(r[0] for r in results),'bytes':sum(r[1] for r in results),'attribution':index['attribution']+' · 국토교통부 표준노드링크'})
 # Elevation is unmodified and verified against the published catalog.
 dem=SOURCE/'elevation/glo30-2021';meta=read(dem/'index.json');assert meta['complete'] and meta['version']=='copernicus-glo30-2021-v1'
 for key,info in meta['tiles'].items():
  b=(dem/(key+'.png')).read_bytes();assert len(b)==info['bytes'] and digest(b)==info['sha256'];p=OUT/'elevation/glo30-2021'/(key+'.png');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
 write(OUT/'elevation/glo30-2021/index.json',meta)
 (OUT/'_headers').write_text('/*\n  Access-Control-Allow-Origin: https://yohyeseong.github.io\n  Access-Control-Expose-Headers: Content-Range, Content-Length\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n')
 print('Verified nationwide source packs:',sum(r[0] for r in results),'cells',sum(r[1] for r in results),'bytes',flush=True)
