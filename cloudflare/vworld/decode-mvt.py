import math,struct,json

def varint(data,pos):
 value=shift=0
 while True:
  if pos>=len(data) or shift>63:raise ValueError('Invalid varint')
  b=data[pos];pos+=1;value|=(b&127)<<shift
  if not b&128:return value,pos
  shift+=7

def fields(data):
 out={};pos=0
 while pos<len(data):
  tag,pos=varint(data,pos);number,wire=tag>>3,tag&7
  if wire==0:value,pos=varint(data,pos)
  elif wire==1:value=data[pos:pos+8];pos+=8
  elif wire==2:
   length,pos=varint(data,pos);value=data[pos:pos+length];pos+=length
  elif wire==5:value=data[pos:pos+4];pos+=4
  else:raise ValueError('Unknown protobuf wire type')
  if pos>len(data):raise ValueError('Truncated protobuf field')
  out.setdefault(number,[]).append(value)
 return out

def packed(data):
 values=[];pos=0
 while pos<len(data):v,pos=varint(data,pos);values.append(v)
 return values

def value(data):
 f=fields(data)
 if 1 in f:return f[1][0].decode('utf-8')
 if 2 in f:return struct.unpack('<f',f[2][0])[0]
 if 3 in f:return struct.unpack('<d',f[3][0])[0]
 if 4 in f:
  n=f[4][0];return n if n<2**63 else n-2**64
 if 5 in f:return f[5][0]
 if 6 in f:
  n=f[6][0];return (n>>1)^-(n&1)
 if 7 in f:return bool(f[7][0])
 return None

def geometry(data,kind,z,tx,ty,extent):
 commands=packed(data);pos=x=y=0;paths=[];points=[];path=None
 while pos<len(commands):
  cmd=commands[pos];pos+=1;op,count=cmd&7,cmd>>3
  if op in (1,2):
   for _ in range(count):
    dx,dy=commands[pos:pos+2];pos+=2;x+=(dx>>1)^-(dx&1);y+=(dy>>1)^-(dy&1)
    if kind==1:points.append([x,y])
    elif op==1:path=[[x,y]];paths.append(path)
    elif path is not None:path.append([x,y])
    else:raise ValueError('Line without move')
  elif op==7:
   if path and path[0]!=path[-1]:path.append(path[0][:])
  else:raise ValueError('Unknown geometry command')
 def ll(p):
  a=(tx+p[0]/extent)/2**z;b=(ty+p[1]/extent)/2**z
  return [a*360-180,math.degrees(math.atan(math.sinh(math.pi*(1-2*b))))]
 if kind==1:return {'type':'Point','coordinates':ll(points[0])} if len(points)==1 else {'type':'MultiPoint','coordinates':list(map(ll,points))}
 if kind==2:return {'type':'LineString','coordinates':list(map(ll,paths[0]))} if len(paths)==1 else {'type':'MultiLineString','coordinates':[list(map(ll,p)) for p in paths]}
 if kind==3:
  polygons=[]
  for ring in paths:
   area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:]))
   if area>0:polygons.append([list(map(ll,ring))])
   elif area<0 and polygons:polygons[-1].append(list(map(ll,ring)))
  if not polygons:raise ValueError('Missing outer polygon')
  return {'type':'Polygon','coordinates':polygons[0]} if len(polygons)==1 else {'type':'MultiPolygon','coordinates':polygons}
 raise ValueError('Invalid geometry type')

def decode(data,z,x,y):
 summaries=[];allfeatures=[]
 for raw in fields(data).get(3,[]):
  layer=fields(raw);name=layer[1][0].decode('utf-8');keys=[v.decode('utf-8') for v in layer.get(3,[])];values=[value(v) for v in layer.get(4,[])];extent=layer.get(5,[4096])[0];features=[]
  for feature in layer.get(2,[]):
   f=fields(feature);tags=packed(f.get(2,[b''])[0]);props={keys[tags[i]]:values[tags[i+1]] for i in range(0,len(tags),2)}
   if 4 not in f or f.get(3,[0])[0]==0:continue
   geom=geometry(f[4][0],f[3][0],z,x,y,extent)
   features.append({'type':'Feature','id':str(f.get(1,[len(features)])[0]),'properties':{**props,'_source_layer':name},'geometry':geom})
  allfeatures.extend(features);summaries.append({'name':name,'extent':extent,'features':len(features),'geometryTypes':sorted(set(f['geometry']['type'] for f in features)),'fields':keys,'sampleAttributes':[f['properties'] for f in features[:2]]})
 return {'type':'FeatureCollection','features':allfeatures},summaries
