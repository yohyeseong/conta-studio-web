/* Clip linework at user-defined detail masks without blocking terrain generation. */
(function(root){
root.detailLineParts=function(a,b,boxes){
 let parts=[[a,b]];
 for(const box of boxes){const next=[];for(const [u,v] of parts){const dx=v[0]-u[0],dy=v[1]-u[1];let lo=0,hi=1,hit=true;for(const [p,q] of [[-dx,u[0]-box[0]],[dx,box[2]-u[0]],[-dy,u[1]-box[1]],[dy,box[3]-u[1]]]){if(Math.abs(p)<1e-14){if(q<0)hit=false;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}if(!hit||hi<=lo){next.push([u,v]);continue;}const at=t=>u.map((x,i)=>x+(v[i]-x)*t);if(lo>1e-10)next.push([u,at(lo)]);if(hi<1-1e-10)next.push([at(hi),v]);}parts=next;}return parts;
};
})(typeof self!=='undefined'?self:globalThis);
