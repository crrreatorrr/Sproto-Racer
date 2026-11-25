import * as THREE from 'three';

const MARKS = 560;
const PARTICLES = 180;
const clamp = THREE.MathUtils.clamp;

function createMotor() {
  let context, master, engine, bass, reed, filter;
  let muted = false, audioClock = 0;
  const lastTone = new Map();
  const cues = {
    count:[435,.10,'sine',.13], go:[820,.23,'triangle',.16],
    boost:[330,.12,'triangle',.10], click:[660,.045,'sine',.08], bump:[96,.085,'triangle',.24],
  };
  function unlock() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = muted ? 0 : .34;
        master.connect(context.destination);
        engine = context.createGain();
        engine.gain.value = 0;
        filter = context.createBiquadFilter();
        filter.type = 'lowpass'; filter.Q.value = .55;
        filter.frequency.value = 300;
        filter.connect(engine); engine.connect(master);
        bass = context.createOscillator(); reed = context.createOscillator();
        bass.type = 'triangle'; reed.type = 'sawtooth';
        bass.frequency.value = 43; reed.frequency.value = 86;
        const harmonic = context.createGain();
        harmonic.gain.value = .18;
        bass.connect(filter); reed.connect(harmonic); harmonic.connect(filter);
        bass.start(); reed.start();
      }
      if (context.state === 'suspended') context.resume().catch(()=>{});
    } catch { /* Browser audio may be unavailable on a remote desktop. */ }
  }
  function pause() {
    if (engine) engine.gain.setTargetAtTime(0,context.currentTime,.025);
    audioClock = 0;
  }
  function mute(value) {
    muted = Boolean(value);
    if (master) master.gain.setTargetAtTime(muted ? 0 : .34,context.currentTime,.018);
  }
  function update(dt,actor,revving) {
    if (!actor || !engine || context.state !== 'running') return;
    audioClock -= dt;
    if (audioClock > 0) return;
    audioClock = .045;
    const speed=clamp(actor.kart.speed,0,65), tier=actor.boost.tier;
    const gear=Math.min(4,Math.floor(speed/9));
    const rpm=revving ? 44+actor.boost.rev*65 : 44+gear*6+(speed-gear*9)*2.6+tier*5;
    const now=context.currentTime;
    bass.frequency.setTargetAtTime(rpm,now,.065);
    reed.frequency.setTargetAtTime(rpm*2.013,now,.07);
    filter.frequency.setTargetAtTime(185+speed*9+tier*95,now,.08);
    engine.gain.setTargetAtTime(.045+speed*.0012+tier*.005,now,.045);
  }
  function tone(name) {
    if (muted || !context || context.state!=='running' || !cues[name]) return;
    const now=context.currentTime;
    if (now-(lastTone.get(name)??-1)<.055) return;
    lastTone.set(name,now);
    const [pitch,duration,type,volume]=cues[name];
    const osc=context.createOscillator(), env=context.createGain();
    osc.type=type; osc.frequency.setValueAtTime(pitch,now);
    if(name==='boost') osc.frequency.exponentialRampToValueAtTime(pitch*1.65,now+duration);
    if(name==='bump') osc.frequency.exponentialRampToValueAtTime(40,now+duration);
    env.gain.setValueAtTime(.0001,now);
    env.gain.exponentialRampToValueAtTime(volume,now+.009);
    env.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(env); env.connect(master);
    osc.onended=()=>{osc.disconnect();env.disconnect();};
    osc.start(now);osc.stop(now+duration+.01);
  }
  return {unlock,pause,mute,update,tone};
}

