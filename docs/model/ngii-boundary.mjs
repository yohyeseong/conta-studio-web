// Polygonize planar boundary linework. No width, buffer, offset or rounded caps.
// Only vertices/intersections within 2 cm are snapped; open edges stay open.
const signedArea=r=>r.reduce((s,p,i)=>i?s+r[i-1][0]*p[1]-p[0]*r[i-1][1]:s,0)/2;
const contains=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])yes=!yes;return yes;};
export function polygonizeBoundaries(lines,tolerance=.02){
 const nodes=[],cells=new Map(),segments=[],unique=new Map(),key=(a,b)=>a<b?a+','+b:b+','+a;
 function node(p){const x=Math.floor(p[0]/tolerance),y=Math.floor(p[1]/tolerance);let best=-1,distance=tolerance;
  for(let i=x-1;i<=x+1;i++)for(let j=y-1;j<=y+1;j++)for(const id of cells.get(i+','+j)||[]){const q=nodes[id],d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<=distance){distance=d;best=id;}}
  if(best>=0)return best;const id=nodes.push(p.slice(0,2))-1,k=x+','+y;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(id);return id;
 }
 for(const [source,line] of lines.entries())for(let i=1;i<line.length;i++){const a=node(line[i-1]),b=node(line[i]);if(a===b)continue;const k=key(a,b);if(unique.has(k)){unique.get(k).sources.add(source);continue;}const segment={a,b,cuts:[{t:0,id:a},{t:1,id:b}],sources:new Set([source])};unique.set(k,segment);segments.push(segment);}
 if(segments.length>15000)throw Error('인도 경계가 너무 많습니다. 영역을 나누어 불러오세요.');
 const add=(s,id,t)=>s.cuts.push({t:Math.max(0,Math.min(1,t)),id});
 function onSegment(id,s){const p=nodes[id],a=nodes[s.a],b=nodes[s.b],dx=b[0]-a[0],dy=b[1]-a[1],t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy);if(t>0&&t<1&&Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<=tolerance)add(s,id,t);}
 // Node crossings and T junctions before walking half edges.
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const s=segments[i],t=segments[j],a=nodes[s.a],b=nodes[s.b],c=nodes[t.a],d=nodes[t.b];
  if(Math.max(a[0],b[0])+tolerance<Math.min(c[0],d[0])||Math.max(c[0],d[0])+tolerance<Math.min(a[0],b[0])||Math.max(a[1],b[1])+tolerance<Math.min(c[1],d[1])||Math.max(c[1],d[1])+tolerance<Math.min(a[1],b[1]))continue;
  onSegment(s.a,t);onSegment(s.b,t);onSegment(t.a,s);onSegment(t.b,s);
  const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-c[0],vy=d[1]-c[1],den=ux*vy-uy*vx;if(Math.abs(den)<1e-12)continue;
  const x=c[0]-a[0],y=c[1]-a[1],u=(x*vy-y*vx)/den,v=(x*uy-y*ux)/den;if(u>1e-10&&u<1-1e-10&&v>1e-10&&v<1-1e-10){const id=node([a[0]+u*ux,a[1]+u*uy]);add(s,id,u);add(t,id,v);}
 }
 const edges=new Map(),adj=new Map();function edge(a,b,sources){if(a===b)return;if(edges.has(key(a,b))){for(const id of sources)edges.get(key(a,b)).sources.add(id);return;}const record=[a,b];record.sources=new Set(sources);edges.set(key(a,b),record);for(const [u,v] of [[a,b],[b,a]]){if(!adj.has(u))adj.set(u,new Set());adj.get(u).add(v);}}
 for(const s of segments){s.cuts.sort((a,b)=>a.t-b.t);for(let i=1;i<s.cuts.length;i++)edge(s.cuts[i-1].id,s.cuts[i].id,s.sources);}
 const remove=(a,b)=>{edges.delete(key(a,b));adj.get(a).delete(b);adj.get(b).delete(a);},open=[];
 const queue=[...adj].filter(([,n])=>n.size<2).map(([v])=>v);while(queue.length){const a=queue.pop();for(const b of [...adj.get(a)]){open.push([nodes[a],nodes[b]]);remove(a,b);if(adj.get(b).size<2)queue.push(b);}}
 // Bridges do not bound a face, even when they connect two closed loops.
 const seen=new Map(),low=new Map(),bridges=[];let timer=0;
 for(const root of adj.keys()){if(seen.has(root)||!adj.get(root).size)continue;seen.set(root,++timer);low.set(root,timer);const stack=[{v:root,parent:-1,list:[...adj.get(root)],i:0}];
  while(stack.length){const f=stack.at(-1);if(f.i<f.list.length){const n=f.list[f.i++];if(n===f.parent)continue;if(!seen.has(n)){seen.set(n,++timer);low.set(n,timer);stack.push({v:n,parent:f.v,list:[...adj.get(n)],i:0});}else low.set(f.v,Math.min(low.get(f.v),seen.get(n)));}else{stack.pop();if(f.parent>=0){if(low.get(f.v)>seen.get(f.parent))bridges.push([f.v,f.parent]);low.set(f.parent,Math.min(low.get(f.parent),low.get(f.v)));}}}
 }
 for(const [a,b] of bridges){open.push([nodes[a],nodes[b]]);remove(a,b);}
 const outgoing=new Map([...adj].map(([id,n])=>[id,[...n].sort((a,b)=>Math.atan2(nodes[a][1]-nodes[id][1],nodes[a][0]-nodes[id][0])-Math.atan2(nodes[b][1]-nodes[id][1],nodes[b][0]-nodes[id][0]))])),visited=new Set(),rings=[];
 for(const [start,neighbors] of outgoing)for(const next of neighbors){if(visited.has(start+'>'+next))continue;let a=start,b=next;const ids=[];
  for(let guard=0;guard<=edges.size*2+1;guard++){const k=a+'>'+b;if(visited.has(k))break;visited.add(k);ids.push(a);const list=outgoing.get(b),reverse=list.indexOf(a),c=list[(reverse-1+list.length)%list.length];a=b;b=c;if(a===start&&b===next){ids.push(start);break;}}
  if(ids.length<4||ids[0]!==ids.at(-1))continue;const ring=ids.map(i=>nodes[i]),area=signedArea(ring);if(area>.01){const sources=new Set();for(let i=1;i<ids.length;i++)for(const id of edges.get(key(ids[i-1],ids[i])).sources)sources.add(id);rings.push({ring,area,sources,parent:null,depth:0});}
 }
 rings.sort((a,b)=>b.area-a.area);for(let i=0;i<rings.length;i++){const r=rings[i],a=r.ring[0],b=r.ring[1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),point=[(a[0]+b[0])/2-dy/len*1e-5,(a[1]+b[1])/2+dx/len*1e-5];for(let j=i-1;j>=0;j--)if(rings[j].area>r.area+1e-6&&contains(point,rings[j].ring)){r.parent=rings[j];r.depth=r.parent.depth+1;break;}}
 const polygons=[],byShell=new Map();for(const r of rings){if(r.depth%2===0){const poly=[r.ring];poly.sources=new Set(r.sources);polygons.push(poly);byShell.set(r,poly);}else{const poly=byShell.get(r.parent);poly.push([...r.ring].reverse());for(const id of r.sources)poly.sources.add(id);}}
 return {polygons,polygonSources:polygons.map(p=>[...p.sources]),openSegments:open,tolerance,segments:segments.length};
}
