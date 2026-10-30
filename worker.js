export class WorldRoom {
  constructor(state,env){this.state=state;this.clients=new Map();}
  async fetch(request){
    if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
    const u=new URL(request.url);const name=(u.searchParams.get('name')||'Guest').slice(0,22);
    const pair=new WebSocketPair();const client=pair[0],server=pair[1];server.accept();
    const id=crypto.randomUUID().slice(0,12);const players=[...this.clients].map(([id,c])=>({id,name:c.name,x:c.x,z:c.z,rot:c.rot}));
    const item={ws:server,name,x:0,z:13,rot:0};this.clients.set(id,item);
    server.send(JSON.stringify({type:'welcome',id,count:this.clients.size,players}));
    this.broadcast({type:'pos',id,name,x:0,z:13,rot:0},id);
    server.addEventListener('message',e=>{try{if(typeof e.data!=='string'||e.data.length>1024)return;const d=JSON.parse(e.data);if(d.type==='pos'){item.x=Math.max(-69,Math.min(69,Number(d.x)||0));item.z=Math.max(-39,Math.min(75,Number(d.z)||0));item.rot=Number(d.rot)||0;this.broadcast({type:'pos',id,name,x:item.x,z:item.z,rot:item.rot},id)}else if(d.type==='chat'){this.broadcast({type:'chat',id,name,text:String(d.text||'').slice(0,120)})}}catch(err){}});
    const bye=()=>{if(this.clients.delete(id))this.broadcast({type:'bye',id})};server.addEventListener('close',bye);server.addEventListener('error',bye);
    return new Response(null,{status:101,webSocket:client});
  }
  broadcast(msg,except){const payload=JSON.stringify(msg);for(const [id,c] of this.clients){if(id!==except)try{c.ws.send(payload)}catch(e){this.clients.delete(id)}}}
}
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/health')return Response.json({ok:true,service:'Sunset Bay multiplayer'});if(url.pathname!=='/ws')return new Response('Sunset Bay multiplayer backend',{status:200});const mode=url.searchParams.get('mode');const room=url.searchParams.get('room')||'';if(!['public','private'].includes(mode))return new Response('Invalid mode',{status:400});if(mode==='private'&&!/^[A-Z0-9]{6}$/.test(room))return new Response('Invalid room code',{status:400});const key=mode==='public'?'public-v1':'private-'+room;const id=env.WORLDS.idFromName(key);return env.WORLDS.get(id).fetch(request)}};
