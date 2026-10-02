import base64,concurrent.futures,gzip,hashlib,importlib.util,json,pathlib,struct,time,sys
from shapely.geometry import shape,mapping,box
from shapely.ops import unary_union
spec=importlib.util.spec_from_file_location('packer',pathlib.Path(__file__).with_name('pack-map.py'));packer=importlib.util.module_from_spec(spec);spec.loader.exec_module(packer)
packer.STEP=.0025
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def worker(task):
    source,dest,cats=task;source=pathlib.Path(source);dest=pathlib.Path(dest);count=lowSize=highSize=0;mask={}
    for cp in cats:
        cat=read(source/'catalog'/cp);bits=0
        assert cat['version']=='895aa1a4fe0bd79c-mapgrid1'
        for ident,info in cat['tiles'].items():
            data=(source/'tiles'/f'{ident}.json.gz').read_bytes();assert len(data)==info['bytes'] and hashlib.sha256(data).hexdigest()==info['sha256'];tile=json.loads(gzip.decompress(data));assert tile['safeOnly'] and tile['version']==cat['version']
            px,py=map(int,ident.split('_'));slots=[[] for _ in range(16)];regions=[box((px*4+i)*.0025,(py*4+j)*.0025,(px*4+i+1)*.0025,(py*4+j+1)*.0025) for i in range(4) for j in range(4)]
            for f in tile['features']:
                t=f['properties'];k=packer.kind(t);g=shape(f['geometry']);dim=2 if g.geom_type.endswith('Polygon') else 1 if g.geom_type.endswith('LineString') else 0
                if not k:
                    if not (t.get('name:ko') or t.get('name')) or not (t.get('place') or t.get('leisure')):continue
                    from shapely.geometry import Point
                    b=f['bbox'];g=Point((b[0]+b[2])/2,(b[1]+b[3])/2);dim=0
                b=g.bounds;ix0=max(0,min(3,int((b[0]-px*.01)/.0025)));ix1=max(0,min(3,int((b[2]-px*.01)/.0025)));iy0=max(0,min(3,int((b[1]-py*.01)/.0025)));iy1=max(0,min(3,int((b[3]-py*.01)/.0025)))
                for i in range(ix0,ix1+1):
                    for j in range(iy0,iy1+1):
                        clipped=g.intersection(regions[i*4+j])
                        if clipped.is_empty:continue
                        if clipped.geom_type=='GeometryCollection':
                            parts=[p for p in clipped.geoms if p.geom_type.endswith('Polygon') if dim==2] if dim==2 else [p for p in clipped.geoms if p.geom_type.endswith('LineString')] if dim==1 else [p for p in clipped.geoms if p.geom_type.endswith('Point')]
                            if not parts:continue
                            clipped=unary_union(parts)
                        if dim==2 and not clipped.geom_type.endswith('Polygon'):continue
                        if dim==1 and not clipped.geom_type.endswith('LineString'):continue
                        slots[i*4+j].append({'properties':t,'geometry':mapping(clipped),'bbox':list(clipped.bounds)})
            for lod in ('low','detail'):
                packer.LOW=lod=='low';packer.Q=512 if packer.LOW else 4096;chunks=[]
                for i in range(4):
                    for j in range(4):
                        features=slots[i*4+j];chunks.append(gzip.compress(packer.encode({'features':features},px*4+i,py*4+j),compresslevel=9,mtime=0) if features else b'')
                offsets=[84]
                for chunk in chunks:offsets.append(offsets[-1]+len(chunk))
                out=struct.pack('<4sIHHI17I',b'CMB2',packer.TOKEN,px,py,1,*offsets)+b''.join(chunks);(dest/lod/f'{ident}.bin').write_bytes(out)
                if lod=='low':lowSize+=len(out)
                else:highSize+=len(out)
            count+=1;bits|=1<<((px%5)*5+py%5)
        mask[cp[:-5]]=bits
    return count,lowSize,highSize,mask
def main():
    source=pathlib.Path(sys.argv[1]);dest=pathlib.Path(sys.argv[2]);workers=int(sys.argv[3]) if len(sys.argv)>3 else 2
    for lod in ('low','detail'):(dest/lod).mkdir(parents=True,exist_ok=True)
    index=read(source/'index.json');assert index['complete'] and index['safeOnly'] and index['version']=='895aa1a4fe0bd79c-mapgrid1';groups={}
    for p in (source/'catalog').glob('*.json'):groups.setdefault(p.stem.split('_')[0],[]).append(p.name)
    count=low=detail=0;mask={};started=time.time()
    with concurrent.futures.ProcessPoolExecutor(workers) as pool:
        for n,(c,l,d,m) in enumerate(pool.map(worker,[(str(source),str(dest),v) for k,v in sorted(groups.items())]),1):count+=c;low+=l;detail+=d;mask.update(m);print('BUNDLE_COLUMN',n,count,low,detail,flush=True)
    assert count==index['tiles'];xs=[int(i.split('_')[0]) for i in mask];ys=[int(i.split('_')[1]) for i in mask];x0=min(xs);y0=min(ys);width=max(xs)-x0+1;height=max(ys)-y0+1;coverage=bytearray(struct.pack('<4sIHHHH',b'CMCV',packer.TOKEN,x0,y0,width,height)+bytes(width*height*4))
    for key,bits in mask.items():x,y=map(int,key.split('_'));struct.pack_into('<I',coverage,16+((x-x0)*height+y-y0)*4,bits)
    packed=gzip.compress(bytes(coverage),compresslevel=9,mtime=0);(dest/'coverage.js').write_text("export const COVERAGE='"+base64.b64encode(packed).decode()+"';\nexport const COVERAGE_HASH='"+hashlib.sha256(packed).hexdigest()+"';\n",encoding='utf-8')
    (dest/'index.json').write_text(json.dumps({'schema':2,'version':'895aa1a4fe0bd79c-packed2','safeOnly':True,'complete':True,'parents':count,'lowBytes':low,'detailBytes':detail,'coverageBytes':len(packed),'sourceDate':'2026-10-02'},separators=(',',':')))
    print('BUNDLE_COMPLETE',count,low,detail,len(packed),round(time.time()-started),flush=True)
if __name__=='__main__':main()
