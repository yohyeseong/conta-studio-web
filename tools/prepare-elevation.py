"""Preprocess acquired DSM into lossless, bounded elevation tiles for the web."""
import argparse,functools,gzip,hashlib,json,math,time
from pathlib import Path
import numpy as np
from PIL import Image
from shapely.geometry import shape,box

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for part in iter(lambda:f.read(4194304),b''):h.update(part)
    return h.hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('boundary');p.add_argument('output');p.add_argument('--sample',action='store_true');a=p.parse_args()
    source=Path(a.source);out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((source/'manifest.json').read_text('utf8'));country=shape(json.loads(Path(a.boundary).read_text('utf8'))['geometry'])
    paths={}
    for t in manifest['tiles']:
        path=source/t['file'];assert path.stat().st_size==t['bytes'] and digest(path)==t['sha256']
        paths[tuple(t['bbox'][:2])]=path
    z=12;scale=2**z
    def tile_xy(lon,lat):return (lon+180)/360*scale,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*scale
    def latitude(y):return math.degrees(math.atan(math.sinh(math.pi*(1-2*y/scale))))
    jobs=set()
    for lon,lat in paths:
        x0,y0=tile_xy(lon,lat+1);x1,y1=tile_xy(lon+1,lat)
        for x in range(math.floor(x0),math.floor(x1)+1):
            for y in range(math.floor(y0),math.floor(y1)+1):
                b=[x/scale*360-180,latitude(y+1),(x+1)/scale*360-180,latitude(y)]
                if country.intersects(box(*b)):jobs.add((x,y))
    if a.sample:
        jobs={tuple(map(math.floor,tile_xy(126.973,37.545))),tuple(map(math.floor,tile_xy(127.1548,36.8502))),tuple(map(math.floor,tile_xy(129.0756,35.1796)))}
    @functools.lru_cache(maxsize=12)
    def raster(key):
        with Image.open(paths[key]) as im:
            sx,sy,_=im.tag_v2[33550];tie=im.tag_v2[33922];keys=im.tag_v2[34735]
            entries={keys[i]:keys[i+3] for i in range(4,len(keys),4)}
            assert entries.get(2048)==4326 and entries.get(1025)==2 and im.mode=='F' and im.size==(3600,3600)
            return np.array(im,dtype=np.float32),tie[3]-tie[0]*sx,tie[4]+tie[1]*sy,sx,sy
    tiles={};start=time.monotonic();print('Elevation jobs',len(jobs),flush=True)
    for number,(x,y) in enumerate(sorted(jobs)):
        lon=((x+(np.arange(256)+.5)/256)/scale*360-180)[None,:]
        lat=np.degrees(np.arctan(np.sinh(np.pi*(1-2*(y+(np.arange(256)+.5)/256)/scale))))[:,None]
        heights=np.zeros((256,256),dtype=np.float64)
        for lx in range(math.floor(float(lon.min())),math.floor(float(lon.max()))+1):
            for ly in range(math.floor(float(lat.min())),math.floor(float(lat.max()))+1):
                key=(lx,ly);mask=(lon>=lx)&(lon<lx+1)&(lat>=ly)&(lat<ly+1)
                if key not in paths:continue
                grid,origin_lon,origin_lat,sx,sy=raster(key)
                px=np.clip((lon-origin_lon)/sx,0,3599);py=np.clip((origin_lat-lat)/sy,0,3599)
                ix=np.floor(px).astype(int);iy=np.floor(py).astype(int);fx=px-ix;fy=py-iy
                qx=np.minimum(ix+1,3599);qy=np.minimum(iy+1,3599)
                values=grid[iy,ix]*(1-fx)*(1-fy)+grid[iy,qx]*fx*(1-fy)+grid[qy,ix]*(1-fx)*fy+grid[qy,qx]*fx*fy
                if not np.isfinite(values[mask]).all() or np.any(values[mask]<=-32000):raise ValueError('Invalid acquired elevation sample')
                heights[mask]=values[mask]
        packed=np.clip(np.rint((heights+32768)*256),0,16777215).astype(np.uint32)
        rgb=np.stack(((packed>>16)&255,(packed>>8)&255,packed&255),axis=-1).astype(np.uint8)
        path=out/str(z)/str(x)/(str(y)+'.png');path.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(rgb).save(path,optimize=False)
        reconstructed=rgb[:,:,0].astype(float)*256+rgb[:,:,1]+rgb[:,:,2]/256-32768
        assert float(np.abs(reconstructed-heights).max())<=1/512+.00001
        tiles[f'{z}/{x}/{y}']={'bytes':path.stat().st_size,'sha256':digest(path)}
        if number%100==0:print('Elevation',number+1,len(jobs),round(time.monotonic()-start),flush=True)
    result=dict(schema=1,version='copernicus-glo30-2021-v1',kind='DSM',terrainOnly=False,resolutionM=30,zoom=z,encoding='Terrarium RGB',source=manifest['source_url'],attribution=manifest['attribution'],sourceTiles=len(paths),complete=not a.sample,tiles=tiles)
    (out/'index.json').write_text(json.dumps(result,separators=(',',':')),'utf8')
    print('ELEVATION_VERIFIED',len(tiles),sum(v['bytes'] for v in tiles.values()),flush=True)

if __name__=='__main__':main()
