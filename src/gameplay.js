import {barrageMuzzle} from './barrage-layout.js';
import {hasShapedBody} from './kart-footprint.js';
import * as THREE from 'three';
import {resolveKartContacts} from './kart-contact.js';
import {GRAVITY,steerForTurn,stunKart,springJump} from './driving.js';
import {interruptBoost,grantBoost} from './boost.js';

import {ITEMS} from './items.js';
import {itemModel,projectileModel} from './item-art.js';
import {contactTime,shapedItemContactTime} from './projectile-contact.js';
export {ITEMS} from './items.js';

const clamp = THREE.MathUtils.clamp;
const mod = THREE.MathUtils.euclideanModulo;
const blankInput = () => ({
  throttle:1, brake:0, steer:0, driftHeld:false,
  driftPressed:false, itemPressed:false,
});
const flying=new Set(['ball','disc','bolt','lightbolt','lob','ring','cursor','rocket']);
const traps=new Set(['slip','box','puck']);
const hitLabels={lightbolt:'PULSE HIT',pop:'BOX POP',cursor:'CURSOR HIT',ball:'BUMPER HIT',disc:'DISC HIT',bolt:'CONFETTI HIT',
  lob:'JELLY BURST',ring:'RING HIT',puck:'STATIC SHOCK',rocket:'RELAY HIT'};
function notify(actor, text) {
  actor.notice = text;
  actor.noticeTime = 1.3;
}

