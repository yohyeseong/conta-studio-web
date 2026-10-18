// Close a vertically thickened surface after sewing its triangle edges.
(function(root){
root.surfaceVolume=function(positions,depth){
 const tolerance=.0001,cell=20,vertices=[],lookup=new Map(),buckets=new Map(),triangles=[],edgeKey=(a,b)=>a<b?a+','+b:b+','+a;
 function vertex(p){const c=p.map(v=>Math.floor(v/tolerance));for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const id of lookup.get([c[0]+x,c[1]+y,c[2]+z].join(','))||[]){if(Math.hypot(...p.map((v,i)=>v-vertices[id][i]))<=tolerance)return id;}
  const id=vertices.length;vertices.push(p);const key=c.join(',');if(!lookup.has(key))lookup.set(key,[]);lookup.get(key).push(id);const bucket=[Math.floor(p[0]/cell),Math.floor(p[1]/cell)].join(',');if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push(id);return id;
 }
 const normal=ids=>{const [a,b,c]=ids.map(id=>vertices[id]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};
 const seen=new Set();for(let i=0;i<positions.length;i+=9){let ids=[0,3,6].map(j=>vertex(Array.from(positions.slice(i+j,i+j+3))));if(new Set(ids).size<3)continue;const n=normal(ids);const perimeter=ids.reduce((s,id,i)=>s+Math.hypot(...vertices[id].map((v,j)=>v-vertices[ids[(i+1)%3]][j])),0);if(Math.abs(n[2])<1e-10||Math.abs(n[2])/perimeter<tolerance)continue;if(n[2]<0)ids=[ids[0],ids[2],ids[1]];const key=[...ids].sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);triangles.push(ids);}
 const splitCache=new Map();function split(a,b){const key=edgeKey(a,b);if(splitCache.has(key)){const ids=splitCache.get(key);return ids[0]===a?ids:[...ids].reverse();}const p=vertices[a],q=vertices[b],d=q.map((v,i)=>v-p[i]),length2=d.reduce((s,v)=>s+v*v,0),length=Math.sqrt(length2),hits=[[0,a],[1,b]];
  for(let x=Math.floor((Math.min(p[0],q[0])-tolerance)/cell);x<=Math.floor((Math.max(p[0],q[0])+tolerance)/cell);x++)for(let y=Math.floor((Math.min(p[1],q[1])-tolerance)/cell);y<=Math.floor((Math.max(p[1],q[1])+tolerance)/cell);y++)for(const id of buckets.get(x+','+y)||[]){if(id===a||id===b)continue;const r=vertices[id],t=d.reduce((s,v,i)=>s+v*(r[i]-p[i]),0)/length2;if(t*length<=tolerance||(1-t)*length<=tolerance)continue;if(r.reduce((s,v,i)=>s+(v-p[i]-t*d[i])**2,0)<=tolerance*tolerance){vertices[id]=p.map((v,i)=>v+t*d[i]);hits.push([t,id]);}}
  let last=-Infinity;const ids=[];for(const [t,id] of hits.sort((a,b)=>a[0]-b[0]))if((t-last)*length>tolerance/2){ids.push(id);last=t;}splitCache.set(key,ids);return ids;
 }
 let faces=[];for(const ids of triangles){const ring=[];for(let i=0;i<3;i++)ring.push(...split(ids[i],ids[(i+1)%3]).slice(0,-1));if(ring.length===3){faces.push(ids);continue;}const center=ids.map(id=>vertices[id]).reduce((s,p)=>s.map((v,i)=>v+p[i]/3),[0,0,0]),id=vertices.push(center)-1;for(let i=0;i<ring.length;i++){const f=[id,ring[i],ring[(i+1)%ring.length]];if(normal(f)[2]>1e-10)faces.push(f);}}
 const uniqueFaces=new Set();faces=faces.filter(f=>{const n=normal(f),perimeter=f.reduce((s,id,i)=>s+Math.hypot(...vertices[id].map((v,j)=>v-vertices[f[(i+1)%3]][j])),0),key=[...f].sort((a,b)=>a-b).join(',');if(n[2]<=1e-10||n[2]/perimeter<tolerance/4||uniqueFaces.has(key))return false;uniqueFaces.add(key);return true;});
 const edges=new Map(),adj=faces.map(()=>[]);for(let fi=0;fi<faces.length;fi++){const f=faces[fi];for(let i=0;i<3;i++){const a=f[i],b=f[(i+1)%3],key=edgeKey(a,b);if(!edges.has(key))edges.set(key,{a,b,faces:[]});edges.get(key).faces.push(fi);}}
 for(const e of edges.values())if(e.faces.length===2){adj[e.faces[0]].push(e.faces[1]);adj[e.faces[1]].push(e.faces[0]);}
 const visited=new Set(),parts=[],bottom=p=>[p[0],p[1],p[2]-depth];
 for(let start=0;start<faces.length;start++){if(visited.has(start))continue;const stack=[start],component=[];visited.add(start);while(stack.length){const fi=stack.pop();component.push(fi);for(const next of adj[fi])if(!visited.has(next)){visited.add(next);stack.push(next);}}
  const out=[],boundary=new Map(),tri=(a,b,c)=>out.push(...a,...b,...c);
  for(const fi of component){const f=faces[fi],[a,b,c]=f.map(id=>vertices[id]);tri(a,b,c);tri(bottom(c),bottom(b),bottom(a));for(let i=0;i<3;i++){const a=f[i],b=f[(i+1)%3],key=edgeKey(a,b);if(boundary.has(key))boundary.get(key).count++;else boundary.set(key,{a,b,count:1});}}
  for(const {a,b,count} of boundary.values()){if(count!==1)continue;const p=vertices[a],q=vertices[b];tri(p,bottom(p),bottom(q));tri(p,bottom(q),q);}parts.push(new Float32Array(out));
 }
 const resultPositions=new Float32Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){resultPositions.set(part,offset);offset+=part.length;}return {positions:resultPositions,parts};
};
})(typeof self!=='undefined'?self:globalThis);
