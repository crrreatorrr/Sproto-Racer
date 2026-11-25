import * as THREE from 'three';
import {CIRCUITS,blueprint} from './circuits.js';
import {itemModel} from './item-art.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const wrap = THREE.MathUtils.euclideanModulo;
const mix = THREE.MathUtils.lerp;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const defaultColors = {
  tarmac: 0x48535d, shoulder: 0x36434b, asphaltEdge: 0x273d45,
  milk: 0xf1f1da, orange: 0xff663e, lime: 0xddff53, dark: 0x24333c,
  steel: 0x7b9a96, foam: 0xd2e7db, mint: 0x84bdb0, ink: 0x263e44,
  floor: 0x8fb198, grass: 0xb3c9a5, super: 0x6cebdc,
};

export function createTrack(scene,course=CIRCUITS[0]) {
  const {nodes,sections,length}=blueprint(course);
  const original=course.id==='track01';
  const C={...defaultColors,...course.colors};
  const widths=course.widths;
  const at = (i, t) => mix(sections[i].start, sections[i].end, t);
  const segments=Math.ceil(length/3.1),segmentLength=length/segments;
  const railBoundary=s=>Math.round(s/segmentLength)*segmentLength;
  const drops=(course.drops??[]).map(([i,from,to,side])=>({
    start:railBoundary(at(i,from)),end:railBoundary(at(i,to)),side
  }));
  function dropAt(s,side){
    const d=wrap(s,length);
    return drops.find(gap=>gap.side===side && d>=gap.start && d<gap.end);
  }
  function locate(s) {
    const distance = wrap(s, length);
    let lo = 0, hi = nodes.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (nodes[mid].s <= distance) lo = mid;
      else hi = mid;
    }
    const section = sections.findIndex(q => distance + 1e-8 < q.end);
    return {distance, index: Math.max(section, 0), a: nodes[lo], b: nodes[hi],
      t: (distance - nodes[lo].s) / (nodes[hi].s - nodes[lo].s)};
  }
  const pads = (course.pads ?? [
    [0,.76,-7,5,1],[1,.84,5,5,1],[2,.68,-8,5,1],[4,.52,10,5.8,2],
    [6,.89,-6,5,1],[7,.38,8,5,1],[7,.77,-9,5,1],[8,.86,5,5,1],
    [10,.18,-6,5,2],[11,.67,8,5,1],
  ]).map(([i,f,x,width,tier]) => ({s:at(i,f), x,width,tier}));
  const ramps = (course.ramps ?? [
    [2,.79,-9,6,6.5],[4,.91,8,9,10],[5,.34,-10,7,7],[6,.68,8,6,6.5],
    [9,.64,-6.5,9,0],[10,.48,-10,7,6.8],[10,.54,7,8,11],[11,.35,-9,7,7.5],
  ]).map(([i,f,x,width,power]) => ({s:at(i,f),x,width,power}));
  const drum = {s:at(2,.52), x:0, width:4.6, height:4.6, depth:4.6, type:'rollingDrum'};
  const switchTrigger = original ? {s:at(9,.38), x:-9, width:5, type:'bridgeSwitch'} : null;
  const door = {s:at(11,.57), x:-8, width:8.1, height:5.6, depth:.85, type:'loadingDoor', active:true};
  const hazards = original ? [drum,door] : (course.gates??[]).map(([i,f,x])=>({
    s:at(i,f),x,width:4,height:1.7,depth:1.2,type:'laneDivider'
  }));
  let bridgeAngle = 0, bridgeTimer = 0;
  function triggerSwitch() { bridgeTimer = 8; }

  const widthAtSection=(i,u)=>mix(widths[wrap(i-1,widths.length)],widths[i],smooth(0,.12,u));
  function widthAt(s){
    const {distance,index}=locate(s);
    const sec=sections[index];
    return widthAtSection(index,(distance-sec.start)/(sec.end-sec.start));
  }
  function frame(s) {
    const {a,b,t,distance,index:i} = locate(s);
    const center = a.p.clone().lerp(b.p,t), forward = a.f.clone().lerp(b.f,t).normalize();
    const right = new THREE.Vector3(-forward.z,0,forward.x).normalize();
    const curvature = mix(a.curve,b.curve,t);
    const sec = sections[i], u = (distance - sec.start) / (sec.end - sec.start);
    const width = widthAtSection(i,u);
    const bank = -clamp(curvature * 4.2,-.13,.13);
    return {center,forward,right,curvature,bank,width,index:i,u,distance,
      grade:forward.y / Math.max(.02, Math.hypot(forward.x, forward.z))};
  }
  // Five possible lines across the road. Rotate the openings from one row to the next.
  const pickupLanes=[[-2,0,1],[-1,2],[-2,-1,1],[0,1,2],[-2,1],[-1,0,2],[-2,0,2],[-2,-1,2]];
  let pickupRow=0;
  const pickups=course.pickupRows.flatMap((fractions,section)=>fractions.flatMap(fraction=>{
    const s=at(section,fraction);
    const {width,curvature}=frame(s);
    const lanes=pickupLanes[pickupRow%pickupLanes.length];
    const offset=(pickupRow%2===0?1:-1)*Math.sign(curvature)*.04;
    pickupRow++;
    return lanes.map(lane=>({s,x:(lane*.18+offset)*width}));
  }));
  const bridge = original ? ramps[4] : null;
  function crossHeight(f,x) {
    let h = f.bank * x;
    const edge = Math.min(1.1, Math.abs(x)/(f.width * .5));
    // High and low grooves in the dish, and a traversable bank-to-shelf in the chute.
    if (original && f.index === 4) h += 4.2 * edge * edge * smooth(0,.16,f.u) * (1 - smooth(.84,1,f.u));
    if (original && f.index === 5) {
      const blend = smooth(0,.13,f.u) * (1 - smooth(.83,1,f.u));
      h += blend * (4.8 * edge * edge + 2.4 * smooth(5,12,-x));
    }
    return h;
  }
  function rampHeight(s,x,includeBridge) {
    let h = 0;
    for (const ramp of ramps) {
      const d = s - ramp.s;
      if (d < -17 || d > 12 || Math.abs(x-ramp.x) > ramp.width / 2) continue;
      const lateral = 1 - smooth(ramp.width/2 - 1.25,ramp.width/2,Math.abs(x - ramp.x));
      const crest = ramp === bridge ? (includeBridge ? bridgeAngle * 3.6 : 0) : ramp.power * .31;
      h += crest * lateral * (d < 0 ? smooth(-17,0,d) : 1-smooth(0,12,d));
    }
    return h;
  }
  function surface(f,x,includeBridge=false) {
    const p = f.center.clone().addScaledVector(f.right,x);
    p.y += crossHeight(f,x) + rampHeight(f.distance,x,includeBridge);
    return p;
  }
  function sample(s,x=0) {
    const f = frame(s);
    return {position:surface(f,x,true),forward:f.forward,right:f.right,curvature:f.curvature,
      deckY:f.center.y+crossHeight(f,x),grade:f.grade,bank:f.bank,width:f.width,section:f.index};
  }
  const trackGroup = new THREE.Group();
  trackGroup.name = course.name;
  scene.add(trackGroup);
  const instances = new Map();
  const geo = {
    box: new THREE.BoxGeometry(1,1,1),
    pillar: new THREE.CylinderGeometry(.5,.5,1,16),
    cone: new THREE.ConeGeometry(.5,1,6),
    drum: new THREE.CylinderGeometry(.5,.5,1,10),
    sphere: new THREE.IcosahedronGeometry(.5,0),
  };
  const solid = new THREE.MeshLambertMaterial({flatShading:true});
  const dirt = new THREE.MeshLambertMaterial({color:C.floor});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(18000,18000),dirt);
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -6.4;
  trackGroup.add(ground);

  const q = new THREE.Quaternion(), eul = new THREE.Euler(), scale = new THREE.Vector3();
  // Keep static geometry in coarse tiles so Three can reject off-camera parts
  // of each circuit without submitting thousands of objects individually.
  function tile(p) { return Math.floor(p.x/400)+','+Math.floor(p.z/400); }
  function shape(kind,p,w,h,d,color,yaw=0,tilt=0,roll=0) {
    const key=kind+':'+(w>250?'horizon':tile(p));
    if (!instances.has(key)) instances.set(key,{kind,parts:[]});
    q.setFromEuler(eul.set(tilt,yaw,roll,'YXZ'));
    instances.get(key).parts.push([new THREE.Matrix4().compose(p,q,scale.set(w,h,d)),color]);
  }
  function trackShape(kind,s,x,h,w,height,d,color,relativeYaw=0) {
    const f=frame(s), p=surface(f,x); p.y+=h;
    shape(kind,p,w,height,d,color, Math.atan2(-f.forward.x,-f.forward.z)+relativeYaw);
  }
  function world(kind,x,y,z,w,h,d,c,yaw=0) {
    shape(kind,new THREE.Vector3(x,y,z),w,h,d,c,yaw);
  }
  const positiveHeight = p => p.y + 6.4;
  function post(s,x,width=.76,topOffset=-.25,color=C.steel) {
    const f=frame(s), p=surface(f,x), h=positiveHeight(p)+topOffset;
    p.y=-6.4 + h/2;
    shape('box',p,width,h,width,color);
  }

  const surfaceTiles=new Map(), colorCache=new Map();
  function colorValue(n) {
    if (!colorCache.has(n)) colorCache.set(n,new THREE.Color(n));
    return colorCache.get(n);
  }
  function tri(a,b,c,color) {
    const key=tile(a);
    if (!surfaceTiles.has(key)) surfaceTiles.set(key,{positions:[],colors:[]});
    const {positions,colors}=surfaceTiles.get(key);
    positions.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
    const v=colorValue(color);
    for (let i=0;i<3;i++) colors.push(v.r,v.g,v.b);
  }
  function quad(a,b,c,d,color) {tri(a,b,c,color);tri(a,c,d,color);}
  function lp(f,x,y=.07) {const p=surface(f,x);p.y+=y;return p;}
  function strip(a,b,x1,x2,x3,x4,color,offset=.09) {
    quad(lp(a,x1,offset),lp(a,x2,offset),lp(b,x4,offset),lp(b,x3,offset),color);
  }
  function mark(s1,s2,x1,x2,color,offset=.103) {strip(frame(s1),frame(s2),x1,x2,x1,x2,color,offset);}
  // Local track coordinates keep the arrow pointed down the open lane even
  // through a bend. These single, stemmed arrows differ from the triple boost chevrons.
  function laneArrow(s,x,forward,across,color) {
    const run=Math.hypot(forward,across), ds=forward/run, dx=across/run;
    const paint=(along,side)=>lp(frame(s+along*ds-side*dx),x+along*dx+side*ds,.15);
    const neck=run-2.7;
    quad(paint(0,-.40),paint(0,.40),paint(neck,.40),paint(neck,-.40),color);
    tri(paint(neck,-1.4),paint(neck,1.4),paint(run,0),color);
  }
  function hasGuardrail(f){
    return (original && f.index===3) || f.center.y>22 || f.distance<185 || f.distance>length-115 || Math.abs(f.curvature)>.009;
  }
  function railSegment(a,b,side,tall) {
    const offsets=[.15,.5];
    const corners=(f,height)=>offsets.map(offset=>lp(f,side*(f.width*.5-offset),height));
    const [aOuter,aInner]=corners(a,tall?.55:0),[bOuter,bInner]=corners(b,tall?.55:0);
    const [aTop,aRim]=corners(a,tall?1.05:.28),[bTop,bRim]=corners(b,tall?1.05:.28);
    const color=a.index===3?C.mint:C.foam;
    quad(aOuter,bOuter,bTop,aTop,color);
    quad(aInner,bInner,bRim,aRim,color);
    quad(aTop,aRim,bRim,bTop,C.milk);
    quad(aOuter,aInner,bInner,bOuter,C.steel);
  }
  const halfWidths=new Float64Array(segments+1),closedRails=new Uint8Array(segments);
  // Interpolate the same cross-sections used to build the rail and deck meshes.
  function edgeAt(s,side){
    const u=wrap(s,length)*segments/length,i=Math.min(segments-1,Math.floor(u));
    if(!(closedRails[i] & (side<0?1:2)))return Infinity;
    return mix(halfWidths[i],halfWidths[i+1],u-i)-.5;
  }
  let a=frame(0);
  for(let n=0;n<segments;n++){
    const b=frame((n+1)*length/segments);
    const halfA=a.width*.5, halfB=b.width*.5;
    halfWidths[n]=halfA;halfWidths[n+1]=halfB;
    const cuts=[-1,-.875,-.72,-.57,-.40,-.21,0,.21,.40,.57,.72,.875,1];
    for(let k=0;k<cuts.length-1;k++){
      strip(a,b,cuts[k]*halfA,cuts[k+1]*halfA,cuts[k]*halfB,cuts[k+1]*halfB,
        k===0 || k===cuts.length-2 ? C.shoulder : C.tarmac,0);
    }
    const curbColor=Math.floor(n/2)%2===0 ? C.milk : C.orange;
    for(const sign of [-1,1]){
      const open=dropAt((n+.5)*segmentLength,sign);
      const edgeColor=open?(n%2?0xffca33:C.ink):curbColor;
      strip(a,b,sign*halfA,sign*(halfA-(open?1.04:.62)),sign*halfB,sign*(halfB-(open?1.04:.62)),edgeColor);
      strip(a,b,sign*(halfA-1.26),sign*(halfA-1.07),sign*(halfB-1.26),sign*(halfB-1.07),C.milk);
      const p1=lp(a,sign*halfA,0),p2=lp(b,sign*halfB,0);
      const p3=p2.clone(),p4=p1.clone();p3.y-=1.32;p4.y-=1.32;
      quad(p1,p2,p3,p4,C.asphaltEdge);
      if(!open){
        closedRails[n]|=sign<0?1:2;
        railSegment(a,b,sign,hasGuardrail(a));
      }
    }
    if(n%8===0) strip(a,b,-.11,.11,-.11,.11,0x94a5a8);
    a=b;
  }

  // White braking bars are counted from the driver's approach to each tight
  // entry. The soft rubber strips help the eyes follow the arc at full turbo.
  for(const i of [1,3,4,6,8,11]){
    const corner=at(i,.17);
    for(let k=1;k<=3;k++){
      const s=corner-8*k, f=frame(s), outside=-Math.sign(f.curvature || .01);
      const x=outside*(f.width/2-2.3);
      for(let j=0;j<k;j++)mark(s+j*.72,s+j*.72+.33,x-1.2,x+1.2,C.milk,.13);
    }
  }
  for(const i of [1,3,4,5,6,8,11]){
    const begin=i===3?.10:.26,end=i===3?.88:.60;
    const run=(sections[i].end-sections[i].start)*(end-begin),n=Math.ceil(run/3.6);
    for(let j=0;j<n;j++){
      const u=mix(begin,end,j/n),v=mix(begin,end,(j+1)/n);
      const A=frame(at(i,u)),B=frame(at(i,v));
      const xA=3.6*Math.sin(u*4.7),xB=3.6*Math.sin(v*4.7);
      for(const tire of [-.78,.78]){
        strip(A,B,xA+tire-.065,xA+tire+.065,xB+tire-.065,xB+tire+.065,0x3b484f,.043);
      }
    }
  }
  for(const pad of pads){
    const color=pad.tier===2?C.super:C.lime, w=pad.width*.5;
    mark(pad.s-5,pad.s+3,pad.x-w,pad.x+w,C.ink,.105);
    for(const edge of [-1,1]) mark(pad.s-5,pad.s+3,pad.x+edge*w-.1,pad.x+edge*w+.1,color,.12);
    for(let j=0;j<3;j++){
      const s=pad.s-4+2.3*j, left=frame(s),mid=frame(s+1.4), tip=frame(s+2.15),back=frame(s+.75);
      for(const side of [-1,1]) quad(lp(left,pad.x+side*(w-.32),.13),lp(mid,pad.x,.13),lp(tip,pad.x,.13),lp(back,pad.x+side*(w-.32),.13),color);
    }
  }
  for(const ramp of ramps){
    const w=ramp.width/2;
    // Paint the flat crown of the ramp. Spanning the full width joins its
    // two low shoulder vertices and buries the middle of the stripe.
    const paintedHalf=course.id==='track02'?w-1.3:w;
    for(let i=-3;i<0;i++) {
      const p=ramp.s+i*3.5;
      mark(p,p+.52,ramp.x-paintedHalf+.4,ramp.x+paintedHalf-.4,ramp===bridge?C.super:C.orange,.19);
    }
    if(course.id==='track02'){
      mark(ramp.s-1.7,ramp.s-.75,ramp.x-paintedHalf,ramp.x+paintedHalf,C.ink,.22);
      mark(ramp.s-.75,ramp.s+.35,ramp.x-paintedHalf,ramp.x+paintedHalf,C.milk,.24);
    }else mark(ramp.s-.4,ramp.s+.25,ramp.x-w,ramp.x+w,C.milk,.23);
  }
  for(let row=0;row<2;row++)for(let x=-15;x<15;x+=1.5) {
    mark(row*1.5,row*1.5+1.5,x,x+1.5,(row+Math.round(x/1.5))%2===0?C.milk:C.ink,.13);
  }
  const grid=Array.from({length:6},(_,i)=>({s:-7.6-Math.floor(i/2)*8,x:i%2?4:-4}));
  for(const slot of grid) {
    const s=length+slot.s+1.6,x=slot.x;
    mark(s,s+.28,x-1.65,x+1.65,C.milk);
    mark(s-2.5,s,x-1.65,x-1.46,C.milk);
    mark(s-2.5,s,x+1.46,x+1.65,C.milk);
  }
  // Collate the batches after paint and all section-specific markings have been added.
  function textPanel(s,x,h,w,ht,headline,kicker,bg=C.dark,fg=C.milk,frontOffset=0){
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');
    canvas.width=1024;canvas.height=Math.max(128,Math.round(1024*ht/w));
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const css=v=>'#'+v.toString(16).padStart(6,'0');
    ctx.fillStyle=css(bg);ctx.fillRect(0,0,canvas.width,canvas.height);
    const margin=canvas.width*.045, H=canvas.height, small=!!kicker;
    ctx.fillStyle=css(fg);
    if(small) {
      ctx.font='700 '+Math.round(H*.16)+'px Arial, sans-serif';
      ctx.fillText(kicker,margin,H*.25,canvas.width-2*margin);
    }
    let fontSize=H*(small?.58:.66);
    ctx.font='italic 900 '+Math.round(fontSize)+'px Arial, sans-serif';
    fontSize=Math.min(fontSize,fontSize*(canvas.width-2*margin)/Math.max(1,ctx.measureText(headline).width));
    ctx.font='italic 900 '+Math.round(fontSize)+'px Arial, sans-serif';
    ctx.fillText(headline,margin,H*(small?.84:.73));
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=4;
    const f=frame(s), p=surface(f,x);p.y+=h;
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,ht),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    plane.position.copy(p);plane.rotation.y=Math.atan2(-f.forward.x,-f.forward.z);
    plane.translateZ(frontOffset);
    trackGroup.add(plane);
  }
  function mountedSign(s,x,height,w,h,title,caption,bg,fg) {
    const f=frame(s), side=Math.sign(x), edge=side*(f.width*.5-.5);
    const top=height-h*.5+.04;
    // The post ends at the frame's bottom edge, with a real connection back to the deck.
    trackShape('box',s,x,top*.5-.22,.42,top+.44,.45,C.steel);
    trackShape('box',s,(x+edge)*.5,-.43,Math.abs(x-edge)+.45,.48,.55,C.steel);
    trackShape('box',s,x,height,w,h,.3,bg);
    textPanel(s,x,height,w,h,title,caption,bg,fg,.165);
  }

  for(let i=0;i<sections.length;i++){
    const s=at(i,.023),f=frame(s),x=-f.width/2-4.9;
    mountedSign(s,x,6.9,8.5,3.1,String(i+1).padStart(2,'0')+' / '+(original?sections[i].name.split(' ')[0]:sections[i].name).toUpperCase(),'SPROTO  •  TEST TRACK '+course.number,C.dark,C.milk);
  }
  for(const gap of drops){
    const s=gap.start-44, x=gap.side*(widthAt(s)/2+3.6);
    mountedSign(s,x,4.1,6.4,2.4,'DROP',gap.side<0?'OPEN LEFT EDGE':'OPEN RIGHT EDGE',0xffca33,C.ink);
  }
  for(let s=5;s<length;s+=12){
    const f=frame(s), edge=f.width/2-.32;
    for(const side of [-1,1]){
      if(dropAt(s,side))continue;
      if(hasGuardrail(f)){
        trackShape('box',s,side*edge,.36,.30,.75,.48,C.asphaltEdge);
      }else{
        trackShape('box',s,side*edge,.48,.24,1.0,.32,C.milk);
        trackShape('box',s,side*edge,.79,.26,.21,.34,C.orange);
      }
    }
  }
  for(let s=12;s<length;s+=36){
    const f=frame(s);
    // Shared radial columns live outside both stacked decks. A support for the
    // upper turn must never emerge through a driver's lane on the lower turn.
    for(const sign of [-1,1]){
      const offset=sign*(f.width*.5+2.2);
      const support=surface(f,offset);
      const intersectsLowerRoad=nodes.some((n,i)=>i%6===0 && n.p.y<support.y-6 &&
        (n.p.x-support.x)**2+(n.p.z-support.z)**2<17**2);
      if(!intersectsLowerRoad)post(s,offset,f.index===3?1.35:1.0,-1.35);
    }
    trackShape('box',s,0,-1.58,f.width+5.6,.64,1.05,C.steel);
  }
  // A plain checkpoint at the stripe and the festival gantry farther down the grid.
  function arch(s,title,kicker) {
    const f=frame(s),x=f.width*.5+2.2, height=11.4;
    for(const side of [-1,1]){
      trackShape('box',s,side*x,height/2,1.25,height,2,C.dark);
      trackShape('box',s,side*x,3.15,1.48,5.7,2.2,C.orange);
      trackShape('box',s,side*x,6.8,1.49,.34,2.22,C.lime);
    }
    trackShape('box',s,0,height,x*2+1.6,2.5,1.55,C.dark);
    textPanel(s-.84,0,height,2*x+.95,2.38,title,kicker,C.dark,C.milk);
    trackShape('box',s,0,height+1.37,2*x+1.68,.26,1.6,C.lime);
  }
  arch(0,original?'SPROTO RACING':course.name.toUpperCase(),'START  /  FINISH                              COMPETITION RESEARCH UNIT');
  // First-corner landmark: terraced stands, signal pylons, and a trackside timing tower.
  let seed=0x5350;
  function rand(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
  const fans=[C.orange,C.lime,0x5686a0,0x9d7495,C.milk,C.ink];
  // Follow the track's bend continuously through all three seating bays. Each
  // pair of cross sections shares the same endpoints, including the fascia.
  function grandstandProfile(f){
    const profile=[[ -25.9,1.67 ],[-27.7,1.67],[-27.7,2.55],[-29.5,2.55],
      [-29.5,3.43],[-31.3,3.43],[-31.3,4.31],[-33.2,4.31]];
    const seats=profile.map(([x,h])=>lp(f,x,h));
    const front=seats[0].clone(),back=seats[seats.length-1].clone();
    front.y=-6.36;back.y=-6.36;
    return [front,...seats,back];
  }
  function roofProfile(f){
    return [[-25.4,8.37],[-25.4,8.79],[-35.2,9.05],[-35.2,8.74]]
      .map(([x,h])=>lp(f,x,h));
  }
  for(let s=31;s<139;s+=3){
    const a=frame(s),b=frame(s+3),A=grandstandProfile(a),B=grandstandProfile(b);
    for(let k=0;k<A.length-1;k++)quad(A[k],B[k],B[k+1],A[k+1],k===0||k===A.length-2?C.steel:C.foam);
    const R=roofProfile(a),S=roofProfile(b);
    for(let k=0;k<4;k++)quad(R[k],S[k],S[(k+1)%4],R[(k+1)%4],k===0?C.lime:C.mint);
    if(s===31||s===136){
      const end=s===31?R:S;quad(...end,C.mint);
      const wall=s===31?A:B;
      for(let k=1;k<wall.length-1;k++)tri(wall[0],wall[k],wall[k+1],C.steel);
    }
  }
  for(const s of [48,84,120]){
    for(let row=0;row<4;row++){
      for(let j=0;j<15;j++){
        const pos=s-14+j*1.95+rand()*.5;
        trackShape('sphere',pos,-26.8-row*1.8,2.17+row*.88,.82+rand()*.45,.95+rand()*.65,.91,fans[Math.floor(rand()*fans.length)]);
      }
    }
    for(const d of [-13,13])trackShape('box',s+d,-34.2,4.45,.47,9.1,.48,C.dark);
  }
  for(const s of [34,60,86,112,138,164]){
    trackShape('pillar',s,19.4,5.5,.19,11,.19,C.dark);
    trackShape('box',s,20.9,9.9,3,.95,.09,C.orange);
  }
  trackShape('box',87,35,9,14,18,16,C.foam);
  trackShape('box',87,35,18.1,15,.8,17,C.lime);
  trackShape('box',87,35,13,14.3,3.8,16.4,C.ink);
  textPanel(87,35,6.8,11.9,5,course.number,'TEST FACILITY',C.orange,C.ink,8.035);
  textPanel(150,28,9,20,7,'SPROTO','RACING DIVISION     /     '+course.number,C.orange,C.ink);
  trackShape('box',150,28,4.5,.56,9,.66,C.dark);

  // Runoff boards define the approach to a bend without enclosing the entire course.
  for(let i=0;i<12;i++){
    for(const u of [.29,.58,.79]){
      const s=at(i,u),f=frame(s);
      if(Math.abs(f.curvature)<.004 || i===3)continue;
      const side=-Math.sign(f.curvature);
      for(let j=0;j<3;j++) {
        if(!dropAt(s+6*j,side))trackShape('box',s+6*j,side*(f.width*.5+1.8),1.15,1,2.3,5.3,j%2?C.milk:C.orange);
      }
    }
  }
  function originalFixtures() {
    // Rolling drum travels under a striped overhead feeder with a visible crossing lane.
    const drumFrame=frame(drum.s);
    for(const sign of [-1,1]) trackShape('box',drum.s,sign*(drumFrame.width/2+1.7),5.3,.9,10.6,.9,C.steel);
    trackShape('box',drum.s,0,10.4,drumFrame.width+4,.58,1.4,C.orange);
    for(let x=-12;x<12;x+=2.4)mark(drum.s-.3,drum.s+.25,x,x+1.3,C.orange);
    const movingDrum=new THREE.Group();
    const drumBody=new THREE.Mesh(geo.drum,new THREE.MeshLambertMaterial({color:C.orange}));
    drumBody.scale.set(drum.width,drum.depth,drum.height);drumBody.rotation.x=Math.PI/2;movingDrum.add(drumBody);
    const bands=new THREE.MeshLambertMaterial({color:C.dark});
    for(const z of [-1.55,1.55]){
      const band=new THREE.Mesh(geo.drum,bands);band.rotation.x=Math.PI/2;band.scale.set(4.69,.38,4.69);band.position.z=z;movingDrum.add(band);
    }
    trackGroup.add(movingDrum);

    // The spiral has unobstructed lanes. Numbered quarter-turns make runs reproducible.
    world('pillar',-525,40,-410,12,92,12,C.foam);
    world('pillar',-525,90,-410,15,9,15,C.orange);
    world('pillar',-525,99,-410,4.2,13,4.2,C.dark);
    world('sphere',-525,108,-410,6,6,6,C.lime);
    for(let j=0;j<7;j++) {
      const s=at(3,Math.min(.985,j/6+.005)),f=frame(s), x=f.width/2+2.7;
      mountedSign(s,x,4.8,4,2.5,String(j*90)+'°','SPIRAL    /    04',C.lime,C.ink);
    }
    // Masts in the slalom use different sizes so the tightening gates read in silhouette.
    for(let j=0;j<17;j++){
      const s=at(6,(j+.5)/17),side=j%2===0?1:-1,h=10+(j*7)%22,x=side*(18+rand()*9);
      trackShape('pillar',s,x,h/2,2.7,h,2.7,C.mint);
      trackShape('pillar',s,x,h*.83,2.82,1.7,2.82,C.orange);
      trackShape('cone',s,x,h+1.8,3,3.6,3,C.dark);
    }
    for(let i=0;i<6;i++){
      const s=at(7,.3+i*.09);
      trackShape('box',s,-21,6,.38,12,.5,C.ink);
      trackShape('box',s,-22.5,11.6,3.6,.27,.5,C.ink);
    }
    // Bridge is localized to the left lane; the main road is a continuous bypass.
    for(const side of [-1,1]){
      trackShape('box',bridge.s,bridge.x+side*5.1,5.4,.63,10.8,1.3,C.orange);
      trackShape('box',bridge.s,bridge.x+side*5.1,9.2,.69,.55,1.4,C.lime);
    }
    trackShape('box',bridge.s,bridge.x,10.4,10.65,.63,.8,C.dark);
    mark(switchTrigger.s-1.3,switchTrigger.s+1.3,switchTrigger.x-2.5,switchTrigger.x+2.5,C.super,.16);
    textPanel(switchTrigger.s+4,-19,3.3,8.5,2.2,'LIFT  ↗','BRIDGE SWITCH',C.dark,C.super);
    trackShape('box',switchTrigger.s+4,-19,1.55,.4,3.1,.4,C.dark);
    const bridgeMesh=new THREE.Mesh(new THREE.BoxGeometry(8.8,.28,16.4),
      new THREE.MeshLambertMaterial({color:C.mint}));
    trackGroup.add(bridgeMesh);
    const bridgeBase=frame(bridge.s-8);
    const bridgeIdle=surface(bridgeBase,bridge.x);bridgeIdle.y+=.10;
    const bridgeYaw=Math.atan2(-bridgeBase.forward.x,-bridgeBase.forward.z);

    for(const d of [-4.5,4.5]) {
      trackShape('box',door.s,door.x+d,3.5,1.0,7,2.2,C.dark);
      trackShape('box',door.s,door.x+d,2.0,1.02,3,2.24,C.orange);
    }
    trackShape('box',door.s,door.x,7.2,10.2,1.0,2.2,C.mint);
    const doorMesh=new THREE.Mesh(new THREE.BoxGeometry(door.width,door.height,door.depth),
      new THREE.MeshLambertMaterial({color:C.orange}));
    const doorFrame=frame(door.s), doorBase=surface(doorFrame,door.x);
    doorMesh.rotation.y=Math.atan2(-doorFrame.forward.x,-doorFrame.forward.z);
    trackGroup.add(doorMesh);
    textPanel(door.s-1.16,door.x,7.15,9.9,.8,'03     DOCK  ACCESS','',C.dark,C.lime);

    for(let j=0;j<30;j++){
      const s=at(11,.1+rand()*.67),x=(j%2?-1:1)*(24+rand()*17);
      const ht=3.1+(j%4)*1.5;
      trackShape('box',s,x,ht/2,4+rand()*4,ht,7+rand()*6,[C.steel,C.mint,C.foam,C.orange][j%4]);
      trackShape('box',s,x,ht+.03,4,.12,5,C.ink);
    }

    return (time,dt,lap)=>{
      bridgeTimer=Math.max(0,bridgeTimer-dt);
      bridgeAngle=THREE.MathUtils.damp(bridgeAngle,bridgeTimer>0?1:0,4,dt);
      bridge.power=bridgeAngle>.32?bridgeAngle*9:0;
      bridgeMesh.position.copy(bridgeIdle);bridgeMesh.position.y+=bridgeAngle*1.73;
      bridgeMesh.rotation.set(bridgeAngle*.205,bridgeYaw,0,'YXZ');
      drum.x=Math.sin(time*.9)*10.4;
      movingDrum.position.copy(surface(drumFrame,drum.x));movingDrum.position.y+=drum.height/2;
      movingDrum.rotation.y=Math.atan2(-drumFrame.forward.x,-drumFrame.forward.z);
      drumBody.rotation.y=time*.8;
      door.active=lap<3;
      doorMesh.position.copy(doorBase);doorMesh.position.y+=door.active?door.height/2:9.8;
    };
  }
  const updateFixtures=original?originalFixtures():()=>{};
  if(original){
    // Linked Switchbacks shrinks from 31 to 26 metres over its first 44 metres.
    // Mark the outside of this left bend where fast wide lines reach the taper.
    const start=sections[1].start;
    const signAt=start-39;
    mountedSign(signAt,frame(signAt).width/2+4.5,4.3,7.2,2.7,'NARROWS','31 → 26 m',C.dark,C.orange);
    for(const d of [-20,-4,12,28,44]){
      const a=frame(start+d),b=frame(start+d+4.1);
      const edge=a.width/2-1.5,inner=b.width/2-3.1;
      strip(a,b,edge-.75,edge,inner-.75,inner,C.orange,.14);
    }
  }
  if(course.id==='track02'){
    // Brackets at ten metre intervals frame the predicted landing lane. The
    // longer alternating ticks and upright 40 m board are readable across a crest.
    for(const ramp of ramps){
      const f=frame(ramp.s);
      const drop=surface(f,ramp.x).y-surface(frame(ramp.s+50),ramp.x).y;
      const flatRange=ramp.power<=6?50:ramp.power<=8?70:80;
      const downhillAllowance=drop>10?40:drop>5?30:0;
      let range=flatRange+downhillAllowance;
      for(const next of ramps){
        if(next.s>ramp.s && Math.abs(next.x-ramp.x)<(next.width+ramp.width)/2){
          range=Math.min(range,next.s-ramp.s-19);
        }
      }
      for(let d=10;d<=range;d+=10){
        const major=d%20===0,half=ramp.width/2;
        for(const side of [-1,1]){
          const x=ramp.x+side*half;
          const inside=x-side*(major?2.0:1.15);
          mark(ramp.s+d,ramp.s+d+(major?.95:.60),Math.min(x,inside),Math.max(x,inside),C.milk,.14);
          mark(ramp.s+d-(major?3:1.6),ramp.s+d,x-.22,x+.22,C.milk,.14);
        }
      }
      const signSide=ramp.x>0?1:-1;
      mountedSign(ramp.s-19,signSide*(f.width/2+4),4.4,6,2.5,Math.round(ramp.power)+' m/s','JUMP IMPULSE',C.steel,C.milk);
      if(ramp.power>=9){
        const at40=ramp.s+40;
        mountedSign(at40,signSide*(frame(at40).width/2+3.1),5.8,4.6,2.8,'40 m','LANDING',C.dark,C.milk);
      }
    }
    for(const i of [2,3,4,5,7,8,10]){
      const s=at(i,.55),f=frame(s);
      mountedSign(s,f.width/2+4.5,5,8,2.7,Math.round(f.center.y)+' m','DECK ELEVATION',C.dark,C.milk);
    }
  }
  if(course.id==='track03'){
    for(const gate of hazards){
      trackShape('box',gate.s,gate.x,gate.height/2,gate.width,gate.height,gate.depth,C.orange);
      trackShape('box',gate.s,gate.x,1.42,gate.width+.06,.24,1.25,C.dark);
      const sides=gate.x===0?[-1,1]:[-Math.sign(gate.x)];
      for(const side of sides){
        const from=gate.x+side*(gate.x===0?1.65:.6);
        laneArrow(gate.s-48,from,6.1,side*4.8,C.milk);
        laneArrow(gate.s-22,from,6.1,side*4.8,C.milk);
      }
      for(let k=1;k<=2;k++)mark(gate.s-k*4-.48,gate.s-k*4,gate.x-1.8,gate.x+1.8,C.orange,.13);
    }
    for(const i of [1,2,4,5,7,8,10]){
      const s=at(i,.22);
      for(const d of [75,50,25]){
        const f=frame(s-d);
        mountedSign(s-d,-f.width/2-2.8,3.7,4.1,2.2,String(d),'BRAKE  /  m',C.dark,C.milk);
      }
    }
  }

  // Marker cubes are permanent station beacons; inventory cooldowns belong to the race simulation.
  const crate=itemModel('pickup');
  const pickupMesh=new THREE.InstancedMesh(crate.geometry.clone(),crate.material.clone(),pickups.length);
  const pickupPositions=pickups.map(item=>sample(item.s,item.x).position);
  for(const item of pickups) {
    trackShape('pillar',item.s,item.x,.05,1.92,.12,1.92,C.dark);
    trackShape('pillar',item.s,item.x,.12,1.22,.08,1.22,C.lime);
  }
  trackGroup.add(pickupMesh);

  // A low-poly landscape provides parallax and a horizon even in unadorned test sectors.
  const outerRadius=original?1240:Math.max(...nodes.map(n=>Math.hypot(n.p.x,n.p.z)))+400;
  const hills=[0x779a94,0x829f97,0x6f928d,0xa1bba5,0x78938d];
  for(let i=0;i<80;i++){
    const angle=i*TAU/80+rand()*.025,rad=outerRadius+rand()*380;
    const x=Math.cos(angle)*rad,z=Math.sin(angle)*rad, h=135+rand()*310;
    world('cone',x,-10+h/2,z,350+rand()*340,h,300+rand()*240,hills[i%hills.length],rand()*Math.PI);
  }
  const siteColors=[C.mint,C.foam,C.steel,0xabc2af];
  for(const [sIdx,u,side] of [[0,.6,1],[1,.7,-1],[2,.2,1],[6,.88,1],[7,.47,1],[9,.3,1],[10,.81,-1]]){
    const f=frame(at(sIdx,u));
    for(let j=0;j<5;j++){
      const p=f.center.clone().addScaledVector(f.right,side*(60+rand()*65)).addScaledVector(f.forward,(rand()-.5)*96);
      const w=11+rand()*12,d=13+rand()*16,h=8+rand()*14;
      if(nodes.some((n,i)=>i%6===0 && n.p.y<h+4 && Math.hypot(n.p.x-p.x,n.p.z-p.z)<20+Math.max(w,d)))continue;
      p.y=-6.3+h/2;shape('box',p,w,h,d,siteColors[j%4]);
      p.y+=h/2;shape('box',p,w+1,.72,d+1,C.foam);
      if(j%2===0){p.y+=1.6;shape('box',p,4,3,4,C.steel);}
    }
  }
  // Tree clumps stay on the ground under elevated sections and away from active lanes.
  for(let i=0;i<165;i++){
    const s=rand()*length, f=frame(s);
    if(f.index===3 || f.index===4)continue;
    const offset=(rand()>.5?-1:1)*(43+rand()*65);
    const p=f.center.clone().addScaledVector(f.right,offset), size=2.8+rand()*4;
    // Check nearby portions of the circuit in plan view before placing a tall tree.
    if(nodes.some((n,index)=>index%10===0 && n.p.y<16 && (n.p.x-p.x)**2+(n.p.z-p.z)**2<21**2))continue;
    p.y=-4.2;shape('pillar',p,.75,4.6,.75,C.ink);
    p.y=-2.6+size*.45;shape('sphere',p,size*1.28,size*1.5,size,siteColors[i%4]);
  }
  const roadMaterial=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,flatShading:true});
  for(const {positions,colors} of surfaceTiles.values()){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    trackGroup.add(new THREE.Mesh(geometry,roadMaterial));
  }

  for(const {kind,parts} of instances.values()){
    const mesh=new THREE.InstancedMesh(geo[kind],solid,parts.length);
    parts.forEach(([matrix,hex],index)=>{mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,colorValue(hex));});
    mesh.computeBoundingSphere();trackGroup.add(mesh);
  }
  const obj=new THREE.Object3D();
  function update(time=0,dt=0,playerS=0,lap=1) {
    updateFixtures(time,dt,lap);
    for(let i=0;i<pickups.length;i++){
      const item=pickups[i];
      obj.position.copy(pickupPositions[i]);obj.position.y+=2+.21*Math.sin(time*2+i*.57);
      obj.rotation.set(.15,time*1.2+i*.36,.16);
      obj.scale.setScalar(item.hidden?0:1.16);obj.updateMatrix();
      pickupMesh.setMatrixAt(i,obj.matrix);
    }
    pickupMesh.instanceMatrix.needsUpdate=true;
  }
  function reset(){
    bridgeTimer=0;bridgeAngle=0;
    for(const item of pickups)item.hidden=false;
    update(0,0,0,1);
  }
  const mapPoints=[];
  for(let i=0;i<360;i++){
    const p=frame(i/360*length).center;mapPoints.push({x:p.x,z:p.z});
  }
  reset();
  function dispose(){
    const geometries=new Set(),materials=new Set();
    trackGroup.traverse(obj=>{
      if(!obj.isMesh)return;
      geometries.add(obj.geometry);materials.add(obj.material);
      if(obj.isInstancedMesh)obj.dispose();
    });
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials){material.map?.dispose();material.dispose();}
    trackGroup.removeFromParent();
  }
  return {id:course.id,name:course.name,dispose,grid,length,sections,sample,widthAt,edgeAt,dropAt,pads,pickups,ramps,hazards,switchTrigger,triggerSwitch,reset,update,mapPoints};
}
