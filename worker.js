
export class WorldRoom {
  constructor(state,env){this.state=state;this.clients=new Map();this.socialGames=new Map();
    this.sweep=setInterval(()=>{
      const now=Date.now();
      for(const [id,c] of this.clients){
        if(now-c.lastSeen>35000){try{c.ws.close(4000,'Connection timed out')}catch(e){}this.clients.delete(id);this.broadcast({type:'bye',id});}
        else{try{c.ws.send(JSON.stringify({type:'heartbeat'}))}catch(e){this.clients.delete(id);this.broadcast({type:'bye',id})}}
      }
    },10000);}
  async fetch(request){
    if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
    const u=new URL(request.url);const name=(u.searchParams.get('name')||'Guest').slice(0,22);
    const pair=new WebSocketPair();const client=pair[0],server=pair[1];server.accept();
    const session=(u.searchParams.get('session')||'').slice(0,80);
    // Replace stale/duplicate connections from the same browser, not players sharing a name.
    if(session){
      for(const [oldId,old] of this.clients){
        if(old.session===session){
          this.clients.delete(oldId);
          this.broadcast({type:'bye',id:oldId});
          try{old.ws.close(4001,'Replaced by newer session')}catch(e){}
        }
      }
    }
    const id=crypto.randomUUID().slice(0,12);for(const [oldId,old] of this.clients){if(Date.now()-old.lastSeen>35000){this.clients.delete(oldId);this.broadcast({type:'bye',id:oldId});try{old.ws.close(4000,'Timed out')}catch(e){}}}
    const players=[...this.clients].filter(([_,c])=>Date.now()-c.lastSeen<=35000).map(([id,c])=>({id,name:c.name,x:c.x,z:c.z,rot:c.rot,ride:c.ride||'',seat:c.seat||0,gesture:c.gesture||'',y:c.y||0,roof:!!c.roof,climbing:!!c.climbing,bouncing:!!c.bouncing,look:c.look||null,picnic:!!c.picnic,swim:c.swim||'',swimMoving:!!c.swimMoving,boat:c.boat??-1,boatSeat:c.boatSeat??-1,fishing:!!c.fishing,pet:c.pet||'',treat:c.treat||"",treatUntil:c.treatUntil||0,specialRide:c.specialRide||'',specialSeat:c.specialSeat??-1,specialX:c.specialX||0,specialZ:c.specialZ||0,specialA:c.specialA||0}));
    const item={ws:server,name,x:0,z:13,rot:0,ride:'',seat:0,gesture:'',y:0,roof:false,climbing:false,bouncing:false,look:null,picnic:false,swim:'',swimMoving:false,boat:-1,boatSeat:-1,fishing:false,lastSeen:Date.now(),session};this.clients.set(id,item);
    server.send(JSON.stringify({type:'welcome',id,count:this.clients.size,players}));
    this.broadcast({type:'pos',id,name,x:0,z:13,rot:0},id);
    server.addEventListener('message',async e=>{try{if(typeof e.data!=='string'||e.data.length>1024)return;const d=JSON.parse(e.data);item.lastSeen=Date.now();if(d.type==='heartbeatAck')return;if(d.type==='bumperHit'){const seat=Number(d.seat);if(Number.isInteger(seat)&&seat>=0&&seat<8){const target=[...this.clients].find(([_,c])=>c.specialRide==='bumper'&&c.specialSeat===seat);if(target){try{target[1].ws.send(JSON.stringify({type:'bumperHit',seat,vx:Math.max(-7,Math.min(7,Number(d.vx)||0)),vz:Math.max(-7,Math.min(7,Number(d.vz)||0))}))}catch(e){}}}return}if(d.type==='specialRide'){const kind=['coaster','bumper'].includes(d.kind)?d.kind:'';const seat=Number(d.seat);if(kind&&(!Number.isInteger(seat)||seat<0||seat>=(kind==='coaster'?6:8)))return;const taken=[...this.clients].some(([otherId,c])=>otherId!==id&&c.specialRide===kind&&c.specialSeat===seat);if(taken&&!(item.specialRide===kind&&item.specialSeat===seat))return;item.specialRide=kind;item.specialSeat=kind?seat:-1;item.specialX=Math.max(-14,Math.min(14,Number(d.x)||0));item.specialZ=Math.max(-14,Math.min(14,Number(d.z)||0));item.specialA=Number(d.a)||0;this.broadcast({type:'specialRide',id,name,kind,seat:item.specialSeat,x:item.specialX,z:item.specialZ,a:item.specialA},id);return}if(d.type==='pos'){item.x=Math.max(-69,Math.min(69,Number(d.x)||0));item.z=Math.max(-89,Math.min(75,Number(d.z)||0));item.rot=Number(d.rot)||0;item.y=Math.max(-1,Math.min(13,Number(d.y)||0));item.roof=!!d.roof;item.climbing=!!d.climbing;item.bouncing=!!d.bouncing;item.picnic=!!d.picnic;item.swim=['freestyle','backstroke'].includes(d.swim)?d.swim:'';item.swimMoving=!!d.swimMoving;item.boat=Number.isInteger(d.boat)&&d.boat>=0&&d.boat<2?d.boat:-1;item.boatSeat=item.boat<0?-1:(d.boatSeat===1?1:0);item.fishing=!!d.fishing;item.look=d.look&&typeof d.look==='object'?d.look:null;item.ride=['viking','carousel','ferris','teacup'].includes(d.ride)?d.ride:'';item.seat=Math.max(0,Math.min(7,Number(d.seat)||0));item.gesture=['wave','highfive','dance','clap','heart'].includes(d.gesture)?d.gesture:'';this.broadcast({type:'pos',id,name,x:item.x,z:item.z,rot:item.rot,y:item.y,ride:item.ride,seat:item.seat,gesture:item.gesture,roof:item.roof,climbing:item.climbing,bouncing:item.bouncing,picnic:item.picnic,look:item.look,swim:item.swim,swimMoving:item.swimMoving,boat:item.boat,boatSeat:item.boatSeat,fishing:item.fishing},id)}else if(d.type==='pet'){
 item.pet=['puppy','kitten','bunny','parrot','pigeon','monkey','dino','fox','penguin','duck'].includes(d.pet)?d.pet:'';
 this.broadcast({type:'pet',id,name,pet:item.pet},id);
 }else if(d.type==='social'){
 const to=this.clients.get(d.target);
 if(!to||Math.hypot(item.x-to.x,item.z-to.z)>5.5)return;
 if(!['invite','accept','decline','choice'].includes(d.social))return;
 if(!['hug','hand','rps','guess'].includes(d.game))return;
 const payload={type:'social',id,name,target:d.target,social:d.social,game:d.game};
 if(d.social==='choice'){
  const valid=d.game==='rps'?['rock','paper','scissors']:['1','2','3','4','5'];
  const choice=String(d.choice||'');if(!valid.includes(choice))return;
  const ids=[id,d.target].sort();const key=ids.join(':')+':'+d.game;
  let round=this.socialGames.get(key);
  if(!round||Date.now()-round.created>30000){round={created:Date.now(),choices:{}};this.socialGames.set(key,round)}
  round.choices[id]=choice;
  if(round.choices[ids[0]]&&round.choices[ids[1]]){
   const a=round.choices[ids[0]],b=round.choices[ids[1]];
   let scoreA=0,scoreB=0,secret=null;
   if(d.game==='rps'){
    scoreA=a===b?0:({rock:'scissors',paper:'rock',scissors:'paper'}[a]===b?1:-1);scoreB=-scoreA;
   }else{
    secret=1+Math.floor(Math.random()*5);
    const da=Math.abs(Number(a)-secret),db=Math.abs(Number(b)-secret);
    scoreA=da===db?0:da<db?1:-1;scoreB=-scoreA;
   }
   for(const [pid,mine,theirs,score] of [[ids[0],a,b,scoreA],[ids[1],b,a,scoreB]]){
    try{this.clients.get(pid)?.ws.send(JSON.stringify({type:'social',social:'result',game:d.game,target:pid,mine,theirs,secret,outcome:score>0?'win':score<0?'lose':'draw'}))}catch(e){}
   }
   this.socialGames.delete(key);
  }
  return;
 }
 try{to.ws.send(JSON.stringify(payload))}catch(e){}
 }else if(d.type==='action'){
 if(d.action==='treat'&&typeof d.treat==='string'){item.treat=d.treat.slice(0,40);item.treatUntil=Date.now()+28000;}

 if(['bounce','climb','descend','wish','fishStart','fishStop','boatBoard','boatLeave','treat'].includes(d.action))
 this.broadcast({type:'action',id,name,action:d.action,x:Math.max(-69,Math.min(69,Number(d.x)||0)),y:Math.max(-1,Math.min(13,Number(d.y)||0)),z:Math.max(-89,Math.min(75,Number(d.z)||0)),boat:d.boat,seat:d.seat,treat:d.action==='treat'&&typeof d.treat==='string'?d.treat.slice(0,40):undefined},id);
 }else if(d.type==='feed'){const pellets=Array.isArray(d.pellets)?d.pellets.slice(0,10).filter(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<200)):[];if(pellets.length>=6)this.broadcast({type:'feed',id,name,x:Number(d.x)||0,y:Number(d.y)||0,z:Number(d.z)||0,pellets},id);
 }else if(d.type==='secretSave'){
 const code=String(d.code||'').toUpperCase(),body=String(d.body||''),password=String(d.password||'');
 if(!/^[A-Z0-9_-]{3,20}$/.test(code)||!body||body.length>600||password.length<4||password.length>60){server.send(JSON.stringify({type:'secretResult',ok:false,error:'Invalid letter'}));return}
 const key='letter:'+code,existing=await this.state.storage.get(key);
 if(existing){server.send(JSON.stringify({type:'secretResult',ok:false,error:'Letter code already exists'}));return}
 const salt=crypto.randomUUID(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+password))),b=>b.toString(16).padStart(2,'0')).join('');
 await this.state.storage.put(key,{body,salt,hash});server.send(JSON.stringify({type:'secretResult',ok:true}));
 }else if(d.type==='secretRead'){
 const code=String(d.code||'').toUpperCase(),password=String(d.password||''),letter=await this.state.storage.get('letter:'+code);
 if(!letter){server.send(JSON.stringify({type:'secretResult',ok:false,error:'Letter not found'}));return}
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(letter.salt+password))),b=>b.toString(16).padStart(2,'0')).join('');
 server.send(JSON.stringify(hash===letter.hash?{type:'secretResult',ok:true,body:letter.body}:{type:'secretResult',ok:false,error:'Incorrect password'}));
 }else if(d.type==='chat'){this.broadcast({type:'chat',id,name,text:String(d.text||'').slice(0,120)})}}catch(err){}});
    const bye=()=>{if(this.clients.delete(id))this.broadcast({type:'bye',id})};server.addEventListener('close',bye);server.addEventListener('error',bye);
    return new Response(null,{status:101,webSocket:client});
  }
  broadcast(msg,except){const payload=JSON.stringify(msg);for(const [id,c] of this.clients){if(id!==except)try{c.ws.send(payload)}catch(e){this.clients.delete(id)}}}
}
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/health')return Response.json({ok:true,service:'Sunset Bay multiplayer'});if(url.pathname!=='/ws')return new Response('Sunset Bay multiplayer backend',{status:200});const mode=url.searchParams.get('mode');const room=url.searchParams.get('room')||'';if(!['public','private'].includes(mode))return new Response('Invalid mode',{status:400});if(mode==='private'&&!/^[A-Z0-9]{6}$/.test(room))return new Response('Invalid room code',{status:400});const key=mode==='public'?'public-v1':'private-'+room;const id=env.WORLDS.idFromName(key);return env.WORLDS.get(id).fetch(request)}};
