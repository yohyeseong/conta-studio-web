"""BBOX reads from the safe topology index; no PBF scan during queries."""
import json,math,os,sqlite3
from pathlib import Path
import xml.etree.ElementTree as ET
from korea_safe_index import SCHEMA

def data_root():
    if os.environ.get('CONTA_KOREA_DATA'):return Path(os.environ['CONTA_KOREA_DATA'])
    home=Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'ContaStudio'
    config=home/'korea-data.json'
    if config.exists():
        try:return Path(json.loads(config.read_text('utf8'))['index_root'])
        except (OSError,ValueError,KeyError):raise KoreaDataUnavailable('대한민국 데이터 위치 설정을 다시 확인하세요.') from None
    portable=Path(__file__).with_name('korea-data.json')
    if portable.is_file():return Path(json.loads(portable.read_text('utf8'))['index_root'])
    return home/'Data/Korea'

def register_index(root):
    import uuid
    from contextlib import closing
    provider=KoreaDataProvider(root)
    with closing(sqlite3.connect(provider.path.as_uri()+'?mode=ro',uri=True)) as db:
        if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise KoreaDataUnavailable('한국 인덱스 검사 실패')
    home=Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'ContaStudio';home.mkdir(parents=True,exist_ok=True)
    temporary=home/('korea-data-'+uuid.uuid4().hex+'.tmp')
    try:
        temporary.write_text(json.dumps({'index_root':str(provider.root)},ensure_ascii=False),'utf8')
        os.replace(temporary,home/'korea-data.json')
    finally:temporary.unlink(missing_ok=True)

class KoreaDataUnavailable(ValueError):pass

