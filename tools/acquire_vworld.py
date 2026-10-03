"""Acquire complete VWorld pages privately; publish only screened model attributes."""
import datetime,functools,gzip,hashlib,http.client,json,math,os,re,ssl,sys,time,urllib.request,urllib.error,urllib.parse
from pathlib import Path
KEY=os.environ.get('VWORLD_API_KEY','').strip()
ORIGIN='https://yohyeseong.github.io'
DATA='https://raw.githubusercontent.com/yohyeseong/conta-studio-web/81e2224a3f860ca60cb07565f1979c221cc1fb26/'
PREP='prepared/20261002/'
VERSION='895aa1a4fe0bd79c-prepared2'
STEP=.005
KINDS={'buildings':'LT_C_SPBD','roads':'LT_L_SPRD'}
class AcquisitionError(Exception):pass
@functools.lru_cache(maxsize=256)
def http(url):
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':ORIGIN+'/conta-studio-web/model/','Accept':'application/json'})
        with urllib.request.urlopen(req,timeout=35) as r:
            b=r.read(12000001)
        if len(b)>12000000:raise AcquisitionError('Provider response too large')
        return b
    except urllib.error.HTTPError as e:raise AcquisitionError('Provider HTTP '+str(e.code)) from None
    except (TimeoutError,urllib.error.URLError,http.client.HTTPException,ConnectionError,ssl.SSLError):raise AcquisitionError('Provider connection failed') from None
def data_json(path):return json.loads(http(DATA+path))
def provider_json(data):
    for encoding in ['utf-8-sig','cp949']:
        try:return json.loads(data.decode(encoding))
        except (UnicodeDecodeError,json.JSONDecodeError):pass
    raise AcquisitionError('Provider returned invalid JSON encoding')
