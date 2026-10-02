"""Build a general OSM index from safe features only.

Restricted roots, memberships, geometries and identifiers are held only in
RAM. No raw rows, temporary raw database, or exclusion sidecar is written.
"""
import hashlib,json,os,sqlite3,uuid,math
from pathlib import Path

SCHEMA='korea-safe-1'

def relation_geometry(outer,inner):
    """Malformed inner-only relations cannot define a surface.

    Keep source refs untouched; this geometry is for validation/index bounds.
    GEOS cannot reliably subtract mixed-dimensional collections from an empty
    shell. Never turn their inner rings into an invented outer boundary.
    """
    from shapely.geometry import GeometryCollection
    from shapely.ops import polygonize,unary_union
    from shapely import make_valid
    from shapely.errors import GEOSException
    if not outer:return None if inner else GeometryCollection()
    def combine(parts):
        lines=[g for g in parts if g.geom_type in ('LineString','MultiLineString')]
        return make_valid(unary_union([*parts,*list(polygonize(unary_union(lines)))]))
    try:
        shell=combine(outer)
        if not inner:return shell
        holes=combine(inner)
        if shell.is_empty:return None
        if holes.is_empty:return shell
        pending=list(holes.geoms) if holes.geom_type=='GeometryCollection' else [holes]
        while pending:
            hole=pending.pop()
            if hole.geom_type=='GeometryCollection':pending.extend(hole.geoms)
            elif not hole.is_empty:shell=shell.difference(hole)
        return make_valid(shell)
    except GEOSException:
        return None

def digest(path):
    value=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for part in iter(lambda:stream.read(4*1024*1024),b''):value.update(part)
    return value.hexdigest()

def build(source,destination,data_date,progress=lambda text:None):
    try:return _build(source,destination,data_date,progress)
    except Exception:
        raise ValueError('한국 데이터 인덱스 생성을 완료하지 못했습니다. 원본 형식과 저장 공간을 확인하세요.') from None

