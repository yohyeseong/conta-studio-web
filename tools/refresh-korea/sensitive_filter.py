"""Filter already-received OSM in RAM, before persistence or projection.

No national database, queries, diagnostics containing source identifiers, or
mask geometry is emitted. Conservative source-area filtering may omit nearby
features; it never invents replacement roads or buildings.
"""
import xml.etree.ElementTree as ET
import math

SCHEMA='safe-osm-1'

def tagged(tags):
    lower=lambda v:str(v).strip().lower()
    if 'military' in tags and lower(tags['military']) not in ('no','false','0'):return True
    if any('military' in lower(tags.get(k,'')).split(';') for k in ('landuse','access','building','aerodrome','operator:type')):return True
    if lower(tags.get('shelter_type')) in ('bomb_shelter','air_raid_shelter','fallout_shelter'):return True
    if lower(tags.get('osm_key'))=='military' or lower(tags.get('osm_value'))=='military':return True
    return any('방공호' in str(tags.get(k,'')) for k in ('name','name:ko','name:en','official_name','alt_name'))

def safe_xml(raw):
    # Providers constructing an in-memory tree can filter it directly, without
    # serialising and parsing the same object graph first.
    try:root=raw if isinstance(raw,ET.Element) else ET.fromstring(raw)
    except ET.ParseError:raise ValueError('지도 응답 형식이 올바르지 않습니다.') from None
    if root.tag!='osm' or root.find('remark') is not None:raise ValueError('지도 응답이 완료되지 않았습니다.')
    elements={(e.tag,e.get('id')):e for e in root if e.tag in ('node','way','relation')}
    tags=lambda e:{t.get('k'):t.get('v','') for t in e.findall('tag')}
    denied={key for key,e in elements.items() if e.find('tag') is not None and tagged(tags(e))}
    sensitive_roots=set(denied)
    # Relation members of a restricted object cannot survive anonymously.
    todo=list(denied)
    while todo:
        key=todo.pop();e=elements[key]
        if e.tag=='relation':
            for member in e.findall('member'):
                child=(member.get('type'),member.get('ref'))
                if child in elements and child not in denied:denied.add(child);todo.append(child)
    try:
        node_xy={key[1]:(float(e.get('lon')),float(e.get('lat'))) for key,e in elements.items() if key[0]=='node'}
        if any(not math.isfinite(x) or not math.isfinite(y) or not -180<=x<=180 or not -90<=y<=90 for x,y in node_xy.values()):raise ValueError()
    except (ValueError,TypeError):raise ValueError('지도 좌표 형식이 올바르지 않습니다.') from None
    def coords(key,seen=None):
        seen=set() if seen is None else seen
        if key in seen or key not in elements:return []
        seen.add(key);e=elements[key]
        if key[0]=='node':return [node_xy[key[1]]]
        if key[0]=='way':return [node_xy[n.get('ref')] for n in e.findall('nd') if n.get('ref') in node_xy]
        return [p for m in e.findall('member') for p in coords((m.get('type'),m.get('ref')),seen)]
    def bbox(points):
        return (min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)) if points else None
    # Intersections use actual received footprints, not their rectangular
    # envelopes. A road outside a concave boundary must not disappear merely
    # because its bounding box overlaps. No metre calculation is done here.
    if sensitive_roots:
        from shapely.geometry import Point,LineString,Polygon,GeometryCollection,box
        from shapely.ops import polygonize,unary_union
        from shapely import make_valid,STRtree
        def geometry(key,seen=None):
            seen=set() if seen is None else set(seen)
            if key in seen or key not in elements:return GeometryCollection()
            seen.add(key);e=elements[key]
            if key[0]=='node':return Point(node_xy[key[1]])
            if key[0]=='way':
                points=coords(key)
                if len(points)<2:return Point(points[0]) if points else GeometryCollection()
                return make_valid(Polygon(points)) if len(points)>=4 and points[0]==points[-1] else LineString(points)
            outer=[];inner=[]
            for member in e.findall('member'):
                member_key=(member.get('type'),member.get('ref'))
                g=geometry(member_key,seen)
                if not g.is_empty:(inner if member.get('role')=='inner' else outer).append(g)
            def area(parts):
                merged=unary_union(parts)
                lines=[g for g in parts if g.geom_type in ('LineString','MultiLineString')]
                polygons=list(polygonize(unary_union(lines))) if lines else []
                return unary_union([merged,*polygons])
            return make_valid(area(outer).difference(area(inner))) if outer else GeometryCollection()
        try:
            zones=[]
            for key in sensitive_roots:
                g=geometry(key)
                if g.is_empty:
                    extent=bbox(coords(key))
                    if extent:g=box(*extent)
                if not g.is_empty:zones.append(g)
            tree=STRtree(zones)
            for key in elements:
                if key not in denied and len(tree.query(geometry(key),predicate='intersects')):denied.add(key)
        except Exception:raise ValueError('지도 보호 필터를 완료하지 못했습니다.') from None
    # A way using a removed node, or relation using any removed member, must
    # not leak the excluded vertex or reconstruct the excluded boundary.
    changed=True
    while changed:
        changed=False
        for key,e in elements.items():
            if key in denied:continue
            refs=[('node',n.get('ref')) for n in e.findall('nd')]+[(m.get('type'),m.get('ref')) for m in e.findall('member')]
            if any(k in denied for k in refs):denied.add(key);changed=True
    keep={k:e for k,e in elements.items() if k not in denied}
    used={n.get('ref') for e in keep.values() for n in e.findall('nd')}
    used.update(m.get('ref') for e in keep.values() for m in e.findall('member') if m.get('type')=='node')
    result=ET.Element('osm',version='0.6',generator=SCHEMA)
    for key,e in keep.items():
        if key[0]=='node' and key[1] not in used and not e.findall('tag'):continue
        # Attribution is application-level; discard contributor identity/version history.
        attrs={k:v for k,v in e.attrib.items() if k in ('id','lat','lon')}
        dest=ET.SubElement(result,e.tag,attrs)
        for child in e:
            if child.tag in ('tag','nd','member'):ET.SubElement(dest,child.tag,dict(child.attrib))
    return ET.tostring(result,encoding='utf-8',xml_declaration=True),len(denied)

def safe_search(data):
    return dict(type='FeatureCollection',features=[f for f in data.get('features',[]) if not tagged(f.get('properties',{}))])
