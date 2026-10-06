// Weld preview vertices and split shared edges at T junctions before smoothing.
// Coordinates are in the writer's inches; tolerance is 0.1 mm in real size.
export function connectedMesh(positions,convert,factor){
 const tolerance=.0001*factor,cell=20*factor,vertices=[],lookup=new Map(),buckets=new Map(),triangles=[];
 const key=p=>p.map(v=>Math.round(v/tolerance)).join(',');
 const vertex=p=>{const k=key(p);if(lookup.has(k))return lookup.get(k);const id=vertices.length;vertices.push(p);lookup.set(k,id);const bucket=[Math.floor(p[0]/cell),Math.floor(p[1]/cell)].join(',');if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push(id);return id;};
 for(let i=0;i<positions.length;i+=9)triangles.push([0,3,6].map(j=>vertex(convert(Array.from(positions.slice(i+j,i+j+3))))));
 const splitCache=new Map();
 const split=(a,b)=>{
  const cacheKey=[Math.min(a,b),Math.max(a,b)].join(',');if(splitCache.has(cacheKey)){const ids=splitCache.get(cacheKey);return ids[0]===a?ids:[...ids].reverse();}
  const p=vertices[a],q=vertices[b],d=q.map((v,i)=>v-p[i]),length2=d.reduce((s,v)=>s+v*v,0),hits=[[0,a],[1,b]];
  if(length2>tolerance*tolerance)for(let x=Math.floor((Math.min(p[0],q[0])-tolerance)/cell);x<=Math.floor((Math.max(p[0],q[0])+tolerance)/cell);x++)for(let y=Math.floor((Math.min(p[1],q[1])-tolerance)/cell);y<=Math.floor((Math.max(p[1],q[1])+tolerance)/cell);y++)for(const id of buckets.get([x,y].join(','))||[]){
   if(id===a||id===b)continue;const r=vertices[id],t=d.reduce((s,v,i)=>s+v*(r[i]-p[i]),0)/length2;if(t<=1e-8||t>=1-1e-8)continue;
   if(r.reduce((s,v,i)=>s+(v-p[i]-t*d[i])**2,0)<=tolerance*tolerance)hits.push([t,id]);
  }
  const ids=hits.sort((a,b)=>a[0]-b[0]).map(v=>v[1]);splitCache.set(cacheKey,ids);return ids;
 };
 const faces=[];
 for(const ids of triangles){if(new Set(ids).size<3)continue;const ring=[];for(let i=0;i<3;i++)ring.push(...split(ids[i],ids[(i+1)%3]).slice(0,-1));if(ring.length===3)faces.push(ring.map(id=>vertices[id]));else{const center=ids.map(id=>vertices[id]).reduce((s,p)=>s.map((v,i)=>v+p[i]/3),[0,0,0]);for(let i=0;i<ring.length;i++)faces.push([center,vertices[ring[i]],vertices[ring[(i+1)%ring.length]]]);}}
 const valid=faces.filter(([a,b,c])=>{const u=b.map((v,i)=>v-a[i]),v=c.map((w,i)=>w-a[i]);return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>=1e-9;});
 const edges=new Map();for(const face of valid)for(let i=0;i<3;i++){const a=face[i],b=face[(i+1)%3],k=[key(a),key(b)].sort().join('|');const entry=edges.get(k);if(entry)entry.count++;else edges.set(k,{points:[a,b],count:1});}
 return {faces:valid,boundaries:[...edges.values()].filter(e=>e.count===1).map(e=>e.points)};
}