export function createRaceFX(scene,track) {
  const motor=createMotor();
  const group=new THREE.Group();
  const vertices=new Float32Array(MARKS*12), ages=new Float32Array(MARKS);
  const positions=new THREE.BufferAttribute(vertices,3).setUsage(THREE.DynamicDrawUsage);
  const geometry=new THREE.BufferGeometry();
  const indices=new Uint16Array(MARKS*6);
  for(let i=0;i<MARKS;i++) {
    const v=i*4;
    indices.set([v,v+1,v+2,v+2,v+1,v+3],i*6);
  }
  geometry.setAttribute('position',positions);
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  const skid=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({
    color:0x1b2830, transparent:true, opacity:.39, depthWrite:false,
    side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-1,polygonOffsetUnits:-2,
  }));
  skid.frustumCulled=false;skid.renderOrder=1;
  const dust=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),
    new THREE.MeshBasicMaterial({transparent:true,opacity:.63,depthWrite:false}),PARTICLES);
  dust.frustumCulled=false; dust.count=0;
  dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(skid,dust);scene.add(group);
  const particles=Array.from({length:PARTICLES},()=>({
    life:0,duration:0,p:new THREE.Vector3(),v:new THREE.Vector3(),size:0,color:new THREE.Color(),
  }));
  const transform=new THREE.Object3D();
  const side=new THREE.Vector3(), rear=new THREE.Vector3(), left=new THREE.Vector3(), right=new THREE.Vector3();
  const colors={
    smoke:new THREE.Color('#cad1bd'), gravel:new THREE.Color('#c7ae85'),
    spark:new THREE.Color('#ffbf52'), super:new THREE.Color('#83f3ed'),
  };
  let markCursor=0,particleCursor=0,clock=0,states=new WeakMap();
  function reset() {
    vertices.fill(0);ages.fill(0);positions.needsUpdate=true;
    for(const p of particles)p.life=0;
    dust.count=0;states=new WeakMap();
    markCursor=particleCursor=clock=0;
    group.visible=false; motor.pause();
  }
  function mark(previous,current,lateral) {
    const index=markCursor++%MARKS;
    ages[index]=clock+4.8;
    const w=.115, p=index*12;
    for(let corner=0;corner<4;corner++) {
      const v=corner<2?previous:current,sign=corner%2?1:-1,i=p+corner*3;
      vertices[i]=v.x+lateral.x*w*sign;
      vertices[i+1]=v.y+lateral.y*w*sign+.075;
      vertices[i+2]=v.z+lateral.z*w*sign;
    }
  }
  function puff(position,frame,tint,boosted) {
    const p=particles[particleCursor++%PARTICLES];
    p.p.copy(position);p.p.y+=boosted?.45:.20;
    p.v.copy(frame.right).multiplyScalar((Math.random()-.5)*(boosted?2.8:2))
      .addScaledVector(frame.forward,boosted?-7:-2);
    p.v.y+=.4+Math.random()*(boosted?.9:1.5);
    p.size=(boosted?.15:.23)+Math.random()*.14;
    p.duration=(boosted?.28:.52)+Math.random()*.19;
    p.life=p.duration;p.color.copy(tint);
  }
  function sampleActor(actor,dt) {
    const k=actor.kart;
    let st=states.get(actor);
    if(!st) {
      st={timer:0,trail:false,left:new THREE.Vector3(),right:new THREE.Vector3(),side:false};
      states.set(actor,st);
    }
    const slide=actor.car!=='saucer' && k.grounded && k.sliding && k.speed>6;
    const gravel=k.grounded && k.offroad && k.speed>7;
    if(!slide)st.trail=false;
    if(!slide&&!gravel&&!actor.boost.tier)return;
    st.timer-=dt;if(st.timer>0)return;
    st.timer=.048;
    const frame=track.sample(k.s,k.x);
    side.copy(frame.right);
    side.y=frame.bank || 0;
    side.normalize();
    const yaw=k.yaw||0;
    rear.copy(frame.position).addScaledVector(frame.forward,-Math.cos(yaw)*1.12)
      .addScaledVector(side,-Math.sin(yaw)*1.12);
    if(k.y>0)rear.y+=k.y;
    side.multiplyScalar(Math.cos(yaw)).addScaledVector(frame.forward,-Math.sin(yaw)).normalize();
    left.copy(rear).addScaledVector(side,-1.01);right.copy(rear).addScaledVector(side,1.01);
    const touchdown=slide && !st.trail;
    if(slide) {
      if(st.trail && st.left.distanceToSquared(left)<64) {
        mark(st.left,left,side); mark(st.right,right,side);
      }
      st.left.copy(left);st.right.copy(right);st.trail=true;
    }
    st.side=!st.side;
    const tire=st.side?left:right;
    const tint=gravel?colors.gravel:colors.smoke;
    if(touchdown){
      puff(left,frame,tint,false);
      puff(right,frame,tint,false);
    }else if(slide||gravel)puff(tire,frame,tint,false);
    if(actor.boost.tier) {
      tire.lerp(rear,.5).addScaledVector(frame.forward,-.8);
      puff(tire,frame,actor.boost.tier===2?colors.super:colors.spark,true);
    }
  }
  function update(dt,actors,enabled=true,revving=false) {
    if(!enabled){group.visible=false;motor.pause();return;}
    group.visible=true;clock+=dt;
    const start=markCursor;
    for(const a of actors)sampleActor(a,dt);
    let dirty=markCursor!==start;
    for(let i=0;i<ages.length;i++) if(ages[i] && ages[i]<=clock) {
      vertices.fill(0,i*12,i*12+12);ages[i]=0;dirty=true;
    }
    if(dirty)positions.needsUpdate=true;
    let count=0;
    for(const p of particles) {
      if(!p.life)continue;
      p.life=Math.max(0,p.life-dt);if(!p.life)continue;
      p.p.addScaledVector(p.v,dt);
      const fraction=p.life/p.duration;
      const scale=p.size*Math.min(1,fraction*3.5)*(1.25-.5*fraction);
      transform.position.copy(p.p);
      transform.scale.set(scale,scale*.89,scale);
      transform.rotation.set(fraction*1.1,count*.71,0);
      transform.updateMatrix();
      dust.setMatrixAt(count,transform.matrix);
      dust.setColorAt(count++,p.color);
    }
    dust.count=count;
    if(count) {dust.instanceMatrix.needsUpdate=true;dust.instanceColor.needsUpdate=true;}
    motor.update(dt,actors.find(a=>a.isPlayer)||actors[0],revving);
  }
  reset();
  return {setTrack(next){track=next;reset();},reset,update,unlock:motor.unlock,mute:motor.mute,tone:motor.tone,pause:motor.pause};
}
