export default {async fetch(request){
 const url=new URL(request.url);
 if(url.pathname==='/health')return Response.json({ready:true,version:'official-202609-v1',mode:'prepared-vector-data'},{headers:{'Access-Control-Allow-Origin':'https://yohyeseong.github.io','Cache-Control':'no-store'}});
 return new Response('Not found',{status:404});
}};

