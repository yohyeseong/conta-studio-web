import argparse,base64,concurrent.futures,gzip,hashlib,json,pathlib,struct,time
Q=16384;TOKEN=0x895AA1A4
STEP=.01
LOW=False
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def var(n):
    out=bytearray()
    while n>=128:out.append((n&127)|128);n>>=7
    out.append(n);return out
def signed(n):return var((n<<1)^(n>>31))
def kind(t):
    if t.get('railway'):return 4
    if t.get('area:highway'):return 7
    if t.get('highway'):return 2 if t['highway'] in ('primary','secondary','trunk','motorway') else 3
    if t.get('waterway') or t.get('natural')=='water':return 5
    if t.get('building') or t.get('building:part'):return 1
    if t.get('landuse') or t.get('leisure') or t.get('natural') in ('wood','scrub','grassland'):return 6
    return 0
def encode(tile,x,y):
    names=[];lookup={};records=[]
    def name(text):
        if not text:return 0
        text=str(text)[:80]
        if text not in lookup:lookup[text]=len(names)+1;names.append(text)
        return lookup[text]
    def xy(c):return [max(0,min(Q,round((c[0]-x*STEP)/STEP*Q))),max(0,min(Q,round((c[1]-y*STEP)/STEP*Q)))]
    for f in tile['features']:
        t=f['properties'];k=kind(t);g=f['geometry'];typ=g['type'];coords=g['coordinates'];labelAllowed=t.get('place') or t.get('highway') or t.get('leisure') or t.get('natural')=='water' or t.get('building') or t.get('building:part')
        if LOW and k and typ!='Point':
            from shapely.geometry import shape,mapping
            simple=shape(g).simplify(.000006,preserve_topology=True);value=mapping(simple);typ=value['type'];coords=value['coordinates']
        ix=name(t.get('name:ko') or t.get('name')) if labelAllowed else 0
        if not k and not ix:continue
        if k and typ!='Point':
            mode=3 if typ.endswith('Polygon') else 2
            paths=[coords] if typ=='LineString' else coords if typ in ('MultiLineString','Polygon') else [r for p in coords for r in p] if typ=='MultiPolygon' else []
        else:mode=0;paths=[]
        record=bytearray([k,mode,1 if t.get('place') else 0]);record+=var(ix)
        if ix:
            b=f['bbox'];a=xy([(b[0]+b[2])/2,(b[1]+b[3])/2]);record+=var(a[0])+var(a[1])
        record+=var(len(paths))
        for path in paths:
            points=[]
            for c in path:
                p=xy(c)
                if not points or p!=points[-1]:points.append(p)
            record+=var(len(points));last=[0,0]
            for p in points:record+=signed(p[0]-last[0])+signed(p[1]-last[1]);last=p
        records.append(record)
    out=bytearray(struct.pack('<4sIHHHHII',b'CMAP',TOKEN,1,Q,x,y,len(records),len(names)))
    for text in names:
        b=text.encode('utf-8');out+=var(len(b))+b
    for r in records:out+=r
    return bytes(out)
def column(task):
    global LOW,Q
    source,dest,files,low=task;LOW=low;Q=1024 if low else 16384;source=pathlib.Path(source);dest=pathlib.Path(dest);count=size=0;mask={}
    for p in files:
        cat=read(source/'catalog'/p);assert cat['version']=='895aa1a4fe0bd79c-mapgrid1'
        parent=p[:-5];bits=0
        for ident,info in cat['tiles'].items():
            b=(source/'tiles'/f'{ident}.json.gz').read_bytes();assert len(b)==info['bytes'] and hashlib.sha256(b).hexdigest()==info['sha256']
            tile=json.loads(gzip.decompress(b));assert tile['version']==cat['version'] and tile['safeOnly'];x,y=map(int,ident.split('_'));raw=encode(tile,x,y);data=gzip.compress(raw,compresslevel=9,mtime=0)
            target=dest/'tiles'/f'{ident}.bin.gz';target.write_bytes(data);count+=1;size+=len(data);bits|=1<<((x%5)*5+y%5)
        mask[parent]=bits
    return count,size,mask
def main():
    parser=argparse.ArgumentParser();parser.add_argument('source');parser.add_argument('output');parser.add_argument('--workers',type=int,default=2);parser.add_argument('--low',action='store_true');a=parser.parse_args();source=pathlib.Path(a.source);dest=pathlib.Path(a.output);(dest/'tiles').mkdir(parents=True,exist_ok=True)
    index=read(source/'index.json');assert index['complete'] and index['safeOnly'] and index['version']=='895aa1a4fe0bd79c-mapgrid1'
    groups={}
    for p in (source/'catalog').glob('*.json'):groups.setdefault(p.stem.split('_')[0],[]).append(p.name)
    count=size=0;mask={};started=time.time()
    with concurrent.futures.ProcessPoolExecutor(a.workers) as pool:
        for n,(c,s,m) in enumerate(pool.map(column,[(str(source),str(dest),v,a.low) for k,v in sorted(groups.items())]),1):count+=c;size+=s;mask.update(m);print('PACKED_COLUMN',n,count,size,flush=True)
    assert count==index['tiles'];xs=[int(i.split('_')[0]) for i in mask];ys=[int(i.split('_')[1]) for i in mask];x0=min(xs);y0=min(ys);width=max(xs)-x0+1;height=max(ys)-y0+1;coverage=bytearray(struct.pack('<4sIHHHH',b'CMCV',TOKEN,x0,y0,width,height)+bytes(width*height*4))
    for key,bits in mask.items():x,y=map(int,key.split('_'));struct.pack_into('<I',coverage,16+((x-x0)*height+y-y0)*4,bits)
    packed=gzip.compress(bytes(coverage),compresslevel=9,mtime=0)
    (dest/'coverage.js').write_text("export const COVERAGE='"+base64.b64encode(packed).decode()+"';\nexport const COVERAGE_HASH='"+hashlib.sha256(packed).hexdigest()+"';\n",encoding='utf-8')
    (dest/'index.json').write_text(json.dumps({'schema':1,'version':'895aa1a4fe0bd79c-packed1','sourceVersion':index['version'],'safeOnly':True,'complete':True,'tiles':count,'bytes':size,'quantization':Q,'maxCoordinateErrorM':.05,'coverageBytes':len(packed),'sourceDate':'2026-10-02'},separators=(',',':')))
    print('PACKED_COMPLETE',count,size,len(packed),round(time.time()-started),flush=True)
if __name__=='__main__':main()