def _build(source,destination,data_date,progress):
    import osmium
    from sensitive_filter import tagged
    from shapely.geometry import Point,LineString,Polygon,GeometryCollection,box
    from shapely.ops import polygonize,unary_union
    from shapely import make_valid,STRtree
    source=Path(source).resolve();destination=Path(destination).resolve()
    if not source.is_file() or source.stat().st_size==0:raise ValueError('PBF 원본이 없습니다.')
    roots=set();denied_nodes=set();denied_ways=set();denied_relations=set()
    root_geometry={};relations={};member_geometry={}
    def shape(points):
        if not points:return GeometryCollection()
        if len(points)==1:return Point(points[0])
        return make_valid(Polygon(points)) if len(points)>=4 and points[0]==points[-1] else LineString(points)
    class Discover(osmium.SimpleHandler):
        def node(self,n):
            if len(n.tags) and tagged(dict(n.tags)):
                roots.add(('n',n.id));denied_nodes.add(n.id);root_geometry[('n',n.id)]=Point(n.location.lon,n.location.lat)
        def way(self,w):
            if tagged(dict(w.tags)):
                roots.add(('w',w.id));denied_ways.add(w.id)
                denied_nodes.update(n.ref for n in w.nodes)
                root_geometry[('w',w.id)]=shape([(n.lon,n.lat) for n in w.nodes])
        def relation(self,r):
            tags=dict(r.tags);relations[r.id]=([(m.type,m.ref,m.role) for m in r.members],tags)
            if tagged(tags):roots.add(('r',r.id));denied_relations.add(r.id)
    progress('1/3 원본 구조 RAM 검사')
    Discover().apply_file(str(source),locations=True,idx='flex_mem')
    pending=list(denied_relations);visited=set()
    while pending:
        ident=pending.pop()
        if ident in visited:continue
        visited.add(ident)
        for kind,ref,role in relations.get(ident,([],{}))[0]:
            if kind=='n':denied_nodes.add(ref)
            elif kind=='w':denied_ways.add(ref)
            elif kind=='r':denied_relations.add(ref);pending.append(ref)
    class Members(osmium.SimpleHandler):
        def node(self,n):
            if n.id in denied_nodes:member_geometry[('n',n.id)]=Point(n.location.lon,n.location.lat)
        def way(self,w):
            if w.id in denied_ways:
                denied_nodes.update(n.ref for n in w.nodes)
                member_geometry[('w',w.id)]=shape([(n.lon,n.lat) for n in w.nodes])
    progress('2/3 RAM 필터 구성')
    Members().apply_file(str(source),locations=True,idx='flex_mem')
    def relation_shape(ident,seen=None):
        seen=set() if seen is None else set(seen)
        if ident in seen:return GeometryCollection()
        seen.add(ident);outer=[];inner=[]
        for kind,ref,role in relations.get(ident,([],{}))[0]:
            geom=relation_shape(ref,seen) if kind=='r' else member_geometry.get((kind,ref),GeometryCollection())
            if not geom.is_empty:(inner if role=='inner' else outer).append(geom)
        return combine(outer).difference(combine(inner)) if outer else GeometryCollection()
    def combine(parts):
        lines=[g for g in parts if g.geom_type in ('LineString','MultiLineString')]
        return make_valid(unary_union([*parts,*list(polygonize(unary_union(lines)))]))
    zones=[]
    for kind,ident in roots:
        geom=relation_shape(ident) if kind=='r' else root_geometry[(kind,ident)]
        if not geom.is_empty:zones.append(geom)
    tree=STRtree(zones)
    cells={}
    def point_intersects(x,y):
        cell=(math.floor(x*100),math.floor(y*100))
        if cell not in cells:
            cx,cy=cell
            cells[cell]=len(tree.query(box(cx/100-1e-10,cy/100-1e-10,(cx+1)/100+1e-10,(cy+1)/100+1e-10)))>0
        return cells[cell] and intersects(Point(x,y))
    def intersects(geom):return not geom.is_empty and len(tree.query(geom,predicate='intersects'))>0
    destination.mkdir(parents=True,exist_ok=True)
    path=destination/('safe-'+uuid.uuid4().hex+'.sqlite')
    db=sqlite3.connect(path)
    db.executescript('''PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
    CREATE TABLE nodes(id INTEGER PRIMARY KEY,lon REAL,lat REAL,tags TEXT);
    CREATE TABLE ways(id INTEGER PRIMARY KEY,refs TEXT,tags TEXT);
    CREATE TABLE relations(id INTEGER PRIMARY KEY,members TEXT,tags TEXT);
    CREATE VIRTUAL TABLE node_bounds USING rtree(id,w,e,s,n);
    CREATE VIRTUAL TABLE way_bounds USING rtree(id,w,e,s,n);
    CREATE VIRTUAL TABLE relation_bounds USING rtree(id,w,e,s,n);
    CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);
    ''')
    pack=lambda value:json.dumps(value,ensure_ascii=False,separators=(',',':'))
    counts=dict(nodes=0,ways=0,relations=0,invalid_relations=0)
    def add_bbox(table,ident,geom):
        w,s,e,n=geom.bounds;db.execute('INSERT INTO '+table+' VALUES(?,?,?,?,?)',(ident,w,e,s,n))
    class SafeRows(osmium.SimpleHandler):
        def node(self,n):
            tags=dict(n.tags) if len(n.tags) else {};x,y=n.location.lon,n.location.lat
            if n.id in denied_nodes or (tags and tagged(tags)) or point_intersects(x,y):denied_nodes.add(n.id);return
            db.execute('INSERT INTO nodes VALUES(?,?,?,?)',(n.id,x,y,pack(tags) if tags else '{}'))
            if tags:add_bbox('node_bounds',n.id,Point(x,y))
            counts['nodes']+=1
            if counts['nodes']%1_000_000==0:db.commit();progress('안전 노드 '+str(counts['nodes']))
        def way(self,w):
            refs=[n.ref for n in w.nodes];tags=dict(w.tags)
            if w.id in denied_ways or tagged(tags) or any(ref in denied_nodes for ref in refs):denied_ways.add(w.id);return
            geom=shape([(n.lon,n.lat) for n in w.nodes])
            if intersects(geom):denied_ways.add(w.id);return
            db.execute('INSERT INTO ways VALUES(?,?,?)',(w.id,pack(refs),pack(tags)))
            if not geom.is_empty:add_bbox('way_bounds',w.id,geom)
            counts['ways']+=1
            if counts['ways']%100000==0:db.commit();progress('안전 Way '+str(counts['ways']))
    try:
        progress('3/3 필터 통과 객체만 인덱스 기록')
        SafeRows().apply_file(str(source),locations=True,idx='flex_mem');db.commit()
        # Relation geometry is assembled exclusively from safe rows. No
        # excluded membership is ever inserted into the persistent database.
        processing=set();safe_relations={}
        def accept_relation(ident):
            if ident in denied_relations:return None
            if ident in safe_relations:return safe_relations[ident]
            if ident in processing:return None
            processing.add(ident)
            members,tags=relations[ident];outer=[];inner=[];valid=True
            for kind,ref,role in members:
                geom=None
                if kind=='n':
                    row=db.execute('SELECT lon,lat FROM nodes WHERE id=?',(ref,)).fetchone()
                    if row:geom=Point(*row)
                elif kind=='w':
                    row=db.execute('SELECT refs FROM ways WHERE id=?',(ref,)).fetchone()
                    if row:
                        points=[db.execute('SELECT lon,lat FROM nodes WHERE id=?',(nid,)).fetchone() for nid in json.loads(row[0])]
                        if all(p is not None for p in points):geom=shape(points)
                elif kind=='r' and ref in relations:geom=accept_relation(ref)
                if geom is None:valid=False;break
                (inner if role=='inner' else outer).append(geom)
            processing.remove(ident)
            geom=relation_geometry(outer,inner) if valid else None
            if valid and geom is None:counts['invalid_relations']+=1
            if geom is None or tagged(tags) or intersects(geom):denied_relations.add(ident);return None
            db.execute('INSERT INTO relations VALUES(?,?,?)',(ident,pack(members),pack(tags)))
            if not geom.is_empty:add_bbox('relation_bounds',ident,geom)
            safe_relations[ident]=geom;counts['relations']+=1
            return geom
        progress('안전 Relation 검사')
        for ident in relations:accept_relation(ident)
        metadata=dict(schema=SCHEMA,region='South Korea',source='OpenStreetMap / Geofabrik',data_date=data_date,format='osm.pbf',
                      app_compatibility='>=1.1.0',source_path=str(source),source_bytes=source.stat().st_size,source_mtime_ns=source.stat().st_mtime_ns,
                      sha256=digest(source),index_file=path.name,counts=counts,attribution='© OpenStreetMap contributors · ODbL 1.0',safe_only=True)
        for key,value in metadata.items():db.execute('INSERT INTO metadata VALUES(?,?)',(key,pack(value)))
        db.commit();assert db.execute('PRAGMA quick_check').fetchone()[0]=='ok';db.close()
        marker=destination/('metadata-'+uuid.uuid4().hex+'.json');marker.write_text(json.dumps(metadata,ensure_ascii=False,indent=2),'utf8')
        os.replace(marker,destination/'metadata.json');progress('완료');return metadata
    except Exception:
        db.close();path.unlink(missing_ok=True);raise
