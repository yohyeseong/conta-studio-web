let coast,job;
function loadCoast(){return job||(job=import('./coast-data.js?v=nature-parapet1').then(({COAST})=>{const bytes=Uint8Array.from(atob(COAST),c=>c.charCodeAt(0));return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();}));}
export function prepareCoast(world,redraw){loadCoast().then(data=>{coast=data;for(const poly of coast.land)poly.points=poly.ring.map(p=>world(...p));redraw();}).catch(()=>{});}
export async function coastForSelection(bounds){const data=await loadCoast(),[w,s,e,n]=data.bounds;if(bounds[0]<w||bounds[1]<s||bounds[2]>e||bounds[3]>n)return null;return data.land.filter(p=>p.bbox[2]>=bounds[0]&&p.bbox[0]<=bounds[2]&&p.bbox[3]>=bounds[1]&&p.bbox[1]<=bounds[3]).map(p=>p.ring);}
export function paintCoast(ctx,world,scale,origin,bounds){
 if(!coast)return;
 const [w,s,e,n]=coast.bounds;if(bounds[2]<w||bounds[0]>e||bounds[3]<s||bounds[1]>n)return;
 const nw=world(w,n),se=world(e,s),x=nw[0]*scale-origin.x,y=nw[1]*scale-origin.y,width=(se[0]-nw[0])*scale,height=(se[1]-nw[1])*scale;
 ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();ctx.fillStyle='#9dcfe5';ctx.fillRect(x,y,width,height);ctx.fillStyle='#edf0f3';
 for(const poly of coast.land){const b=poly.bbox;if(b[2]<bounds[0]||b[0]>bounds[2]||b[3]<bounds[1]||b[1]>bounds[3])continue;ctx.beginPath();for(let i=0;i<poly.points.length;i++){const p=poly.points[i],xx=p[0]*scale-origin.x,yy=p[1]*scale-origin.y;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.closePath();ctx.fill();}
 ctx.restore();
}