export function createGameplay(scene, track) {
  let actors = [];
  let elapsed = 0;
  let states = new WeakMap();
  const objects = [];
  let rewards = [...(track.pads || []), ...(track.pickups || [])];
  const root = new THREE.Group();
  scene.add(root);
  const geometries = {
    pulse:new THREE.TorusGeometry(1,.035,5,40),
    tether:new THREE.CylinderGeometry(.05,.05,1,4),
  };
  const materials = {};
  function mesh(shape, color, options={}) {
    const key = shape+color;
    if (!materials[key]) {
      materials[key] = new THREE.MeshBasicMaterial({color, ...options});
    }
    return new THREE.Mesh(geometries[shape],materials[key]);
  }
  function state(a) {
    if (!states.has(a)) states.set(a,{
      shield:0, bubble:null, invincible:0, slip:0, box:0, hops:0, wasGrounded:true,
      draft:0, draftTarget:null, draftRest:0, itemCooldown:1+(a.id || 0)*.65,
      aiDirection:0, aiRest:.35, aiLane:0,
    });
    return states.get(a);
  }
  function deltaS(from,to) {
    return mod(to-from+track.length/2,track.length)-track.length/2;
  }
  function towInReach(k, other, distance) {
    return distance>=2 && distance<=80 && Math.abs(other.x-k.x)<=14 &&
      Math.abs(track.sample(k.s).curvature)*distance<=.73;
  }
  function nearestAhead(a,pack,maxDistance,eligible) {
    let closest=null, distance=maxDistance;
    for (const b of pack) {
      if (a===b || b.finish!=null) continue;
      const d=deltaS(a.kart.s,b.kart.s);
      if(d>0 && d<distance && (!eligible || eligible(a.kart,b.kart,d,b))) {closest=b; distance=d;}
    }
    return closest;
  }
  function point(s,x,y=0) {
    const p=track.sample(s,x).position;
    p.y+=y;
    return p;
  }
  function place(obj,s,x,y=0) {
    obj.position.copy(point(s,x,y));
  }
  function shotHeight(k,spawnS,offset) {
    if(k.grounded)return offset;
    const floor=point(spawnS,k.x).y;
    return Math.max(offset,point(k.s,k.x,k.y+offset).y-floor);
  }
  function add(type,actor,s,x,life,model,extra={}) {
    const object={type,owner:actor,s,x,life,model,born:elapsed,...extra};
    root.add(model);
    objects.push(object);
    place(model,s,x,extra.height || 0);
    return object;
  }
  function remove(index) {
    root.remove(objects[index].model);
    objects.splice(index,1);
  }
  function reset() {
    for (const object of objects) root.remove(object.model);
    objects.length=0;
    states=new WeakMap();
    actors=[];
    elapsed=0;
  }
  function withdraw(a){
    // Keep fired shots and dropped traps in the race. End effects attached to a
    // falling driver and clear old positions before the rescue teleport.
    for(let i=objects.length-1;i>=0;i--){
      const o=objects[i];
      if(o.target===a || (o.owner===a && ['shield','attached','broom','flair','ring','beam','cable'].includes(o.type)))remove(i);
    }
    states.delete(a);
    a.shield=0;a.draft=0;a.incoming='';a.notice='';a.noticeTime=0;
  }
  function pulseAt(a,s,x,height,color,radius) {
    const ring=mesh('pulse',color);
    ring.rotation.x=-Math.PI/2;
    add('pulse',a,s,x,.34,ring,{radius,height});
  }
  function pulse(a,color,radius){
    pulseAt(a,a.kart.s,a.kart.x,a.kart.y+.34,color,radius);
  }
  function shield(a,seconds){
    const st=state(a),k=a.kart;
    if(!st.bubble){
      const m=itemModel('bubble');m.scale.set(1.9,1.65,2.35);
      st.bubble=add('shield',a,k.s,k.x,Infinity,m,{height:k.y+.96});
    }
    a.shield=st.shield=Math.max(st.shield,seconds);
  }
  function flourish(a,type){
    const k=a.kart;
    const model=itemModel(type);model.scale.setScalar(.66);
    add('flair',a,k.s,k.x,.48,model,{height:k.y+2.5});
  }
  function launch(a,type,dir,speed,extra={}){
    const k=a.kart,spawnS=k.s+dir*2.8;
    return add(type,a,spawnS,k.x,extra.duration??3.5,projectileModel(type,extra.tint),{
      v:dir*speed,vx:dir*Math.sin(k.yaw)*17,height:shotHeight(k,spawnS,.83),
      vy:k.grounded?null:k.vy,remainingBounces:0,...extra
    });
  }
  function fireBlasters(a){
    const k=a.kart,st=state(a);
    if(a.car!=='barrage' || k.fall || a.finish!=null || k.stunRemaining>0 || elapsed<(st.blasterReady??0))return false;
    st.blasterReady=elapsed+.65;
    const c=Math.cos(k.yaw),sn=Math.sin(k.yaw),m=barrageMuzzle;
    const speed=k.speed+45,tagged=new Set();
    const scale=clamp(1-k.x*track.sample(k.s,k.x).curvature,.55,1.65);
    for(const side of [-1,1]){
      const s=k.s+(-m.z*c-side*m.x*sn)/scale,x=k.x-m.z*sn+side*m.x*c;
      const height=Math.max(.2,point(k.s,k.x,k.y+m.y).y-point(s,x).y);
      add('lightbolt',a,s,x,1.15,projectileModel('lightbolt',0x44f3ff),{
        height,v:speed*c/scale,vx:speed*sn,vy:k.grounded?null:k.vy,tagged
      });
    }
    return true;
  }
  function blast(owner,s,x,height,radius,color,effect,pack,direct=null){
    pulseAt(owner,s,x,height,color,radius);
    const worldY=point(s,x,height).y;
    for(const b of pack){
      if(b===owner || b.finish!=null)continue;
      if(b===direct){hit(b,effect,x);continue;}
      if(Math.abs(deltaS(s,b.kart.s))>=radius)continue;
      if(Math.hypot(deltaS(s,b.kart.s),x-b.kart.x,worldY-point(b.kart.s,b.kart.x,b.kart.y+.8).y)<radius)
        hit(b,effect,x);
    }
  }
  function dropShield(a) {
    const s=state(a);
    s.shield=0;
    a.shield=0;
    if(s.bubble){
      s.bubble.model.visible=false;
      s.bubble.life=0;
      s.bubble=null;
    }
  }
  function hit(a,effect,fromX) {
    const s=state(a);
    if(s.shield>0) {
      dropShield(a);
      notify(a,'SHIELD BLOCK');
      return true;
    }
    // Spend projectiles that touch a recovering kart so they cannot hover
    // over it and immediately trigger a second roll when protection ends.
    if(s.invincible>0)return effect!=='obstacle';
    const k=a.kart;
    const side=Math.abs(k.x-fromX)<.1 ? (a.id%2 ? 1 : -1) : Math.sign(k.x-fromX);
    if(effect==='box') {
      if(s.box>0) return false;
      interruptBoost(a.boost,k);
      s.box=2.8; s.hops=0;
      const crate=itemModel('box');
      crate.scale.set(1,1,1);
      add('attached',a,k.s,k.x,3.1,crate);
      notify(a,'HOP TWICE!');
      return true;
    }
    if(effect==='obstacle') {
      k.speed*=.78;
      k.travelYaw+=side*.12;
      interruptBoost(a.boost,k);
      return true;
    }

    stunKart(k,side);
    interruptBoost(a.boost,k);
    s.invincible=k.stunRemaining+.35;
    s.draft=a.draft=0;
    s.draftTarget=null;
    s.aiDirection=0;
    if(effect==='slip') {
      s.slip=1.15;
      s.slipDirection=side;
      k.travelYaw+=side*.13;
      notify(a,'SLIPPERY!');
    } else if(effect==='pulse') {
      k.travelYaw+=side*.22;
      notify(a,'BASS BUMP');
    } else {
      k.travelYaw+=side*.12;
      notify(a,hitLabels[effect]??'ITEM HIT');
    }
    return true;
  }

  function use(a,index,pack,backward=false) {
    if(a.kart.fall || a.finish!=null || a.kart.stunRemaining>0 || !Number.isInteger(index)||!ITEMS[index]) return false;
    pack=pack.filter(b=>!b.kart.fall);
    const k=a.kart, s=state(a), ahead=()=>nearestAhead(a,pack,125);
    let message=ITEMS[index].name.toUpperCase();
    switch(index) {
      case 0:
      case 8:
        grantBoost(a.boost,1.45);
        flourish(a,index===8?'triple':'soda');
        if(index===8) {
          if(!(a.charges>0)) a.charges=3;
          a.charges--;
          if(a.charges) message='SODA ×'+a.charges;
        }
        break;
      case 1: {
        const dir=backward?-1:1;
        launch(a,'ball',dir,Math.max(28,k.speed)+24,{remainingBounces:1});
        break;
      }
      case 2:shield(a,6);break;
      case 3: {
        const m=itemModel('slip');
        m.scale.set(2.3,.20,1.7);
        add('slip',a,k.s-3.5,k.x,20,m,{height:.13});
        break;
      }
      case 4: {
        const m=itemModel('box');
        m.scale.set(1.35,1.35,1.35);
        add('box',a,k.s-3.7,k.x,20,m,{height:.72});
        break;
      }
      case 5: {
        const target=ahead();
        launch(a,'cursor',1,k.speed+18,{target,height:shotHeight(k,k.s+2.8,1.05),duration:7});
        if(target)notify(target,'CURSOR INCOMING');
        else message='CURSOR FIRED · NO LOCK';
        break;
      }
      case 6:
        flourish(a,'speaker');
        blast(a,k.s,k.x,k.y+.8,8.5,0xdd8cff,'pulse',pack);
        break;
      case 7: {
        const target=nearestAhead(a,pack,75,towInReach);
        flourish(a,'spool');
        if(!target){message='CABLE MISSED';break;}
        add('cable',a,k.s,k.x,2.15,mesh('tether',0x8efaff),{target});
        break;
      }
      case 9:
        for(let i=0;i<4;i++) {
          const d=k.s+8+i*12, road=track.sample(d,k.x);
          const lane=clamp(k.x,-road.width/2+1.9,road.width/2-1.9);
          const m=itemModel('strip');
          m.scale.set(3.6,1,3.7);
          m.rotation.y=Math.atan2(road.forward.x,road.forward.z);
          add('strip',a,d,lane,9,m,{height:.13,used:new Set()});
        }
        break;
      case 10: {
        const dir=backward?-1:1;
        launch(a,'disc',dir,Math.max(k.speed+35,58),{vx:dir*(Math.abs(k.yaw)>.12?Math.sin(k.yaw)*31:12),remainingBounces:3,duration:4});
        break;
      }
      case 11: {
        const dir=backward?-1:1,tagged=new Set();
        const colors=[0x67f2e3,0xff98cc,0xffcf5f];
        for(const lane of [-1,0,1])launch(a,'bolt',dir,Math.max(58,k.speed+28),{
          vx:dir*(Math.sin(k.yaw)*15+lane*10),tint:colors[lane+1],tagged,duration:1.7
        });
        break;
      }
      case 12:
        launch(a,'lob',1,k.speed+19,{vy:10+k.vy*.3,height:shotHeight(k,k.s+2.8,1.3)});
        break;
      case 13:
        launch(a,'ring',1,k.speed+37,{tagged:new Set(),duration:4.2});
        break;
      case 14:
        add('puck',a,k.s-3.8,k.x,18,itemModel('puck'),{height:.28});
        break;
      case 15: {
        const existing=objects.find(o=>o.type==='broom'&&o.owner===a&&o.life>0);
        if(existing)existing.life=2.8;
        else add('broom',a,k.s,k.x,2.8,itemModel('broom'),{height:k.y+1.4});
        break;
      }
      case 16:
        if(!springJump(k)){notify(a,'LAND TO USE SPRINGS');return false;}
        flourish(a,'spring');break;
      case 17: {
        const target=nearestAhead(a,pack,55,(_,other,d,rival)=>Math.abs(other.x-k.x)<10 &&
          Math.abs(other.y-k.y)<5 && rival.boost.reserve>.15);
        flourish(a,'siphon');
        if(!target){message='SIPHON MISSED';break;}
        add('beam',a,k.s,k.x,.40,mesh('tether',0x59fff0),{target});
        if(state(target).shield>0){dropShield(target);notify(target,'SHIELD BLOCK');break;}
        const stolen=Math.min(1.5,target.boost.reserve);
        target.boost.reserve-=stolen;
        if(target.boost.reserve<=0)target.boost.tier=0;
        grantBoost(a.boost,stolen);
        notify(target,'SODA SIPHONED');break;
      }
      case 18: {
        const local=pack.filter(b=>b!==a&&b.finish==null&&b.kart.s>k.s&&b.kart.s-k.s<=240);
        const target=local.reduce((best,b)=>!best||b.kart.s>best.kart.s?b:best,null);
        launch(a,'rocket',1,k.speed+34,{target,duration:7});
        if(target)notify(target,'RELAY INCOMING');
        else message='ROCKET FIRED · NO LOCK';
        break;
      }
      case 19:
        grantBoost(a.boost,2.6,2);shield(a,3);flourish(a,'comet');break;
    }
    if(!a.unlimited && (index!==8 || a.charges===0)) {
      a.held=null;
      a.charges=0;
    } else if(index===8 && a.unlimited && a.charges===0) a.charges=3;
    notify(a,message);
    return true;
  }
  function decide(a,player,dt) {
    const k=a.kart,b=a.boost,s=state(a),input=blankInput();
    s.itemCooldown-=dt;
    s.aiRest=Math.max(0,s.aiRest-dt);
    const look=track.sample(k.s+5+k.speed*.20,k.x);
    const here=track.sample(k.s,k.x);
    const curvature=here.curvature*.65+look.curvature*.35;
    const id=a.id || 1;
    let lane=clamp(Math.sin(k.s/128+id*2.1)*2.2+(id-3)*1.3,-7,7);
    // Aim toward geometric rewards early enough to take a natural line.
    let nearestFeature=65;
    const targets=a.held==null && !a.roulette ? rewards : track.pads;
    for(const target of targets) {
      if(target.hidden) continue;
      const d=deltaS(k.s,target.s);
      if(d<0||d>nearestFeature) continue;
      if(d===nearestFeature && Math.abs(target.x-lane)>Math.abs(s.aiGoalX-lane)) continue;
      nearestFeature=d;
      s.aiGoalX=target.x;
    }
    if(nearestFeature<65) lane=THREE.MathUtils.lerp(lane,s.aiGoalX,1-nearestFeature/80);
    for(const h of track.hazards || []) {
      const d=deltaS(k.s,h.s);
      if(h.active===false || d<0 || d>40 || Math.abs(lane-h.x)>h.width/2+1.4) continue;
      lane=h.x+(lane>=h.x?1:-1)*(h.width/2+2);
    }
    for(const other of actors) {
      if(other===a) continue;
      const d=deltaS(k.s,other.kart.s);
      if(d>0&&d<11&&Math.abs(k.x-other.kart.x)<2.8) {
        lane=other.kart.x+(k.x>=other.kart.x?1:-1)*3.1;
        break;
      }
    }
    lane=clamp(lane,-here.width*.34,here.width*.34);
    s.aiLane=THREE.MathUtils.damp(s.aiLane,lane,2.8,dt);
    const headingError=Math.atan2(Math.sin(k.travelYaw),Math.cos(k.travelYaw));
    const steerCorrection=clamp((s.aiLane-k.x)*.15-headingError*2.6,-1,1);
    const feed=curvature*k.speed*Math.cos(k.travelYaw) / clamp(1-curvature*k.x,.55,1.65);
    const turn=Math.sign(curvature);
    if(s.aiDirection && ((turn!==s.aiDirection && Math.abs(curvature)>.006)
        || Math.abs(curvature)<.0035 || b.chainClosed || (k.grounded&&!k.sliding && !k.pendingDrift))) {
      s.aiDirection=0;
      s.aiRest=.24;
    }
    input.steer=steerForTurn(k,feed+steerCorrection);
    if(!s.aiDirection && s.aiRest===0 && k.grounded && !k.sliding && k.speed>16
        && Math.abs(curvature)>.008 && input.steer*turn>.15) {
      s.aiDirection=turn;
      input.driftPressed=true;
    }
    if(s.aiDirection){
      input.driftHeld=!(k.sliding && !b.chainClosed && b.meter>=.77+(id%3)*.066);
    }
    if(s.box>0 && k.grounded && !s.wasJumpRequested) {
      input.driftPressed=true; input.driftHeld=true;
      s.wasJumpRequested=true;
    } else s.wasJumpRequested=false;
    if(Math.abs(curvature)*k.speed>1.7 && Math.abs(k.x)>here.width*.29) {
      input.throttle=.68; input.brake=.15;
    }
    // A marked rival can spend a defensive item before its normal attack interval.
    const defend=a.incoming && (a.held===15 || (!a.shield && (a.held===2 || a.held===19)));
    if(a.held!=null && (s.itemCooldown<=0 || defend)) {
      input.itemPressed=true;
      if([1,10,11].includes(a.held)){
        const front=nearestAhead(a,actors,60);
        input.itemBackward=actors.some(b=>b!==a && b.finish==null &&
          deltaS(b.kart.s,k.s)>0 && deltaS(b.kart.s,k.s)<(front?12:40) && Math.abs(b.kart.x-k.x)<5);
      }
      s.itemCooldown=1.2+(id%3)*.7;
    }
    if(a.car==='barrage')input.blasters=!!nearestAhead(a,actors,30,(k,other,d)=>Math.abs(other.x-k.x-Math.sin(k.yaw)*d)<1.2);
    return input;
  }

  function updateActor(a,pack,dt) {
    const s=state(a),k=a.kart;
    a.noticeTime=Math.max(0,(a.noticeTime||0)-dt);
    s.invincible=Math.max(0,s.invincible-dt);
    k.stunRemaining=Math.max(0,k.stunRemaining-dt);
    s.shield=Math.max(0,s.shield-dt);
    a.shield=s.shield;
    if(!s.shield && s.bubble)dropShield(a);
    if(s.slip>0) {
      s.slip-=dt;
      if(k.grounded) k.travelYaw+=s.slipDirection*.31*Math.min(1,s.slip+.05)*dt;
    }
    if(s.box>0) {
      if(s.wasGrounded && !k.grounded) s.hops++;
      if(s.hops>=2) {
        s.box=0;
        notify(a,'BOX SHAKEN OFF');
      } else if((s.box-=dt)<=0) {
        hit(a,'pop',k.x);
        pulse(a,0xff885e,3.5);
      }
    }
    s.wasGrounded=k.grounded;
    s.draftRest=Math.max(0,s.draftRest-dt);
    if(k.stunRemaining>0)return;
    const target=nearestAhead(a,pack,20);
    const aligned=target && Math.abs(target.kart.x-k.x)<2.5
      && Math.abs(target.kart.y-k.y)<2.3 && k.speed>12 && target.kart.speed>10;
    if(aligned&&!s.draftRest) {
      s.draft=Math.min(1,s.draft+.68*dt);
      s.draftTarget=target;
    } else if(s.draft>.70 && s.draftTarget && !s.draftRest &&
      Math.abs(deltaS(k.s,s.draftTarget.kart.s))<20 && (Math.abs(k.x-s.draftTarget.kart.x)>=2.5 || deltaS(k.s,s.draftTarget.kart.s)<=0)) {
      grantBoost(a.boost,.8);
      s.draft=0; s.draftRest=1.8;
      notify(a,'SLIPSTREAM');
    } else {
      s.draft=Math.max(0,s.draft-.38*dt);
    }
    a.draft=s.draft;
  }
  function moveProjectile(o,dt){
    const k=o.owner.kart;
    if(o.target || o.type==='ring' && elapsed-o.born>.78){
      const target=o.target?.kart??k;
      const ds=deltaS(o.s,target.s);
      const closing=o.type==='rocket'?47:o.type==='ring'?38:23;
      o.v=THREE.MathUtils.damp(o.v,Math.max(42,target.speed+closing),4,dt);
      o.s+=Math.sign(ds)*Math.min(Math.abs(ds),o.v*dt);
      o.x=THREE.MathUtils.damp(o.x,target.x,o.type==='cursor'?3.8:6,dt);
      const floor=point(o.s,o.x);
      o.height=Math.max(.65,THREE.MathUtils.damp(o.y0,point(target.s,target.x,target.y+.95).y,5,dt)-floor.y);
      if(o.type==='ring' && Math.abs(ds)<2 && Math.abs(o.x-k.x)<2)o.ends=true;
    }else{
      o.s+=o.v*dt;
      o.x+=o.vx*dt;
      const edge=track.widthAt(o.s)/2-(o.type==='disc'?1:.8);
      if(Math.abs(o.x)>edge){
        if(track.dropAt?.(o.s,Math.sign(o.x))){o.life=0;return;}
        if(o.remainingBounces>0){
          const side=Math.sign(o.x);
          o.x=side*(2*edge-Math.abs(o.x));
          o.vx=-side*Math.abs(o.vx);o.remainingBounces--;
        }else{
          o.x=clamp(o.x,-edge,edge);o.ends=true;
        }
      }
      if(o.vy!=null){
        const floor=point(o.s,o.x);
        const clearance=o.type==='lob'?.57:.83;
        const height=o.y0+o.vy*dt-.5*GRAVITY*dt*dt-floor.y;
        o.height=Math.max(clearance,height);
        o.vy=height<=clearance?null:o.vy-GRAVITY*dt;
        if(o.type==='lob' && height<=clearance)o.ends=true;
      }
    }
    const road=track.sample(o.s,o.x);
    o.y=road.position.y+o.height;
    o.model.position.copy(road.position);o.model.position.y=o.y;
    if(o.type==='ball'){o.model.rotation.x+=o.v*dt;return;}
    if(o.type==='disc'||o.type==='ring'){o.model.rotation.y+=dt*10;o.model.rotation.z=.14;return;}
    if(o.type==='lob'){o.model.rotation.z+=dt*4;return;}
    const ds=deltaS(o.s0,o.s), dx=o.x-o.x0;
    const trail=o.model.userData.trail;
    if(trail)trail.scale.z=(o.type==='rocket'?3.3:2.1)+.30*Math.sin((elapsed-o.born)*35);
    const x=road.forward.x*ds+road.right.x*dx,z=road.forward.z*ds+road.right.z*dx;
    if(Math.abs(ds)+Math.abs(dx)>.001){
      o.model.rotation.order='YXZ';
      o.model.rotation.y=Math.atan2(x,z);
      o.model.rotation.x=-Math.atan2(o.y-o.y0,Math.hypot(x,z));
    }
  }

  function tether(o){
    const k=o.owner.kart,t=o.target.kart;
    const a=point(k.s,k.x,k.y+.86),b=point(t.s,t.x,t.y+.86);
    const vec=b.clone().sub(a);
    o.model.position.copy(a).lerp(b,.5);
    o.model.scale.y=vec.length();
    o.model.quaternion.setFromUnitVectors(up,vec.normalize());
  }

  function updateObjects(dt,pack){
    const actorPaths=new Map();
    for(const a of pack){
      const {s,x,y}=a.kart,road=track.sample(s,x),worldY=road.position.y+y+.8,st=state(a),prev=st.lastPosition;
      const roadScale=Math.max(.55,Math.min(1.65,1-x*road.curvature));
      actorPaths.set(a,{s,x,y:worldY,roadScale,s0:prev?.s??s,x0:prev?.x??x,y0:prev?.y??worldY});
      st.lastPosition={s,x,y:worldY,roadScale,s0:s,x0:x,y0:worldY};
    }
    const events=[],brooms=[];
    // Move everything before checking impacts so two shots crossing in a tick
    // meet at the same time, independent of their insertion order.
    for(const o of objects){
      if((o.life-=dt)<=0)continue;
      const k=o.owner.kart,st=state(o.owner);
      o.s0=o.s;o.x0=o.x;o.y=o.y0=o.model.position.y;
      if(flying.has(o.type)){moveProjectile(o,dt);continue;}
      switch(o.type){
        case 'attached':
          if(st.box<=0)o.life=0;
          else{place(o.model,k.s,k.x,2.9+k.y+Math.sin(elapsed*18)*.12);o.model.rotation.y=elapsed*2;}
          break;
        case 'shield':
          if(!st.shield)o.life=0;
          else{place(o.model,k.s,k.x,.96+k.y);o.model.rotation.y=elapsed;}
          break;
        case 'cable':
          if(o.owner.boost.interrupted || k.stunRemaining>0 || !towInReach(k,o.target.kart,deltaS(k.s,o.target.kart.s))){o.life=0;break;}
          grantBoost(o.owner.boost,dt*1.3);
          k.speed+=Math.min(4,Math.max(0,o.target.kart.speed+3-k.speed))*dt;
          tether(o);break;
        case 'beam':tether(o);break;
        case 'pulse':o.model.scale.setScalar(Math.max(.1,o.radius*(1-o.life/.34)));break;
        case 'flair':
          place(o.model,k.s-1.9,k.x,k.y+2.3+(.48-o.life)*2);
          o.model.rotation.y=elapsed*5;o.model.scale.setScalar(Math.min(.66,o.life*3));break;
        case 'broom':
          brooms.push(o.owner);
          place(o.model,k.s+Math.sin(elapsed*6)*1.8,k.x+Math.cos(elapsed*6)*1.8,k.y+1.35);
          o.model.rotation.y=elapsed*6;break;
        case 'puck':
          o.model.rotation.y=elapsed*(elapsed-o.born>.45?4:.6);break;
        case 'strip':
          for(const a of pack)if(!a.kart.stunRemaining&&!o.used.has(a)&&a.kart.y<1.1&&
            Math.abs(deltaS(o.s,a.kart.s))<2.5&&Math.abs(a.kart.x-o.x)<2.2){
            o.used.add(a);grantBoost(a.boost,.6);
          }
          break;
      }
    }

    function queue(time,kind,o,target){
      if(Number.isFinite(time))events.push({time,kind,o,target});
    }
    for(const o of objects){
      if(o.life<=0||(!flying.has(o.type)&&!traps.has(o.type)))continue;
      for(const a of brooms)if(o.owner!==a){
        queue(contactTime(o,actorPaths.get(a),7,6,4,track.length),'clear',o);
      }
      if(o.type==='puck' && elapsed-o.born<.45)continue;
      for(const a of pack){
        if(a===o.owner||a.finish!=null||o.tagged?.has(a)||(o.target&&a!==o.target))continue;
        // A shot fired after the karts moved cannot hit their earlier positions.
        const path=o.born===elapsed?state(a).lastPosition:actorPaths.get(a),reach=o.type==='puck'?4.2:0;
        if(!reach && hasShapedBody(a.kart)){
          const padX=o.type==='slip'?1.10:.40;
          queue(shapedItemContactTime(o,path,a.kart,padX,track.length),'kart',o,a);
        }else{
          queue(contactTime(o,path,reach||2.45,reach||(o.type==='slip'?2.35:1.65),reach||1.5,track.length),'kart',o,a);
        }
      }
      if(!flying.has(o.type))continue;
      for(const h of track.hazards){
        if(h.active===false||Math.abs(deltaS(o.s,h.s))>h.depth/2+Math.abs(o.s-o.s0)+2)continue;
        const y=point(h.s,h.x).y+h.height/2;
        const barrier={s:h.s,s0:h.s,x:h.x,x0:h.x,y,y0:y};
        queue(contactTime(o,barrier,h.depth/2+.4,h.width/2+.4,h.height/2+.4,track.length),'barrier',o);
      }
      if(o.type==='ball'||o.type==='disc')for(const other of objects){
        if(other.owner===o.owner||other.life<=0||!(traps.has(other.type)||other.type==='cursor'||other.type==='rocket'))continue;
        queue(contactTime(o,other,2.15,1.8,1.35,track.length),'intercept',o,other);
      }
      if(o.ends)queue(1,'end',o);
    }
    events.sort((a,b)=>a.time-b.time);
    for(const {time,kind,o,target} of events){
      if(o.life<=0)continue;
      const s=o.s0+deltaS(o.s0,o.s)*time,x=o.x0+(o.x-o.x0)*time;
      const height=Math.max(.12,o.y0+(o.y-o.y0)*time-point(s,x).y);
      if(kind==='clear'){o.life=0;pulseAt(o.owner,s,x,height,0x9ff4da,2);continue;}
      if(kind==='intercept'){
        if(target.life<=0)continue;
        target.life=0;o.life=0;pulseAt(o.owner,s,x,height,0xffe8be,2.2);continue;
      }
      if(o.type==='lob'||o.type==='puck'){
        blast(o.owner,s,x,height,o.type==='lob'?7:6.5,o.type==='lob'?0xa6ed48:0xc8a1ff,o.type,pack,kind==='kart'?target:null);
      }else if(kind==='kart'){
        if(o.tagged?.has(target))continue;
        if(!hit(target,o.type,x))continue;
        o.tagged?.add(target);
        if(flying.has(o.type))pulseAt(o.owner,s,x,height,0xffdb9c,1.65);
        if(o.type==='ring')continue;
      }else if(kind==='barrier')pulseAt(o.owner,s,x,height,0xffdb9c,1.65);
      o.life=0;
    }
    for(let i=objects.length-1;i>=0;i--){
      const o=objects[i];
      if(o.life<=0 || (o.type==='cable' && o.owner.boost.interrupted))remove(i);
    }
    for(const a of pack)a.incoming='';
    for(const o of objects){
      if(!o.target)continue;
      if(o.type==='rocket')o.target.incoming='RELAY INCOMING';
      else if(o.type==='cursor'&&!o.target.incoming)o.target.incoming='CURSOR INCOMING';
    }
  }
  const up=new THREE.Vector3(0,1,0);
  function update(dt,pack,afterContacts) {
    actors=pack.filter(a=>!a.kart.fall);
    elapsed+=dt;
    resolveKartContacts(track,actors);
    afterContacts?.();
    actors.forEach(a=>updateActor(a,actors,dt));
    updateObjects(dt,actors);
    for(const a of actors)a.boost.interrupted=false;
  }
  function hitHazard(a,type) {
    const label=type==='rollingDrum'?'DRUM HIT':type==='loadingDoor'?'DOOR HIT':'OBSTACLE HIT';
    const shield=state(a).shield;
    if(hit(a,'obstacle',a.kart.x) && shield===0) notify(a,label);
    return true;
  }
  function setTrack(next){
    reset();track=next;rewards=[...track.pads,...track.pickups];
  }
  return {setTrack,reset,withdraw,use,fireBlasters,update,decide,hitHazard};
}
