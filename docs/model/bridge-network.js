/* Shared-node bridge graph; crossings without shared vertices remain separate. */
function bridgeNetwork(records,options){
 const {pc,unionAll,terrainPolygons,earcut,rect,rawZ,groundZ,z0,offset,height,thickness,water,roads,clipEdge}=options;
 const key=p=>p.map(v=>Math.round(v*1000)).join(','),nodes=new Map(),edges=[],bounds=rect[0],inside=p=>p[0]>bounds[0][0]+.01&&p[0]<bounds[2][0]-.01&&p[1]>bounds[0][1]+.01&&p[1]<bounds[2][1]-.01;
 const hit=(polys,p)=>{for(const poly of polys){const contains=ring=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};if(contains(poly[0])&&!poly.slice(1).some(contains))return true;}return false;};
 const node=(p,layer,identity)=>{const k=identity!==undefined?'node:'+identity:'xy:'+layer+':'+key(p);if(!nodes.has(k))nodes.set(k,{key:k,p,edges:[],records:new Set(),desired:rawZ(...p)-z0+height*layer+.025});const n=nodes.get(k);n.desired=Math.max(n.desired,rawZ(...p)-z0+height*layer+.025);return n;};
 records.forEach((record,index)=>{record.nodeKeys=[];for(const line of record.lines){for(let i=0;i<line.length;i++){const n=node(line[i],record.layer,record.nodeIds?.[i]);n.records.add(index);record.nodeKeys.push(n.key);if(record.groundEnds){n.explicit=true;if(i===0&&record.groundEnds[0]||i===line.length-1&&record.groundEnds[1])n.ground=true;}if(i){const a=node(line[i-1],record.layer,record.nodeIds?.[i-1]),length=Math.hypot(line[i][0]-line[i-1][0],line[i][1]-line[i-1][1]);if(length<.001)continue;const e={a:a.key,b:n.key,length};edges.push(e);a.edges.push(e);n.edges.push(e);}}}});
 const visited=new Set(),decks=[];
 for(const [seed] of nodes){if(visited.has(seed))continue;const keys=[],pending=[seed],memberIds=new Set(),componentEdges=new Set();visited.add(seed);
  while(pending.length){const k=pending.pop(),n=nodes.get(k);keys.push(k);for(const id of n.records)memberIds.add(id);for(const e of n.edges){componentEdges.add(e);const other=e.a===k?e.b:e.a;if(!visited.has(other)){visited.add(other);pending.push(other);}}}
  const members=[...memberIds].map(i=>records[i]),polys=terrainPolygons(unionAll(members.map(r=>r.polys)).map(poly=>poly.map(ring=>ring.map(p=>p.map(v=>Math.round(v*10000)/10000)))));if(!polys.length)continue;
  const ceiling=Math.max(...keys.map(k=>nodes.get(k).desired)),anchors=keys.filter(k=>{const n=nodes.get(k);return (n.explicit?n.ground:n.edges.length===1)&&inside(n.p)&&!hit(water,n.p)&&hit(roads,n.p);});
  // Only actual interior terminals attach to the ground; clipped model edges are not ramps.
  const distances=new Map(keys.map(k=>[k,{distance:Infinity,anchor:null}]));let heap=[];
  const push=item=>{heap.push(item);let i=heap.length-1;while(i){const j=(i-1)>>1;if(heap[j][0]<=item[0])break;heap[i]=heap[j];i=j;}heap[i]=item;};
  const pop=()=>{const out=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return out;};
  for(const k of anchors){distances.set(k,{distance:0,anchor:k});push([0,k,k]);}
  while(heap.length){const [distance,k,anchor]=pop();if(distance!==distances.get(k).distance)continue;for(const e of nodes.get(k).edges){const other=e.a===k?e.b:e.a,d=distance+e.length;if(d<distances.get(other).distance){distances.set(other,{distance:d,anchor});push([d,other,anchor]);}}}
  const networkLength=[...componentEdges].reduce((s,e)=>s+e.length,0),rampLength=Math.max(10,Math.min(height*20,networkLength/2));
  const profile=p=>{let nearest=Infinity,state=null;for(const e of componentEdges){const a=nodes.get(e.a).p,b=nodes.get(e.b).p,t=Math.max(0,Math.min(1,((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/(e.length*e.length))),x=a[0]+t*(b[0]-a[0]),y=a[1]+t*(b[1]-a[1]),delta=(p[0]-x)**2+(p[1]-y)**2;if(delta>=nearest)continue;nearest=delta;const left=distances.get(e.a),right=distances.get(e.b),l=left.distance+t*e.length,r=right.distance+(1-t)*e.length;state=l<r?{distance:l,anchor:left.anchor}:{distance:r,anchor:right.anchor};}
   if(!state?.anchor)return ceiling;const anchor=nodes.get(state.anchor).p,start=groundZ(...anchor)-z0+offset,t=Math.min(1,state.distance/rampLength),ease=t*t*(3-2*t);if(state.distance<.001)return groundZ(...p)-z0+offset;return start+(ceiling-start)*ease;
  };
  const positions=[],resolution=10;
  const add=(a,b,c)=>positions.push(...a,...b,...c),point=(p,low=false)=>[p[0],p[1],profile(p)-(low?thickness:0)];
  for(const poly of polys){const flat=earcut.flatten(poly),vertices=[];for(let i=0;i<flat.vertices.length;i+=2)vertices.push([flat.vertices[i],flat.vertices[i+1]]);const ids=earcut(flat.vertices,flat.holes,2);let triangles=[];
   for(let i=0;i<ids.length;i+=3){let [a,b,c]=ids.slice(i,i+3),p=vertices[a],q=vertices[b],r=vertices[c],area=(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);if(Math.abs(area)<1e-8)continue;if(area<0)[b,c]=[c,b];triangles.push([a,b,c]);}
   const edge=(a,b)=>a<b?a+','+b:b+','+a;
   for(let pass=0;pass<12;pass++){const mids=new Map();for(const t of triangles)for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3],p=vertices[a],q=vertices[b],k=edge(a,b);if(!mids.has(k)&&Math.hypot(p[0]-q[0],p[1]-q[1])>resolution&&(Math.abs(profile(p)-profile(q))>.1||Math.abs(profile([(p[0]+q[0])/2,(p[1]+q[1])/2])-(profile(p)+profile(q))/2)>.02)){mids.set(k,vertices.length);vertices.push([(p[0]+q[0])/2,(p[1]+q[1])/2]);}}if(!mids.size)break;const next=[];
    for(const [a,b,c] of triangles){const m=mids.get(edge(a,b)),n=mids.get(edge(b,c)),p=mids.get(edge(c,a)),mask=(m===undefined?0:1)+(n===undefined?0:2)+(p===undefined?0:4);switch(mask){case 0:next.push([a,b,c]);break;case 1:next.push([a,m,c],[m,b,c]);break;case 2:next.push([a,b,n],[a,n,c]);break;case 4:next.push([a,b,p],[b,c,p]);break;case 3:next.push([b,n,m],[a,m,n],[a,n,c]);break;case 5:next.push([a,m,p],[m,b,c],[m,c,p]);break;case 6:next.push([c,p,n],[a,b,n],[a,n,p]);break;case 7:next.push([a,m,p],[m,b,n],[p,n,c],[m,n,p]);break;}}
    triangles=next;if(triangles.length>100000)throw Error('고가도로가 너무 복잡합니다. 선택 영역을 줄여주세요.');
   }
   const boundary=new Map();for(const [a,b,c] of triangles){add(point(vertices[a]),point(vertices[b]),point(vertices[c]));add(point(vertices[a],true),point(vertices[c],true),point(vertices[b],true));for(const [x,y] of [[a,b],[b,c],[c,a]]){const k=edge(x,y);if(boundary.has(k))boundary.delete(k);else boundary.set(k,[x,y]);}}
   for(const [x,y] of boundary.values()){const a=vertices[x],b=vertices[y];add(point(a),point(a,true),point(b,true));add(point(a),point(b,true),point(b));}
  }
  const flatTriangles=[],rampPositions=[];if(anchors.length)for(let i=0;i<positions.length;i+=9){const p=positions.slice(i,i+9),area=(p[3]-p[0])*(p[7]-p[1])-(p[6]-p[0])*(p[4]-p[1]);if(area<=1e-8)continue;if([p[2],p[5],p[8]].every(z=>Math.abs(z-ceiling)<1e-6))flatTriangles.push([[[p[0],p[1]],[p[3],p[4]],[p[6],p[7]],[p[0],p[1]]]]);else rampPositions.push(...p);}
  const flatPolygons=anchors.length?terrainPolygons(unionAll(flatTriangles)):polys;
  decks.push({flatPolygons,rampPositions:new Float32Array(rampPositions),poly:polys[0],polygons:polys,positions:new Float32Array(positions),roof:ceiling,bottom:ceiling-thickness,thickness,ramps:anchors.length,terminals:anchors.map(k=>({xy:nodes.get(k).p,z:groundZ(...nodes.get(k).p)-z0+offset})),sourceIds:members.map(r=>r.sourceId),estimated:true});
 }
 return decks;
}
