"""Check every published artifact against its immutable release manifest."""
import json,hashlib,gzip,struct,sys
from pathlib import Path
root=Path(sys.argv[1] if len(sys.argv)>1 else 'cloudflare/official/public');manifest=json.loads((root/'manifest.json').read_text('utf8'));index=json.loads((root/'official-202609-v1/index.json').read_text('utf8'))
assert manifest['safeOnly'] and index['safeOnly'] and index['complete'] and manifest['version']==index['version']=='official-202609-v1'
assert len(index['sources'])==23 and sum(s['counts']['input'] for s in index['sources'])==14392125
assert all(s['kind']=='buildings' for s in index['sources'])
for name,info in manifest['files'].items():
 path=(root/name).resolve();assert path.is_relative_to(root.resolve()) and path.is_file()
 with path.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
 assert path.stat().st_size==info['bytes'] and sha==info['sha256'],name
actual={str(p.relative_to(root)).replace('\\','/') for p in root.rglob('*') if p.is_file()};assert actual==set(manifest['files'])|{'manifest.json'}
assert len(actual)<20000 and all((root/n).stat().st_size<25*1024*1024 for n in actual)
tiles=0
for col in index['columns']:
 catalog=json.loads((root/'official-202609-v1'/f'{col}.json').read_text());assert catalog['safeOnly'] and catalog['version']==index['version']
 for row,parent in catalog['parents'].items():
  data=(root/'official-202609-v1'/f'{col}_{row}.pack').read_bytes();assert data[:4]==b'CTP1' and struct.unpack_from('<I',data,4)[0]==index['token']
  assert len(data)==parent['bytes'] and hashlib.sha256(data).hexdigest()==parent['sha256']
  for name,info in parent['tiles'].items():
   packed=data[info['offset']:info['offset']+info['bytes']];assert len(packed)==info['bytes'] and hashlib.sha256(packed).hexdigest()==info['sha256']
   raw=gzip.decompress(packed);assert len(raw)==info['rawBytes'];magic,token,count,screened=struct.unpack_from('<4sIII',raw);assert (magic,token,count,screened)==(b'CBT1',index['token'],info['features'],1)
   tiles+=1
print('VERIFIED',len(actual),'files,',tiles,'screened tiles,',index['uniqueFeatures'],'unique buildings')

