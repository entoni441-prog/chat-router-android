// MCP JSON-RPC bridge to the existing Android D1 job queue.
// Called exclusively by the authenticated OAuthProvider API handler.
export const TOOLS = [
  {name:'list_chats',description:'List chats (read only)',inputSchema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0},query:{type:'string'},protocol:{type:'string'},is_unread:{type:'boolean'}},additionalProperties:false}},
  {name:'list_messages',description:'List messages (read only)',inputSchema:{type:'object',properties:{room_id:{type:'string',minLength:1},limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0}},required:['room_id'],additionalProperties:false}},
  {name:'search_messages',description:'Search messages (read only)',inputSchema:{type:'object',properties:{query:{type:'string',minLength:1},limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0}},required:['query'],additionalProperties:false}},
  {name:'list_contacts',description:'List contacts (read only)',inputSchema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0},query:{type:'string'},protocol:{type:'string'}},additionalProperties:false}},
];
const send=(id,result)=>new Response(JSON.stringify({jsonrpc:'2.0',id,result}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(id,code,message)=>new Response(JSON.stringify({jsonrpc:'2.0',id,error:{code,message}}),{headers:{'content-type':'application/json'}});
export async function handleMcp(request,env,context){
  if(context?.verified!==true || context?.resource!=='https://chat-router-relay.entoni441.workers.dev/mcp' || !context?.scopes?.includes('beeper:read'))return new Response('Unauthorized',{status:401});
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405});
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return new Response('Unsupported Media Type',{status:415});
  let body;try{const raw=await request.text();if(raw.length>30000)return new Response('Too large',{status:413});body=JSON.parse(raw);}catch{return fail(null,-32700,'Parse error');}
  const id=body?.id??null;
  if(body?.jsonrpc!=='2.0'||typeof body.method!=='string')return fail(id,-32600,'Invalid Request');
  if(body.method==='notifications/initialized')return new Response(null,{status:202});
  if(id===null)return fail(null,-32600,'Missing id');
  if(body.method==='initialize'){
    if(!['2025-03-26','2025-06-18'].includes(body.params?.protocolVersion))return fail(id,-32602,'Unsupported protocol version');
    return send(id,{protocolVersion:body.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'chat-router',version:'1.0.0'}});
  }
  if(body.method==='ping')return send(id,{});
  if(body.method==='tools/list')return send(id,{tools:TOOLS});
  if(body.method!=='tools/call')return fail(id,-32601,'Method not found');
  const tool=TOOLS.find(x=>x.name===body.params?.name),args=body.params?.arguments??{};
  if(!tool||!args||typeof args!=='object'||Array.isArray(args)||JSON.stringify(args).length>20000)return fail(id,-32602,'Invalid arguments');
  const schema=tool.inputSchema;
  if(Object.keys(args).some(k=>!schema.properties[k])||(schema.required||[]).some(k=>typeof args[k]!=='string'||!args[k].trim()))return fail(id,-32602,'Invalid arguments');
  for(const [key,value] of Object.entries(args)){
    const spec=schema.properties[key];
    if((spec.type==='integer'?!Number.isInteger(value):typeof value!==spec.type)||
      (spec.minimum!==undefined&&value<spec.minimum)||(spec.maximum!==undefined&&value>spec.maximum)||
      (spec.minLength!==undefined&&value.length<spec.minLength))return fail(id,-32602,'Invalid arguments');
  }
  const jobId=crypto.randomUUID(),now=Date.now();
  await env.ROUTER_DB.prepare("INSERT INTO jobs (id,tool,args,status,created_at,expires_at) VALUES (?,?,?,'queued',?,?)")
    .bind(jobId,tool.name,JSON.stringify(args),now,now+120000).run();
  const until=Date.now()+22000;
  while(Date.now()<until){
    await new Promise(resolve=>setTimeout(resolve,850));
    const row=await env.ROUTER_DB.prepare('SELECT status,result,expires_at FROM jobs WHERE id=?').bind(jobId).first();
    if(row?.status==='done'){
      let payload;try{payload=JSON.parse(row.result)}catch{break}
      if(payload?.jsonrpc==='2.0'&&payload.id===jobId&&payload.result?.content)return send(id,payload.result);
      return send(id,{isError:true,content:[{type:'text',text:'Android tool failed'}]});
    }
    if(!row||row.expires_at<Date.now())break;
  }
  await env.ROUTER_DB.prepare("UPDATE jobs SET status='cancelled' WHERE id=? AND status='queued'").bind(jobId).run();
  return send(id,{isError:true,content:[{type:'text',text:'Android response unavailable; retry'}]});
}

export async function runAndroidTool(env,name,args){
 const jobId=crypto.randomUUID(),now=Date.now();
 await env.ROUTER_DB.prepare("INSERT INTO jobs (id,tool,args,status,created_at,expires_at) VALUES (?,?,?,'queued',?,?)").bind(jobId,name,JSON.stringify(args),now,now+120000).run();
 for(let i=0;i<26;i++){
  await new Promise(resolve=>setTimeout(resolve,850));
  const row=await env.ROUTER_DB.prepare('SELECT status,result,expires_at FROM jobs WHERE id=?').bind(jobId).first();
  if(row?.status==='done'){
   try{const data=JSON.parse(row.result);if(data?.jsonrpc==='2.0'&&data.id===jobId&&data.result?.content)return data.result;}catch{}
   return {isError:true,content:[{type:'text',text:'Android tool failed'}]};
  }
  if(!row||row.expires_at<Date.now())break;
 }
 await env.ROUTER_DB.prepare("UPDATE jobs SET status='cancelled' WHERE id=? AND status='queued'").bind(jobId).run();
 return {isError:true,content:[{type:'text',text:'Android response unavailable; retry'}]};
}