class KoreaDataProvider:
    def __init__(self,root=None):
        self.root=Path(root or data_root()).resolve()
        try:
            self.metadata=json.loads((self.root/'metadata.json').read_text('utf8'))
            self.path=(self.root/self.metadata['index_file']).resolve()
            if not self.path.is_relative_to(self.root) or not self.path.is_file():raise ValueError()
            if self.metadata['schema']!=SCHEMA or self.metadata.get('safe_only') is not True:raise ValueError()
            source=Path(self.metadata['source_path']);stat=source.stat()
            if stat.st_size!=self.metadata['source_bytes'] or stat.st_mtime_ns!=self.metadata['source_mtime_ns']:raise ValueError()
            from contextlib import closing
            with closing(sqlite3.connect(self.path.as_uri()+'?mode=ro',uri=True)) as db:
                values=dict(db.execute("SELECT key,value FROM metadata WHERE key IN ('schema','safe_only','sha256')"))
                if values.get('schema')!=json.dumps(SCHEMA) or values.get('safe_only')!='true' or json.loads(values.get('sha256','null'))!=self.metadata['sha256']:raise ValueError()
        except (OSError,ValueError,KeyError,sqlite3.Error):
            raise KoreaDataUnavailable('대한민국 로컬 데이터가 없거나 변경되었습니다. 데이터를 등록·검사하거나 온라인 모드를 선택하세요.') from None

    def _records(self,bbox,buffer_m=30,preview_zoom=None):
        w,s,e,n=map(float,bbox)
        if not (-180<=w<e<=180 and -85<s<n<85) or not 0<=buffer_m<=200:raise ValueError('BBOX 오류')
        from pyproj import Transformer
        if buffer_m:
            forward=Transformer.from_crs(4326,5186,always_xy=True);backward=Transformer.from_crs(5186,4326,always_xy=True)
            left,bottom,right,top=forward.transform_bounds(w,s,e,n)
            west,south,east,north=backward.transform_bounds(left-buffer_m,bottom-buffer_m,right+buffer_m,top+buffer_m)
            bounds=(west,east,south,north)
        else:bounds=(w,e,s,n)
        overview=preview_zoom is not None and preview_zoom<14
        def preview_way(tags):
            return not overview or tags.get('highway') in ('motorway','trunk','primary','secondary') or 'landuse' in tags or 'natural' in tags or 'leisure' in tags or tags.get('amenity') in ('school','university','college','hospital','parking')
        db=sqlite3.connect(self.path.as_uri()+'?mode=ro',uri=True)
        nodes={};ways={};relations={}
        try:
            if db.execute('SELECT value FROM metadata WHERE key=?',('schema',)).fetchone()!=(json.dumps(SCHEMA),):raise ValueError('인덱스 형식 오류')
            def candidate(table):return [r[0] for r in db.execute('SELECT id FROM '+table+' WHERE e>=? AND w<=? AND n>=? AND s<=?',bounds)]
            def rows(table,ids,condition=''):
                ids=list(ids)
                for offset in range(0,len(ids),800):
                    part=ids[offset:offset+800]
                    yield from db.execute('SELECT * FROM '+table+' WHERE id IN ('+','.join('?' for _ in part)+')'+condition,part)
            def add_ways(ids,filter_preview=False):
                condition=" AND (json_extract(tags,'$.highway') IN ('motorway','trunk','primary','secondary') OR json_type(tags,'$.landuse') IS NOT NULL OR json_type(tags,'$.natural') IS NOT NULL OR json_type(tags,'$.leisure') IS NOT NULL OR json_extract(tags,'$.amenity') IN ('school','university','college','hospital','parking'))" if filter_preview and overview else ''
                for ident,refs,raw in rows('ways',set(ids)-ways.keys(),condition):
                    tags=json.loads(raw)
                    if not filter_preview or preview_way(tags):ways[ident]=(json.loads(refs),tags)
            add_ways(candidate('way_bounds'),filter_preview=True)
            pending=[]
            for ident,members,raw in rows('relations',candidate('relation_bounds')):
                tags=json.loads(raw)
                # Polygon relations require complete rings. Route membership is
                # stored in the index but is not expanded into national routes.
                if tags.get('type')=='multipolygon' and (not overview or 'landuse' in tags or 'natural' in tags or 'leisure' in tags or tags.get('amenity') in ('school','university','college','hospital','parking')):
                    relations[ident]=(json.loads(members),tags);pending.append(ident)
                elif not overview and (tags.get('type')=='bridge' or tags.get('man_made')=='bridge'):
                    # Bridge memberships only for ways already selected by bbox.
                    selected=[m for m in json.loads(members) if m[0]=='w' and m[1] in ways]
                    if selected:relations[ident]=(selected,tags)
            seen=set()
            while pending:
                ident=pending.pop()
                if ident in seen:continue
                seen.add(ident)
                members=relations[ident][0]
                add_ways(ref for kind,ref,_ in members if kind=='w')
                for child,raw,tags in rows('relations',[ref for kind,ref,_ in members if kind=='r' and ref not in relations]):
                    relations[child]=(json.loads(raw),json.loads(tags));pending.append(child)
            needed=set()
            condition=" AND json_type(tags,'$.place') IS NOT NULL" if overview else ''
            for ident,lon,lat,raw in rows('nodes',candidate('node_bounds'),condition):
                tags=json.loads(raw)
                if not overview or ('place' in tags and (tags.get('name') or tags.get('name:ko'))):nodes[ident]=(lon,lat,tags)
            needed.update(ref for refs,tags in ways.values() for ref in refs)
            needed.update(ref for members,tags in relations.values() for kind,ref,_ in members if kind=='n')
            for ident,lon,lat,tags in rows('nodes',needed-nodes.keys()):nodes[ident]=(lon,lat,json.loads(tags))
            if any(ref not in nodes for refs,tags in ways.values() for ref in refs):raise ValueError('인덱스 노드 참조 누락')
        finally:db.close()
        return nodes,ways,relations

    def query(self,bbox,buffer_m=30,preview_zoom=None):
        nodes,ways,relations=self._records(bbox,buffer_m,preview_zoom)
        xml=ET.Element('osm',version='0.6')
        def tags(element,values):
            for key,value in values.items():ET.SubElement(element,'tag',k=key,v=value)
        for ident,(lon,lat,values) in nodes.items():tags(ET.SubElement(xml,'node',id=str(ident),lon=repr(lon),lat=repr(lat)),values)
        for ident,(refs,values) in ways.items():
            element=ET.SubElement(xml,'way',id=str(ident))
            for ref in refs:ET.SubElement(element,'nd',ref=str(ref))
            tags(element,values)
        for ident,(members,values) in relations.items():
            element=ET.SubElement(xml,'relation',id=str(ident))
            for kind,ref,role in members:ET.SubElement(element,'member',type={'n':'node','w':'way','r':'relation'}[kind],ref=str(ref),role=role)
            tags(element,values)
        from sensitive_filter import safe_xml
        return safe_xml(xml)[0]

    def preview_scene(self,bbox,zoom):
        """Render already-filtered index rows without an XML round trip.

        Index construction performs spatial filtering before any disk writes.
        Reject an index containing restricted tags instead of partially drawing
        it. Only temporary screen coordinates are calculated here; source
        coordinates and node references remain unchanged in the index.
        """
        from sensitive_filter import tagged
        import numpy as np
        nodes,ways,relations=self._records(bbox,0,zoom)
        values=(value[-1] for group in (nodes,ways,relations) for value in group.values())
        if any(tags and tagged(tags) for tags in values):
            raise KoreaDataUnavailable('지도 보호 검사를 통과하지 못했습니다. 데이터 인덱스를 다시 등록하세요.')
        if not nodes:return [],[]
        ids=list(nodes)
        xy=np.array([(nodes[ident][0],nodes[ident][1]) for ident in ids],dtype=float)
        if not np.isfinite(xy).all() or np.any(np.abs(xy[:,1])>=90):raise KoreaDataUnavailable('지도 좌표 검사 실패')
        size=256*2**zoom
        px=(xy[:,0]+180)/360*size
        lat=np.clip(xy[:,1],-85.05112878,85.05112878)
        py=(1-np.arcsinh(np.tan(np.radians(lat)))/np.pi)/2*size
        points=dict(zip(ids,zip(px.tolist(),py.tolist())))
        scene=[];labels=[]
        for refs,tags in ways.values():
            path=[points[ref] for ref in refs]
            if len(path)>1:
                bounds=(min(p[0] for p in path),min(p[1] for p in path),max(p[0] for p in path),max(p[1] for p in path))
                scene.append((tags,path,bounds))
        for ident,(_,_,tags) in nodes.items():
            name=tags.get('name:ko') or tags.get('name')
            if name and ('place' in tags or (zoom>=18 and 'amenity' in tags)):labels.append((points[ident],name))
        # Multipolygon water/parks are composed of open member ways. They
        # cannot be painted by the closed-way renderer alone.
        from shapely.geometry import LineString
        from shapely.ops import polygonize,unary_union
        from shapely import make_valid
        from shapely.errors import GEOSException
        for members,tags in relations.values():
            if tags.get('type')!='multipolygon':continue
            outer=[];inner=[]
            for kind,ref,role in members:
                if kind!='w' or ref not in ways:continue
                path=[points[node] for node in ways[ref][0] if node in points]
                if len(path)>1:(inner if role=='inner' else outer).append(LineString(path))
            if not outer:continue
            try:
                shapes=[make_valid(p) for p in polygonize(outer)]
                holes=[make_valid(p) for p in polygonize(inner)]
                geometry=make_valid(unary_union(shapes).difference(unary_union(holes)))
            except GEOSException:
                # The already rendered member ways remain available. One broken
                # preview fill must not blank every tile in the viewport.
                continue
            for poly in getattr(geometry,'geoms',[geometry]):
                if poly.geom_type!='Polygon' or poly.is_empty:continue
                style=dict(tags);style['_holes']=[list(r.coords) for r in poly.interiors]
                scene.append((style,list(poly.exterior.coords),poly.bounds))
        return scene,labels

    def features(self,bbox,category):
        root=ET.fromstring(self.query(bbox));found=[]
        for element in root:
            tags={t.get('k'):t.get('v') for t in element.findall('tag')}
            checks={'buildings':('building' in tags or 'building:part' in tags),'roads':'highway' in tags,
                    'bridges':tags.get('bridge','no') not in ('no','false','0',''),'railways':'railway' in tags,
                    'waterways':('waterway' in tags or tags.get('natural')=='water'),'landuse':'landuse' in tags}
            if checks.get(category):found.append(element)
        return found
    def get_buildings(self,bbox):return self.features(bbox,'buildings')
    def get_roads(self,bbox):return self.features(bbox,'roads')
    def get_bridges(self,bbox):return self.features(bbox,'bridges')
    def get_railways(self,bbox):return self.features(bbox,'railways')
    def get_waterways(self,bbox):return self.features(bbox,'waterways')
    def get_landuse(self,bbox):return self.features(bbox,'landuse')

