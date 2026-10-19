import os,json,urllib.request,urllib.parse,urllib.error,math,io,gzip,importlib.util
from pathlib import Path
key=os.environ['VWORLD_API_KEY'].strip()
root=Path('vworld-direct-results');root.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('mvt',Path(__file__).with_name('decode-mvt.py'));decoder=importlib.util.module_from_spec(spec);spec.loader.exec_module(decoder)
report=[]
z=18;lon,lat=126.978,37.5665
x=int((lon+180)/360*2**z);y=int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z)
headers={'Referer':'https://yohyeseong.github.io/conta-studio-web/model/','User-Agent':'Mozilla/5.0','Accept':'*/*'}
for kind in ['traffic','poi']:
 paths=[('tile','https://api.vworld.kr/req/wmts/vector/getTile/'+urllib.parse.quote(key,safe='')+'/'+kind+'/'+str(z)+'/'+str(x)+'/'+str(y)+'.pbf'),('style','https://api.vworld.kr/req/wmts/vector/getStyle/'+urllib.parse.quote(key,safe='')+'/'+('vectorStyleTraffic' if kind=='traffic' else 'vectorStylePoi'))]
 for mode,url in paths:
  result={'kind':kind,'mode':mode,'tile':[z,x,y]}
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30) as r:
    raw=r.read(12000001);result.update({'http':r.status,'bytes':len(raw),'contentType':r.headers.get('Content-Type')})
    if r.headers.get('Content-Encoding')=='gzip':raw=gzip.decompress(raw)
   if mode=='tile' and raw[:1]==bytes([26]):
    if key.encode() in raw:raise ValueError('Unexpected credential in tile')
    geo,layers=decoder.decode(raw,z,x,y);result['layers']=layers;result['features']=len(geo['features']);result['coordinatesReceived']=bool(geo['features'])
    (root/(kind+'.geojson')).write_text(json.dumps(geo,ensure_ascii=False),encoding='utf-8')
   elif mode=='style':
    data=json.loads(raw);result['fields']=list(data)[:20] if isinstance(data,dict) else [];result['styleReceived']=bool(data)
   else:result['message']=raw[:500].decode(errors='replace').replace(key,'[redacted]')
  except urllib.error.HTTPError as e:result.update({'http':e.code,'message':e.read(500).decode(errors='replace').replace(key,'[redacted]')})
  except Exception as e:result['errorType']=type(e).__name__
  report.append(result)
text=json.dumps(report,ensure_ascii=False,indent=2).replace(key,'[redacted]').replace(urllib.parse.quote(key,safe=''),'[redacted]')
(root/'report.json').write_text(text,encoding='utf-8');print(text)