def overlaps(a,b):return a[0]<=b[2] and a[2]>=b[0] and a[1]<=b[3] and a[3]>=b[1]
def privacy_zones(bounds):
    index=data_json(PREP+'index.json')
    if index.get('version')!=VERSION or not index.get('safeOnly'):raise AcquisitionError('Screening source mismatch')
    catalogs={};jobs={}
    w,s,e,n=bounds
    for x in range(math.floor(w/.01),math.floor(e/.01)+1):
        col=str(x//5)
        if col not in index['columns']:raise AcquisitionError('Missing screening coverage')
        if col not in catalogs:catalogs[col]=data_json(PREP+'model-catalog/'+col+'.json')
        cat=catalogs[col]
        if cat.get('version')!=VERSION:raise AcquisitionError('Screening catalog mismatch')
        for y in range(math.floor(s/.01),math.floor(n/.01)+1):
            for ident in cat['tiles'].get(str(x)+'_'+str(y),[]):jobs[ident]=cat['buckets'][ident]
    zones=[]
    for ident,info in jobs.items():
        b=http(DATA+PREP+'model/'+ident+'.json.gz')
        if len(b)!=info['bytes'] or hashlib.sha256(b).hexdigest()!=info['sha256']:raise AcquisitionError('Screening checksum mismatch')
        raw=gzip.decompress(b)
        if len(raw)!=info['rawBytes']:raise AcquisitionError('Screening size mismatch')
        tile=json.loads(raw)
        if tile.get('version')!=VERSION or not tile.get('safeOnly'):raise AcquisitionError('Screening tile mismatch')
        zones.extend(z for z in tile.get('zones',[]) if overlaps(z,bounds))
    return zones
def query(kind,bounds,page,domain):
    params={'service':'data','version':'2.0','request':'GetFeature','format':'json','size':'1000','page':str(page),'data':KINDS[kind],'geometry':'true','attribute':'true','crs':'EPSG:4326','geomFilter':'BOX('+','.join(map(str,bounds))+')','domain':domain,'key':KEY}
    try:
        url='https://api.vworld.kr/req/data?'+urllib.parse.urlencode(params)
        for attempt in range(3):
            try:
                document=provider_json(http(url));break
            except AcquisitionError:
                if attempt==2:raise
                time.sleep(2)
        value=document.get('response',{}) if isinstance(document,dict) else {}
    except json.JSONDecodeError:raise AcquisitionError('Provider returned non-JSON') from None
    if not isinstance(value,dict):raise AcquisitionError('Invalid provider response envelope')
    record=value.get('record') or {}
    print('VWORLD_RESPONSE '+json.dumps({'status':value.get('status'),'total':record.get('total'),'error_code':(value.get('error') or {}).get('code')}),flush=True)
    if value.get('status')=='NOT_FOUND':return [],0
    if value.get('status')!='OK':
        code=str(value.get('error',{}).get('code','UNKNOWN'))
        raise AcquisitionError('Provider '+(code if re.fullmatch('[A-Z_0-9]{1,50}',code) else 'rejected request'))
    features=value.get('result',{}).get('featureCollection',{}).get('features')
    total=int(value.get('record',{}).get('total',-1))
    if not isinstance(features,list) or len(features)>1000 or total<len(features):raise AcquisitionError('Invalid feature count')
    return features,total
def acquire(kind,bounds,domain):
    features,total=query(kind,bounds,1,domain)
    if total>20000:raise AcquisitionError('Tile requires subdivision')
    for page in range(2,math.ceil(total/1000)+1):
        batch,count=query(kind,bounds,page,domain)
        if count!=total:raise AcquisitionError('Provider changed during paging')
        features.extend(batch)
    if len(features)!=total:raise AcquisitionError('Incomplete provider pages')
    return features
def normalize(f,kind,zones):
    g=f.get('geometry',{});t={str(k).lower():v for k,v in (f.get('properties') or {}).items()}
    if re.search(r'military|barracks|군사|군부대|국방|병영|군용',str(t),re.I):return None
    types=['Polygon','MultiPolygon'] if kind=='buildings' else ['LineString','MultiLineString','Polygon','MultiPolygon']
    if g.get('type') not in types:raise AcquisitionError('Unexpected provider geometry')
    points=[]
    def walk(c):
        if isinstance(c,list) and len(c)>=2 and isinstance(c[0],(int,float)):
            if not all(math.isfinite(v) for v in c[:2]) or not(124<=c[0]<=132 and 33<=c[1]<=39):raise AcquisitionError('Invalid coordinate reference system')
            points.append(c[:2])
        elif isinstance(c,list):
            for v in c:walk(v)
        else:raise AcquisitionError('Invalid coordinates')
    walk(g.get('coordinates'))
    if not points:raise AcquisitionError('Empty geometry')
    box=[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
    if any(overlaps(box,z) for z in zones):return None
    props={'geometry_source':'VWorld','vworld_dataset':KINDS[kind],'building':'yes'} if kind=='buildings' else {'geometry_source':'VWorld','vworld_dataset':KINDS[kind],'highway':'unclassified'}
    def numeric(keys,maximum):
        for k in keys:
            try:v=float(t.get(k))
            except (ValueError,TypeError):continue
            if 0<v<maximum:return v
    if kind=='buildings':
        height=numeric(['height','hgt','bldg_hgt','building_height'],1000)
        floors=numeric(['gro_flo_co','grnd_flr','ground_floor','building:levels'],200)
        if height:props['height']=height
        if floors:props['building:levels']=floors
    else:
        width=numeric(['width','road_width','rd_width'],200)
        if width:props['width']=width
    identity=f.get('id')
    if identity is None:identity=hashlib.sha256(json.dumps(g,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:24]
    return {'type':'Feature','id':'vworld/'+kind+'/'+str(identity),'bbox':box,'geometry':g,'properties':props}
def main():
    if not KEY:raise AcquisitionError('Missing VWORLD_API_KEY repository secret')
    bounds=list(map(float,os.environ.get('VWORLD_BOUNDS','126.975,37.565,126.985,37.575').split(',')))
    if len(bounds)!=4 or not(124<=bounds[0]<bounds[2]<=132 and 33<=bounds[1]<bounds[3]<=39) or (bounds[2]-bounds[0])*(bounds[3]-bounds[1])>.004:raise AcquisitionError('Invalid acquisition bounds')
    # Determine a working registration domain before downloading or publishing anything.
    domain=None
    for candidate in [ORIGIN,ORIGIN+'/conta-studio-web',ORIGIN+'/conta-studio-web/',ORIGIN+'/conta-studio-web/model/', 'yohyeseong.github.io']:
        try:
            sample,total=query('buildings',bounds,1,candidate)
            print(json.dumps({'probe':'OK','dataset':KINDS['buildings'],'total':total,'fields':sorted({k for f in sample for k in (f.get('properties') or {})})}),flush=True)
            domain=candidate;break
        except AcquisitionError as e:
            print('VWORLD_PROBE '+str(e),flush=True)
            if str(e).startswith('Provider HTTP'):break
    if domain is None:raise AcquisitionError('VWorld download not verified; no source switch published')
    zones=privacy_zones(bounds)
    out=Path(os.environ.get('VWORLD_OUTPUT','/tmp/vworld-cache'));out.mkdir(parents=True,exist_ok=True)
    version='vworld-prepared-v1';date=datetime.datetime.now(datetime.timezone.utc).date().isoformat();tiles={};counts={'buildings':0,'roads':0}
    for x in range(math.floor(bounds[0]/STEP),math.ceil(bounds[2]/STEP)):
        for y in range(math.floor(bounds[1]/STEP),math.ceil(bounds[3]/STEP)):
            box=[round(x*STEP,8),round(y*STEP,8),round((x+1)*STEP,8),round((y+1)*STEP,8)]
            # Expand screening to the complete stored grid cell.
            cell_zones=privacy_zones(box)
            if cell_zones:continue
            features=[];complete=[]
            for kind in KINDS:
                originals=acquire(kind,box,domain)
                normalized=[v for f in originals if (v:=normalize(f,kind,zones+cell_zones))]
                features.extend(normalized);complete.append(kind);counts[kind]+=len(normalized)
            ident=str(x)+'_'+str(y)
            raw=json.dumps({'schema':1,'version':version,'safeOnly':True,'source':'VWorld','acquiredDate':date,'bounds':box,'completeLayers':complete,'features':features},ensure_ascii=False,separators=(',',':')).encode()
            if KEY.encode() in raw:raise AcquisitionError('Secret found in prepared output')
            data=gzip.compress(raw,compresslevel=6,mtime=0);p=out/'tiles'/(ident+'.json.gz');p.parent.mkdir(exist_ok=True);p.write_bytes(data)
            tiles[ident]={'bytes':len(data),'rawBytes':len(raw),'sha256':hashlib.sha256(data).hexdigest(),'bounds':box,'completeLayers':complete}
    if not tiles or counts['buildings']==0:raise AcquisitionError('No verified building coverage acquired')
    manifest={'schema':1,'version':version,'safeOnly':True,'source':'VWorld','acquiredDate':date,'step':STEP,'tiles':tiles,'counts':counts,'attribution':'국토교통부 · VWorld','screeningSource':VERSION}
    (out/'index.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('VWORLD_PREPARED '+json.dumps({'tiles':len(tiles),'counts':counts}),flush=True)
if __name__=='__main__':
    try:main()
    except AcquisitionError as e:print('ACQUISITION_FAILED: '+str(e));sys.exit(1)
    except Exception as e:
        import traceback
        print('ACQUISITION_FAILED: '+type(e).__name__+' at lines '+','.join(str(v.lineno) for v in traceback.extract_tb(e.__traceback__)))
        sys.exit(1)
