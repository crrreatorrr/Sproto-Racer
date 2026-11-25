import {skipperAxles,skipperHalfTrack} from './skipper-layout.js';
import {cartAxles,cartHalfTrack} from './shopping-cart-layout.js';
import {mantaAxles,mantaHalfTrack} from './manta-layout.js';
import {crestlineAxles,crestlineHalfTrack} from './crestline-layout.js';
import {ironhideAxles,ironhideHalfTrack} from './ironhide-layout.js';
import {geepAxles,geepScale,geepHalfTrack} from './geep-layout.js';
import {barrageAxles,barrageHalfTrack} from './barrage-layout.js';
import {hasShapedBody,isGeep,kartFootprint,footprintBox,footprintContact} from './kart-footprint.js';
import {ITEMS} from './items.js';
import {racerSetup} from './roster.js';
import {createKart,stepKart,launchFromRamp,CRUISE_SPEED,HALF_KART_WIDTH,HALF_KART_LENGTH,KART_CONTACT_HEIGHT} from './driving.js';
import {createBoost,stepBoost,grantBoost,updateRevs,gradeLaunch} from './boost.js';

export const DEFAULT_TEST={sector:0,speed:'standstill',rivals:'solo',item:0,lap:1,hazards:true};
const mod=(n,m)=>((n%m)+m)%m;
export const timeText=(n)=>{const ms=Math.max(0,Math.floor(n*1000));return String(Math.floor(ms/60000)).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');};

export function createSession(track,play,fx){
  const ghostKey='sproto.'+(track.id??'track01')+'.ghost.v1';
  const state={mode:'race',actors:[],player:null,elapsed:0,countdown:0,lap:1,sector:0,done:false,split:'',splitUntil:0};
  let settings={...DEFAULT_TEST},rec=[],best=null,nextSample=0,ghostCursor=0,beep=3;
  try {
    const g=JSON.parse(localStorage.getItem(ghostKey));
    if (g?.length===track.length && Number.isFinite(g.time) && g.time>0 &&
        Array.isArray(g.frames) && g.frames.length>=2 &&
        g.frames.every((f,i)=>Array.isArray(f) && f.length===5 && f.every(Number.isFinite) &&
          (i===0 || f[0]>g.frames[i-1][0]))) best=g;
  } catch {}
  const heightAt=(s,x)=>track.sample(s,x).position.y;
  function make(id,s,x,entrySpeed){
    const {car,driver}=racerSetup(id,settings);
    return {id,car:car.id,driver:driver.id,isPlayer:!id,kart:{...createKart(car),s,x,speed:entrySpeed*car.speed},
      boost:createBoost(),held:null,charges:0,unlimited:!id&&state.mode==='test',finish:null,
      hazardCooldown:0,touchingHazards:new Set()};
  }
  function start(mode,options={}) {
    settings={...DEFAULT_TEST,...options};Object.assign(state,{mode,elapsed:0,split:'',splitUntil:0,done:false});
    const test=mode==='test';
    const base=test?track.sections[settings.sector].start+(settings.lap-1)*track.length:0;
    const speed=test?(CRUISE_SPEED*({standstill:0,cruise:1,turbo:1.2,super:1.4}[settings.speed]??0)):0;
    const race=mode==='race';
    const playerSlot=race?track.grid[5]:{s:base,x:0};
    state.player=make(0,playerSlot.s,playerSlot.x,speed);
    state.actors=[state.player];
    if(race){
      track.grid.slice(0,5).forEach(({s,x},i)=>state.actors.push(make(i+1,s,x,speed)));
    }else if(test){
      const offsets={pack:[[0,3],[8,-2.6],[8,3],[14,-2.6],[14,3]],ahead:[[12,0]],behind:[[-12,0]],alongside:[[0,3.25]]};
      (offsets[settings.rivals]??[]).forEach(([d,x],i)=>state.actors.push(make(i+1,base+d,x,speed)));
    }
    if(test){state.player.inventoryCharges=ITEMS.map(item=>item.charges??1);select(settings.item);for(const a of state.actors)if(['turbo','super'].includes(settings.speed))grantBoost(a.boost,5,settings.speed==='super'?2:1);}
    for(const a of state.actors){a.splitStart=0;a.pickupDistance=-Infinity;}
    play.reset();fx.reset();track.reset();
    for(const p of track.pickups){p.hidden=mode==='trial';p.readyAt=Infinity;}
    state.countdown=test&&!(settings.sector===0&&speed===0)?0:3;
    beep=3;rec=[];nextSample=0;ghostCursor=0;state.sector=test?settings.sector:0;state.lap=test?settings.lap:1;
    track.update(0,0,base,state.lap);
    return state;
  }
  function select(index) {
    if(state.mode!=='test')return;
    const a=state.player;index=mod(index,ITEMS.length);
    if(a.held!==index){
      if(a.held!==null)a.inventoryCharges[a.held]=a.charges;
      a.held=index;a.charges=a.inventoryCharges[index];
    }
    settings.item=index;
  }
  function useItem(a,backwards=false) {
    if(a.held==null)return;
    return play.use(a,a.held,state.actors,backwards);
  }
  function overlapsHazard(k,h) {
    const ds=mod(k.s-h.s+track.length/2,track.length)-track.length/2;
    if(hasShapedBody(k)){
      if(Math.abs(ds)>(h.depth/2+2.7)/.55 || Math.abs(k.x-h.x)>h.width/2+2.7)return false;
      const road=track.sample(k.s,k.x);
      const bottom=k.y+road.position.y-heightAt(h.s,h.x);
      if(bottom>=h.height)return false;
      const shape=kartFootprint(k);
      const along=ds*Math.max(.55,Math.min(1.65,1-(k.x+h.x)*.5*road.curvature));
      function hits(hull,low,high){
        if(low>=h.height || high<=0)return false;
        let width=h.width/2;
        if(h.type==='rollingDrum'){
          const r=h.height/2,dy=Math.max(0,low-r,r-high);
          width=Math.sqrt(Math.max(0,r*r-dy*dy));
        }
        return !!footprintContact(hull,footprintBox(h.depth/2,width),-along,h.x-k.x);
      }
      return shape.bands.some(({hull,low,high})=>hits(hull,bottom+low,bottom+high));
    }
    if(Math.abs(ds)>HALF_KART_LENGTH+h.depth/2)return false;
    const dx=Math.max(0,Math.abs(k.x-h.x)-HALF_KART_WIDTH);
    if(dx>h.width/2)return false;
    const bottom=k.y+heightAt(k.s,k.x)-heightAt(h.s,h.x);
    if(h.type==='rollingDrum'){
      const radius=h.height/2;
      const dy=Math.max(0,bottom-radius,radius-(bottom+KART_CONTACT_HEIGHT));
      return dx*dx+dy*dy<=radius*radius;
    }
    return bottom<h.height && bottom+KART_CONTACT_HEIGHT>0;
  }
  function features(a,oldS,dt) {
    const k=a.kart,dist=k.s-oldS;
    a.hazardCooldown=Math.max(0,a.hazardCooldown-dt);
    if(state.mode!=='test'||settings.hazards)for(const h of track.hazards){
      if(h.active===false || !overlapsHazard(k,h)){
        a.touchingHazards.delete(h);
      }else if(!a.touchingHazards.has(h)){
        a.touchingHazards.add(h);
        if(!a.hazardCooldown){
          play.hitHazard(a,h.type);
          a.hazardCooldown=1.2;
        }
      }
    }
    if(dist<=0)return;
    const cross=o=>{
      const offset=mod(o.s-oldS,track.length);
      return offset>0 && offset<=dist && Math.abs(k.x-o.x)<(o.width??3.2)/2+.45;
    };
    for(const p of track.pads)if(!k.stunRemaining&&cross(p)&&k.y<1.4)grantBoost(a.boost,p.tier===2?2.2:1.35,p.tier);
    if(state.mode!=='trial' && a.finish==null && (a.held==null || a.unlimited))for(const p of track.pickups)if(!p.hidden&&cross(p)&&k.y<2.5){
      if(!a.unlimited)play.drawItem(a,state.actors);
      p.hidden=true;p.readyAt=state.elapsed+1.8;break;
    }
    if(track.switchTrigger&&cross(track.switchTrigger))track.triggerSwitch();
  }
  function crossedRamp(startS,startX,endS,endX){
    const distance=endS-startS;
    if(distance<=0)return 0;
    for(const ramp of track.ramps){
      const offset=mod(ramp.s-startS,track.length);
      if(offset<=0||offset>distance)continue;
      const x=startX+(endX-startX)*offset/distance;
      if(Math.abs(x-ramp.x)<ramp.width/2)return ramp.power;
    }
    return 0;
  }
  function drive(a,controls,dt) {
    const k=a.kart,old=k.s,road=track.sample(old,k.x);
    road.heightAt=heightAt;
    road.widthAt=track.widthAt;road.edgeAt=track.edgeAt;road.dropAt=track.dropAt;road.length=track.length;
    const wasFalling=!!k.fall;
    road.dropAt=track.dropAt;road.length=track.length;
    if(k.grounded){
      // Use the wheel contact heights on banked lanes and ramps. The centerline
      // tangent alone leaves the outside wheels buried on the half-pipe.
      const geep=isGeep(k),barrage=k.tuning?.id==='barrage';
      const ironhide=k.tuning?.id==='ironhide',crestline=k.tuning?.id==='crestline';
      const manta=k.tuning?.id==='manta',skipper=k.tuning?.id==='skipper';
      const cart=k.tuning?.id==='shopping-cart';
      const halfTrack=cart?cartHalfTrack:skipper?skipperHalfTrack:manta?mantaHalfTrack:crestline?crestlineHalfTrack:ironhide?ironhideHalfTrack:geep?geepHalfTrack*geepScale:barrage?barrageHalfTrack:.8;
      road.bank=Math.atan2(heightAt(old,k.x+halfTrack)-heightAt(old,k.x-halfTrack),2*halfTrack);
      const front=cart?-cartAxles[0][0]:skipper?-skipperAxles[0][0]:manta?-mantaAxles[0][0]:crestline?-crestlineAxles[0][0]:ironhide?-ironhideAxles[0][0]:geep?-geepAxles[0][0]*geepScale:barrage?-barrageAxles[0][0]:1.1;
      const rear=cart?cartAxles[1][0]:skipper?skipperAxles[1][0]:manta?mantaAxles[1][0]:crestline?crestlineAxles[1][0]:ironhide?ironhideAxles[1][0]:geep?geepAxles[1][0]*geepScale:barrage?barrageAxles[1][0]:1.1;
      const rise=heightAt(old+front,k.x)-heightAt(old-rear,k.x);
      road.grade=rise/((front+rear)*Math.max(.55,1-k.x*road.curvature));
    }
    road.crossedRamp=crossedRamp;
    const oldPips=a.boost.pips;
    stepKart(k,controls,road,a.boost,dt);
    if(k.fall && !wasFalling){
      Object.assign(a.boost,createBoost());
      play.withdraw(a);
    }
    if(wasFalling || k.fall)return {a,recovering:true};
    stepBoost(a.boost,k,controls,dt);
    if(a.isPlayer&&a.boost.pips>oldPips)fx.tone('boost');
    return {a,controls,old,s:k.s,x:k.x};
  }
  function recordGhost() {
    if(state.mode!=='trial'||(state.elapsed<nextSample&&state.player.finish===null))return;
    const {s,x,y,yaw,rescues}=state.player.kart;
    rec.push([state.elapsed,s,x,y,yaw,rescues].map(v=>Math.round(v*1000)/1000));nextSample=state.elapsed+.095;
  }
  function ghost() {
    if(state.mode!=='trial'||!best||state.elapsed>best.time)return null;
    const frames=best.frames;
    while(ghostCursor<frames.length-2&&frames[ghostCursor+1][0]<state.elapsed)ghostCursor++;
    const a=frames[ghostCursor],b=frames[ghostCursor+1],f=(a[5]??0)!==(b[5]??0)?0:Math.max(0,Math.min(1,(state.elapsed-a[0])/(b[0]-a[0]||1)));
    return {s:a[1]+(b[1]-a[1])*f,x:a[2]+(b[2]-a[2])*f,y:a[3]+(b[3]-a[3])*f,yaw:a[4]+(b[4]-a[4])*f,speed:0};
  }
  function tick(input,dt) {
    if(state.done)return;
    if(state.mode==='test'){
      if(input.slot!==null&&input.slot!==undefined)select(input.slot);
      else if(input.prevPressed)select(state.player.held-1);else if(input.nextPressed)select(state.player.held+1);
    }
    if(state.countdown>0){
      updateRevs(state.player.boost,input.throttle,dt);
      for(const a of state.actors.slice(1))updateRevs(a.boost,state.countdown<.52+a.id*.027?1:0,dt);
      state.countdown=state.countdown<=dt+1e-9?0:state.countdown-dt;
      if(Math.ceil(state.countdown)<beep){beep=Math.ceil(state.countdown);fx.tone(beep?'count':'go');}
      if(state.countdown===0)for(const a of state.actors)gradeLaunch(a.boost);
      return;
    }
    state.elapsed+=dt;
    for(const p of track.pickups)if(p.hidden&&state.elapsed>=p.readyAt)p.hidden=false;
    track.update(state.elapsed,dt,state.player.kart.s,state.lap);
    const moves=state.actors.map(a=>drive(a,a.isPlayer?input:a.kart.fall?{}:play.decide(a,state.player,dt),dt));
    play.update(dt,state.actors,()=>{
      for(const {a,controls,old,s,x,recovering} of moves){
        if(recovering)continue;
        const k=a.kart;
        if(k.s>s && k.grounded){
          const ramp=crossedRamp(s,x,k.s,k.x);
          if(ramp)launchFromRamp(k,ramp,controls,controls.steer||0);
        }
        if(a.isPlayer && (k.kartImpact>3 || k.wallImpact>.15))fx.tone('bump');
        features(a,old,dt);
        if(a.car==='barrage' && state.mode!=='trial' && (controls.blasters || controls.blastersPressed))play.fireBlasters(a);
        if(controls.itemPressed&&state.mode!=='trial')useItem(a,controls.itemBackward??(controls.brake>.25||controls.reverse>.5));
        const line=track.length*3;
        if(state.mode!=='test' && a.finish===null && old<line && k.s>=line)
          a.finish=state.elapsed-dt*(k.s-line)/(k.s-old);
      }
    });
    const k=state.player.kart,raceS=k.fall?.exitS??k.s,f=track.sample(raceS,k.x);
    state.lap=state.mode==='test'?1+mod(Math.floor(raceS/track.length),3):Math.max(1,Math.min(3,Math.floor(raceS/track.length)+1));
    if((state.mode==='test'||k.s>=0)&&f.section!==state.sector){
      state.split='S'+String(state.sector+1).padStart(2,'0')+'   '+timeText(state.elapsed-state.player.splitStart);
      state.player.splitStart=state.elapsed;state.splitUntil=state.elapsed+2.2;state.sector=f.section;
    }
    recordGhost();
    if(state.player.finish!==null){
      state.done=true;
      if(state.mode==='trial'&&(!best||best.time>state.elapsed)){
        best={time:state.elapsed,length:track.length,car:state.player.car,driver:state.player.driver,frames:rec};
        try{localStorage.setItem(ghostKey,JSON.stringify(best));}catch{}
      }
    }
  }
  function position(){return 1+state.actors.filter(a=>a!==state.player&&(a.finish!==null?(state.player.finish===null||a.finish<state.player.finish):(a.kart.fall?.exitS??a.kart.s)>=(state.player.kart.fall?.exitS??state.player.kart.s))).length;}
  return {state,start,tick,select,useItem,ghost,position,get ghostSetup(){return {car:best?.car,driver:best?.driver}},get settings(){return {...settings}},get best(){return best?.time??null}};
}
