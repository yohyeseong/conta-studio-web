import os,json,subprocess,time,urllib.parse
from pathlib import Path
key=os.environ['VWORLD_API_KEY'].strip();encoded=urllib.parse.quote(key,safe='')
url='https://api.vworld.kr/req/wmts/vector/getTile/'+encoded+'/traffic/18/223534/101515.pbf'
headers={'Referer':'https://yohyeseong.github.io/conta-studio-web/model/','User-Agent':'Mozilla/5.0','Accept':'application/x-protobuf,application/octet-stream'}
root=Path('vworld-direct-results');root.mkdir(exist_ok=True)
report={'cookiesSent':False,'headerBytes':sum(len(k.encode())+len(v.encode())+4 for k,v in headers.items()),'tlsVerification':True,'results':[]}
config='url = '+json.dumps(url)+'\n'+''.join('header = '+json.dumps(k+': '+v)+'\n' for k,v in headers.items())
for protocol in ['--http1.1','--http2']:
 for attempt in range(1,4):
  file=root/('protocol-'+protocol[2:]+'.bin');start=time.monotonic()
  r=subprocess.run(['curl','--silent','--show-error','--max-time','12',protocol,'--output',str(file),'--write-out','%{http_code}|%{http_version}','--config','-'],input=config,text=True,capture_output=True)
  output=r.stdout.strip().split('|');raw=file.read_bytes() if file.exists() else b''
  item={'requestedProtocol':protocol[2:],'attempt':attempt,'curlExitCode':r.returncode,'http':output[0] if output else '', 'actualProtocol':output[1] if len(output)>1 else '', 'elapsedSeconds':round(time.monotonic()-start,2),'bytes':len(raw),'receivedVector':raw[:1]==bytes([26]),'message':r.stderr.replace(key,'[redacted]').replace(encoded,'[redacted]')[:220]}
  report['results'].append(item)
  if item['receivedVector'] or item['http'] in ['401','403','400']:break
  if attempt<3:time.sleep(0.3 if attempt==1 else 0.9)
text=json.dumps(report,ensure_ascii=False,indent=2).replace(key,'[redacted]').replace(encoded,'[redacted]');(root/'protocol-report.json').write_text(text,encoding='utf-8');print(text)
