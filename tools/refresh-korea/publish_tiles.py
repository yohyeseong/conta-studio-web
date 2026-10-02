"""Copy only completed safe tile products; shard metadata to avoid a large startup index."""
import argparse, json, shutil
from pathlib import Path
def main():
 p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('destination');a=p.parse_args();src=Path(a.source);dst=Path(a.destination)
 index=json.loads((src/'index.json').read_text(encoding='utf-8'));assert index['safeOnly'] is True
 columns={};total=0
 for key,info in index.pop('tiles').items():
  if not info['elements']:continue
  column=key.split('_')[0];columns.setdefault(column,{})[key]={k:info[k] for k in ('bytes','rawBytes','sha256')}
  path=dst/'tiles'/f'{key}.json.gz';path.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src/'tiles'/path.name,path);total+=info['bytes']
 (dst/'catalog').mkdir(parents=True,exist_ok=True)
 for key,tiles in columns.items():(dst/'catalog'/f'{key}.json').write_text(json.dumps(dict(version=index['version'],tiles=tiles),separators=(',',':')),encoding='utf-8')
 index['columns']=list(columns);index['compressedBytes']=total
 (dst/'index.json').write_text(json.dumps(index,separators=(',',':')),encoding='utf-8')
 print(json.dumps(dict(columns=len(columns),tiles=sum(map(len,columns.values())),bytes=total,indexBytes=(dst/'index.json').stat().st_size)))
if __name__=='__main__':main()
