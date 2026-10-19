"""Read-only VWorld area acquisition test. Never emit request URLs or secrets."""
import os,json,math,re,urllib.request,urllib.parse,urllib.error,xml.etree.ElementTree as ET
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

KEY=os.environ['VWORLD_API_KEY'].strip()
if not KEY:raise SystemExit('VWorld server secret is empty')
OUT=Path('area-results');OUT.mkdir(exist_ok=True)
SITE='https://yohyeseong.github.io/conta-studio-web/'
MODEL=SITE+'model/'
CENTER=[127.15222992002964,36.84274729276274]
dy=250/111319.490793;dx=dy/math.cos(math.radians(CENTER[1]))
BOUNDS=[CENTER[0]-dx,CENTER[1]-dy,CENTER[0]+dx,CENTER[1]+dy]
R=6378137
merc=lambda p:[p[0]*math.pi/180*R,math.log(math.tan(math.pi/4+p[1]*math.pi/360))*R]
BBOX=merc(BOUNDS[:2])+merc(BOUNDS[2:])
HEADERS={'Referer':MODEL,'Origin':'https://yohyeseong.github.io','User-Agent':'Mozilla/5.0','Accept':'application/json,application/xml,application/x-protobuf,*/*'}
def safe(s):
    return str(s).replace(KEY,'[redacted]').replace(urllib.parse.quote(KEY,safe=''),'[redacted]')
def query(endpoint,params=None):
    url=endpoint+('?' + urllib.parse.urlencode({**(params or {}),'key':KEY}) if params is not None else '')
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=15) as r:
            raw=r.read(12000001)
            if len(raw)>12000000:return {'state':'error','error':'response_too_large'},None
            meta={'http':r.status,'bytes':len(raw),'contentType':r.headers.get('Content-Type','')}
    except urllib.error.HTTPError as e:return {'state':'error','http':e.code,'message':safe(e.read(300).decode(errors='replace'))},None
    except Exception as e:return {'state':'error','errorType':type(e).__name__},None
    if raw[:1]==bytes([26]):
        if KEY.encode() in raw:return {**meta,'state':'error','error':'credential_in_response'},None
        return {**meta,'state':'received','format':'pbf'},raw
    raw=raw.replace(KEY.encode(),b'[redacted]').replace(urllib.parse.quote(KEY,safe='').encode(),b'[redacted]')
    try:
        value=json.loads(raw)
        if value.get('type')=='FeatureCollection':return {**meta,'state':'received','format':'geojson','features':len(value.get('features',[]))},value
        response=value.get('response',{})
        if response.get('status')=='OK':
            fc=response.get('result',{}).get('featureCollection')
            if fc:return {**meta,'state':'received','format':'geojson','features':len(fc.get('features',[])),'record':response.get('record')},fc
        return {**meta,'state':'error','providerStatus':response.get('status'),'providerCode':response.get('error',{}).get('code')},None
    except (ValueError,AttributeError):pass
    try:
        root=ET.fromstring(raw)
        errors=[n for n in root.iter() if n.tag.split('}')[-1] in ['ServiceException','Exception']]
        if errors:return {**meta,'state':'error','providerCode':errors[0].attrib.get('code',errors[0].attrib.get('exceptionCode')),'message':safe(''.join(errors[0].itertext()).strip())[:200]},None
        names=[n.text for n in root.iter() if n.tag.split('}')[-1]=='Name' and n.text]
        return {**meta,'state':'received','format':'xml','layerNames':names},raw
    except ET.ParseError:return {**meta,'state':'error','error':'unexpected_format','message':safe(raw[:200].decode(errors='replace'))},None

def wfs(layer,domain=MODEL):
    return query('https://api.vworld.kr/req/wfs',{'service':'WFS','version':'1.1.0','request':'GetFeature','typename':layer,'bbox':','.join(map(str,BBOX)),'srsname':'EPSG:3857','output':'application/json','maxfeatures':'1000','domain':domain})
report={'center':CENTER,'bounds':BOUNDS,'auth':'repository server secret','inputFiles':False,'results':[]}
selected_domain=MODEL
for domain in [MODEL,'https://yohyeseong.github.io']:
    meta,body=query('https://api.vworld.kr/req/wfs',{'service':'WFS','request':'GetCapabilities','version':'1.1.0','domain':domain})
    report['results'].append({'kind':'capabilities','domain':domain,**meta})
    print(json.dumps(report['results'][-1],ensure_ascii=False))
    if meta.get('state')=='received':selected_domain=domain;break

layers={'buildings':'lt_c_bldginfo','address-buildings':'lt_c_spbd','sidewalks':'lt_c_a4subsidiarysection','surface-markings':'lt_c_b3surfacemark','lane-markings':'lt_l_b2surfacelinemark','parcels':'lp_pa_cbnd_bubun'}
def run(item):
    kind,layer=item;meta,value=wfs(layer,selected_domain)
    if isinstance(value,dict) and value.get('type')=='FeatureCollection':
        (OUT/(kind+'.geojson')).write_text(json.dumps(value,ensure_ascii=False),encoding='utf8')
        meta['geometryTypes']=sorted(set(f.get('geometry',{}).get('type','') for f in value.get('features',[])))
        meta['fields']=sorted(set(k for f in value.get('features',[]) for k in f.get('properties',{})))
    return {'kind':kind,'layer':layer,**meta}
with ThreadPoolExecutor(max_workers=3) as pool:
    for item in pool.map(run,layers.items()):report['results'].append(item);print(json.dumps(item,ensure_ascii=False))

z=18;x=int((CENTER[0]+180)/360*2**z);y=int((1-math.asinh(math.tan(math.radians(CENTER[1])))/math.pi)/2*2**z)
for kind in ['traffic','poi']:
    meta,raw=query('https://api.vworld.kr/req/wmts/vector/getTile/'+urllib.parse.quote(KEY,safe='')+'/'+kind+'/'+str(z)+'/'+str(x)+'/'+str(y)+'.pbf')
    report['results'].append({'kind':'vector-'+kind,'tile':[z,x,y],**meta});print(json.dumps(report['results'][-1],ensure_ascii=False))
    if meta.get('format')=='pbf':(OUT/(kind+'.pbf')).write_bytes(raw)
meta,value=query('https://api.vworld.kr/req/data',{'service':'data','version':'2.0','request':'GetFeature','data':'LT_C_BLDGINFO','format':'json','size':'1000','page':'1','geometry':'true','attribute':'true','crs':'EPSG:4326','geomFilter':'BOX('+','.join(map(str,BOUNDS))+')','domain':MODEL})
report['results'].append({'kind':'building-data-api',**meta});print(json.dumps(report['results'][-1],ensure_ascii=False))
if isinstance(value,dict):(OUT/'building-data-api.geojson').write_text(json.dumps(value,ensure_ascii=False),encoding='utf8')
(OUT/'report.json').write_text(safe(json.dumps(report,ensure_ascii=False,indent=2)),encoding='utf8')
