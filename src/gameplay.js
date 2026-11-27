import * as THREE from 'three';
import { ITEMS } from './items.js';
import { itemModel, projectileModel } from './item-art.js';
import { createGameplayCore, FLYING_TYPES } from './sim/gameplay-core.js';
import { createTrackSample } from './sim/track-core.js';

export { ITEMS } from './items.js';

const TAU = 2 * Math.PI;
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const clamp = THREE.MathUtils.clamp;
// Flight decoration follows actual simulation motion. No collision trajectory is changed.
const FLIGHT = Object.freeze({
  ball:      { color:0xff8f38, hot:0xffbe51, samples:6, width:.17, border:.28, spacing:.029, tail:6.8, rear:.73, type:'embers' },
  disc:      { color:0x29d8ee, hot:0x9bfff4, samples:9, width:.094,border:.17, spacing:.024, tail:10.5,rear:.74,type:'twin' },
  lightbolt: { color:0x35dccc, hot:0xd8fff7, samples:7, width:.072,border:.14, spacing:.019, tail:11.4,rear:.319,type:'laser' },
  bolt:      { color:0xe44591, hot:0xff86bd, samples:7, width:.091,border:.19, spacing:.023, tail:9.2,rear:1.005,type:'confetti' },
  cursor:    { color:0xf13093, hot:0xffabde, samples:8, width:.077,border:.22, spacing:.026, tail:9.9,rear:1.36,type:'lock' },
  lob:       { color:0x9ada4a, hot:0xd9f97e, samples:8, width:.11, border:.19, spacing:.027, tail:8.5,rear:.49,type:'droplets' },
  ring:      { color:0xffb538, hot:0xffe694, samples:8, width:.086,border:.17, spacing:.022, tail:10.2,rear:.97,type:'hoop' },
  rocket:    { color:0xff6828, hot:0xffaa3f, samples:11,width:.144,border:.30,spacing:.026, tail:13.9,rear:1.3522,type:'rocket' },
});
const WINGS=[-1,1], NOZZLES=[-1,0,1], CENTER=[0];
const CONFETTI=[0xff8abe,0xffd366,0x72e6e0,0xaf8cff,0xff947c];
const FLAIR = Object.freeze({
  soda: { color: 0xccff4d, style: 'rise' }, triple: { color: 0xffdd64, style: 'triple' },
  speaker: { color: 0xd7a0ff, style: 'bass' }, spool: { color: 0x93f9ff, style: 'spool' },
  spring: { color: 0xff9768, style: 'spring' }, siphon: { color: 0x5ffbea, style: 'siphon' },
  comet: { color: 0xffed86, style: 'comet' },
});
const POOL_PER_KEY = 6;
const POOL_MAX = 72;

function poolKey(o) {
  const variant = o.itemType ?? o.tint ?? o.color ?? '';
  return o.type + ':' + variant;
}

export function createGameplay(scene, track, { onVisualCue } = {}) {
  const root = new THREE.Group();
  root.name = 'item-effects';
  scene.add(root);

  const arrow = new THREE.Shape();
  arrow.moveTo(-.47, -.27); arrow.lineTo(-.47, .012); arrow.lineTo(0, .33);
  arrow.lineTo(.47, .012); arrow.lineTo(.47, -.27); arrow.lineTo(0, .025); arrow.closePath();
  const geometries = {
    halo: new THREE.TorusGeometry(1, .026, 5, 38),
    wakeHoop: new THREE.TorusGeometry(1,.054,4,14,Math.PI*1.68),
    floor: new THREE.RingGeometry(.80, 1, 44).rotateX(-Math.PI / 2),
    patch: new THREE.CircleGeometry(1, 34).rotateX(-Math.PI / 2),
    forward: new THREE.ShapeGeometry(arrow).rotateX(Math.PI / 2),
    diamond: new THREE.OctahedronGeometry(1),
    mote: new THREE.IcosahedronGeometry(1, 0),
    strand: new THREE.CylinderGeometry(.94, .69, 1, 6).rotateX(Math.PI / 2),
    tread: new THREE.BoxGeometry(1, 1, 1),
  };
  const materials = new Map();
  const freePool = new Map();
  const activeMeshes = new Map();
  const sampleScratch = createTrackSample();
  const previousScratch = createTrackSample();
  const pNow = new THREE.Vector3();
  const pBefore = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const part = new THREE.Object3D();
  const newest = new THREE.Vector3(), headOffset = new THREE.Vector3(), normal = new THREE.Vector3();
  let pooled = 0, disposed = false;
  const arcs = 14;

  function material(color, opacity, blend = false) {
    const key = color + ':' + opacity + ':' + blend;
    if (!materials.has(key)) materials.set(key, new THREE.MeshBasicMaterial({
      color, opacity, transparent: opacity < 1 || blend, depthWrite: opacity === 1 && !blend,
      blending: blend ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
    }));
    return materials.get(key);
  }

  function mesh(parent, shape, color, opacity, name, blend = false) {
    const m = new THREE.Mesh(geometries[shape], material(color, opacity, blend));
    m.name = name;
    parent.add(m);
    return m;
  }

  function instances(entry, shape, color, opacity, count, name, blend = false) {
    const m = new THREE.InstancedMesh(geometries[shape], material(color, opacity, blend), count);
    m.name = name;
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    entry.group.add(m);
    entry.owned.push(m);
    return m;
  }

  function finish(m, count) {
    m.count = count;
    if (count) {
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0,count*16);
      m.instanceMatrix.needsUpdate = true;
    }
  }

  function bead(m, i, at, width, height = width, depth = width, yaw = 0) {
    part.position.copy(at);
    part.rotation.set(0, yaw, 0);
    part.scale.set(width, height, depth);
    part.updateMatrix();
    m.setMatrixAt(i, part.matrix);
  }

  function segment(m, i, a, b, width, thick = width) {
    dir.subVectors(b, a);
    const len = dir.length();
    part.position.copy(a).lerp(b, .5);
    if (len > .001) part.quaternion.setFromUnitVectors(FORWARD, dir.multiplyScalar(1 / len));
    else part.quaternion.identity();
    part.scale.set(width, thick, Math.max(.001, len));
    part.updateMatrix();
    m.setMatrixAt(i, part.matrix);
  }

  function oriented(m, i, at, heading, w, h, d, roll = 0) {
    part.position.copy(at);
    part.quaternion.setFromUnitVectors(FORWARD, heading);
    if(roll) part.rotateZ(roll);
    part.scale.set(w,h,d);
    part.updateMatrix(); m.setMatrixAt(i,part.matrix);
  }

  function ground(entry, shape, color, alpha, name, blend = false) {
    return mesh(entry.group, shape, color, alpha, name, blend);
  }

  function halo(entry, color, alpha, name, shape = 'halo') {
    return mesh(entry.detail, shape, color, alpha, name, true);
  }

  function buildEntry(o, key) {
    const group = new THREE.Group();
    const type = o.type;
    const pose = new THREE.Group();
    const detail = new THREE.Group();
    group.name = (type === 'flair' || type === 'attached') ? o.itemType : type;
    group.add(pose, detail);
    const e = { key, group, pose, detail, owned: [], a: new THREE.Vector3(), b: new THREE.Vector3(), emit: new THREE.Vector3() };
    if (type === 'pulse') {
      const tint = o.color ?? 0xffefd1;
      e.wave = halo(e, tint, .80, 'pulse-front');
      e.echo = halo(e, tint, .45, 'pulse-echo');
      e.flash = halo(e, 0xe6c4ff, .63, 'pulse-leading-edge','wakeHoop');
      e.dashes = instances(e, 'diamond', tint, .75, 18, 'pulse-fragments', true);
    } else if (type === 'cable' || type === 'beam') {
      const tether = type === 'cable';
      const tint = o.color ?? 0x80e9ff;
      e.core = instances(e, 'strand', tether ? 0x3d596a : 0x9dfff0, tether ? 1 : .86, arcs, 'tether-core', !tether);
      e.glow = instances(e, 'strand', tint, tether ? .47 : .41, arcs, 'tether-sheath', true);
      e.charge = instances(e, 'diamond', tint, .94, 8, tether ? 'tow-charges' : 'siphon-flow', true);
      e.socket = instances(e, 'halo', tint, .72, 2, 'tether-endpoints', true);
    } else {
      const rule = FLIGHT[type];
      const model = type === 'shield' ? itemModel('bubble') : rule ? projectileModel(type, o.tint) :
        itemModel(type === 'flair' || type === 'attached' ? o.itemType : type);
      pose.add(model);
      if (model.userData.trail?.isObject3D) model.userData.trail.visible = false;
      e.model = model;
      if (rule) {
        const tint = o.tint ?? rule.color;
        e.rule = rule;
        e.history = new Float32Array(rule.samples * 3);
        e.trail = instances(e,'strand',rule.hot,rule.type==='embers'?.47:.78,rule.samples*2+4,'projectile-core-trail',true);
        e.haze = instances(e,rule.type==='rocket'?'mote':'strand',rule.type==='rocket'?0x706c78:tint,
          rule.type==='rocket'?.31:rule.type==='embers'?.24:.31,rule.samples+1,'projectile-outer-trail',rule.type!=='rocket');
        const fragment=rule.type==='confetti'?'tread':rule.type==='droplets'?'mote':rule.type==='hoop'?'wakeHoop':'diamond';
        const styleColor=rule.type==='confetti'?0xffffff:rule.type==='rocket'?0xff9f40:tint;
        e.sparks=instances(e,fragment,styleColor,rule.type==='droplets'?.65:.83,rule.samples*2,'projectile-sparks',rule.type!=='droplets');
        if(rule.type==='confetti'){
          const swatch=new THREE.Color();
          for(let i=0;i<e.sparks.instanceMatrix.count;i++)e.sparks.setColorAt(i,swatch.setHex(CONFETTI[i%CONFETTI.length]));
          e.sparks.instanceColor.needsUpdate=true;
        }
        if (type === 'cursor' || type === 'rocket') {
          e.lock = new THREE.Group();
          e.lock.name = 'world-lock-reticle';
          group.add(e.lock);
          const lock = mesh(e.lock, 'floor', tint, .83, 'lock-ring', true);
          lock.scale.setScalar(1.26);
          e.lockTicks=instances(e,'forward',tint,.74,4,'lock-chevron',true);
          e.lock.add(e.lockTicks);
          for(let j=0;j<4;j++){
            const heading=j*TAU/4;
            tmpA.set(Math.sin(heading)*1.35,.013,Math.cos(heading)*1.35);
            bead(e.lockTicks,j,tmpA,.61,1,.68,heading+Math.PI);
          }
          e.lockTicks.instanceMatrix.needsUpdate=true;

        } else if (type === 'lob' || type === 'ball' || type === 'disc') {
          e.roadCue = ground(e, 'floor', tint, .49, 'projectile-road-cue', true);
        }
      } else if (type === 'shield') {
        e.film = halo(e, 0x8affff, .65, 'shield-equator');
        e.guard = halo(e, 0x5beaff, .43, 'shield-guard');
        e.scan = halo(e, 0xdcffff, .69, 'shield-scanline');
        e.sparks = instances(e, 'diamond', 0xb5ffff, .68, 8, 'shield-grid-nodes', true);
      } else if (type === 'slip') {
        e.pool = ground(e, 'patch', 0x7b35bb, .39, 'sticky-liquid-field');
        e.lip = ground(e, 'floor', 0xe7a6ff, .44, 'sticky-liquid-ripple', true);
        e.drops = instances(e, 'mote', 0xd698ff, .73, 7, 'sticky-liquid-bubbles', true);
      } else if (type === 'box' || type === 'attached') {
        e.corner = instances(e, 'diamond', 0xffb578, .85, 8, 'box-latch-markers', true);
        e.base = ground(e, 'floor', 0xff795e, .64, 'box-caution-ring', true);
      } else if (type === 'strip') {
        e.lane = new THREE.Group();
        e.lane.name = 'boost-strip-lit-lane';
        group.add(e.lane);
        e.chevrons = [];
        for (let i = 0; i < 4; i++) {
          const m = mesh(e.lane, 'forward', i % 2 ? 0xcffffb : 0x72f8ce, .96, 'boost-strip-moving-chevron', true);
          e.chevrons.push(m);
        }
        for (const s of [-1, 1]) {
          const rail = mesh(e.lane, 'tread', 0x68ffe3, .8, 'boost-strip-edge', true);
          rail.position.x = s * .45;
          rail.scale.set(.056, .017, .98);
        }
      } else if (type === 'puck') {
        e.arming = ground(e,'wakeHoop',0xe591ff,.68,'puck-arming-dial',true);
        e.radius = ground(e, 'floor', 0xbf6dff, .46, 'puck-armed-area', true);
        e.sparks = instances(e, 'diamond', 0xf5bdff, .82, 12, 'puck-charge-nodes', true);
      } else if (type === 'broom') {
        e.sweep = halo(e, 0x90ffde, .61, 'broom-sweep-front', 'floor');
        e.sparks = instances(e, 'diamond', 0xa9ffdf, .77, 12, 'broom-bristle-trail', true);
      } else if (type === 'flair') {
        e.flair = FLAIR[o.itemType] ?? FLAIR.soda;
        e.hoop = halo(e, e.flair.color, .63, 'item-activation-halo');
        e.sparks = instances(e, 'diamond', e.flair.color, .79, 9, e.flair.style + '-activation-trail', true);
      }
    }
    return e;
  }

  function sample(s, x, scratch = sampleScratch) {
    return track.sampleInto ? (track.sampleInto(s, x, scratch) ?? scratch) : track.sample(s, x);
  }

  function loc(s, x, offset, v) {
    const p = sample(s, x).position;
    return v.set(p.x, p.y + offset, p.z);
  }

  function writeHistory(e, p, clock) {
    const n = e.rule.samples;
    if (clock < e.lastSample) {
      e.head = 0; e.size = 1; e.lastSample = -Infinity;
    }
    if (e.size && clock - e.lastSample < e.rule.spacing - .00001) return;
    e.head = (e.head + 1) % n;
    const i = e.head * 3;
    e.history[i] = p.x; e.history[i + 1] = p.y; e.history[i + 2] = p.z;
    e.size = Math.min(n, e.size + 1);
    e.lastSample = clock;
  }

  function renderTethers(o, e, clock, age) {
    const owner = o.owner?.kart;
    const target = o.target?.kart;
    if (!owner || !target || owner.fall || target.fall) { e.group.visible = false; return; }
    loc(owner.s, owner.x, owner.y + .89, pNow);
    loc(target.s, target.x, target.y + .94, pBefore);
    e.group.position.copy(pNow);
    e.b.subVectors(pBefore, pNow);
    side.copy(e.b).cross(UP).normalize();
    const beam = o.type === 'beam';
    const charge = Math.min(1, age * (beam ? 23 : 10));
    const expiry = clamp(o.life * (beam ? 6.3 : 3), .12, 1);
    function tetherPoint(t, v) {
      const d = Math.sin(Math.PI * t);
      v.copy(e.b).multiplyScalar(t);
      const period = Math.sin(t * 25 - clock * (beam ? -34 : 24));
      v.addScaledVector(side,(beam?.27:.105)*d*period + (beam?.085*d*Math.sin(t*63+clock*44):0));
      // Graphical bow above the racing line, not a change to the tow reach or target.
      v.y += d * (beam ? .41 + .22 * Math.cos(t * 15 + clock * 27) : .20 + .066 * period);
      return v;
    }
    tmpA.set(0, 0, 0);
    for (let i = 0; i < arcs; i++) {
      tetherPoint((i + 1) * charge / arcs, tmpB);
      const th = (beam ? .042 + .028 * Math.sin(i * .81 - clock * 27) : .040) * expiry;
      segment(e.core, i, tmpA, tmpB, th);
      segment(e.glow, i, tmpA, tmpB, th * (beam ? 2.18 : 1.55));
      tmpA.copy(tmpB);
    }
    finish(e.core, arcs); finish(e.glow, arcs);
    for (let i = 0; i < 8; i++) {
      const t = ((i / 8 + (beam ? -age * 5.2 : age * 2.0)) % 1 + 1) % 1;
      tetherPoint(t * charge, tmpA);
      tmpC.copy(e.b).normalize();
      if(tmpC.lengthSq()<.001)tmpC.copy(FORWARD);
      oriented(e.charge,i,tmpA,tmpC,(beam?.105:.09)*expiry,.083*expiry,(beam?.31:.17)*expiry,clock*7+i);
    }
    finish(e.charge, 8);
    tmpA.set(0,0,0);tmpC.copy(e.b).normalize();
    if(tmpC.lengthSq()<.001)tmpC.copy(FORWARD);
    oriented(e.socket,0,tmpA,tmpC,.27,.27,.59,clock*4);
    tetherPoint(charge,tmpA);
    oriented(e.socket,1,tmpA,tmpC,.34,.34,.63,-clock*4);
    finish(e.socket, 2);
  }

  function renderTrail(o, e, road, clock, age) {
    const r = e.rule;
    const n = r.samples;
    const before = sample(o.s0 ?? o.s, o.x0 ?? o.x, previousScratch).position;
    pBefore.set(before.x, o.y0 ?? o.y, before.z);
    if(clock<e.lastSample || (e.size && newest.fromArray(e.history,e.head*3).distanceToSquared(pNow)>625)){
      e.head=-1; e.size=0; e.lastSample=-Infinity;
    }
    dir.subVectors(pNow, pBefore);
    if (dir.lengthSq() < .00001) {
      const v = o.v ?? 0, vx = o.vx ?? 0;
      dir.set((road.forward?.x ?? 0) * v + (road.right?.x ?? 1) * vx,
        o.vy ?? (road.forward?.y ?? 0) * v,
        (road.forward?.z ?? 1) * v + (road.right?.z ?? 0) * vx);
    }
    if (dir.lengthSq() < .00001) dir.set(0, 0, 1);
    e.a.copy(dir).normalize();
    side.crossVectors(e.a, UP).normalize();
    if (side.lengthSq() < .01) side.set(1, 0, 0);
    e.pose.quaternion.setFromUnitVectors(FORWARD, e.a);
    if (o.type === 'ball' || o.type === 'disc' || o.type === 'ring') {
      e.pose.rotateX(o.type === 'ball' ? (o.rotX || 0) * .77 : .12 * Math.sin(age * 19));
      e.pose.rotateY(o.type === 'disc' || o.type === 'ring' ? o.rotY || 0 : 0);
      if (o.type === 'ring') e.pose.rotateZ(.22 * Math.sin(age * 11));
    } else if (o.type === 'lob') {
      e.pose.rotateZ((o.rotZ || 0) + .15 * Math.sin(age * 12));
      e.pose.rotateX(age * 2.9);
    } else if (o.type === 'bolt') {
      e.pose.rotateZ(age * 17 + o.id * .22);
    } else if (o.type === 'rocket' || o.type === 'cursor') {
      e.pose.rotateZ(.10 * Math.sin(age * (o.type === 'rocket' ? 17 : 21)));
    }
    const squash = o.type === 'ball' ? 1 + .072 * Math.sin(age * 20) : 1;
    const pulse = o.type === 'lightbolt' ? .93 + .11 * Math.sin(age * 43) : 1;
    const kick = o.type === 'lob' ? 1 + .13 * Math.sin(age * 14) : 1;
    e.pose.scale.set((o.scaleX ?? 1) * squash * pulse * kick, (o.scaleY ?? 1) * (2 - squash) * pulse / kick, (o.scaleZ ?? 1));
    e.pose.position.set(0, o.type === 'ball' ? .044 * Math.abs(Math.sin(age * 20)) : 0, 0);
    const rear=-(o.scaleZ??1)*r.rear;
    // Direction is the sampled flight vector. Twisting tail-led models use their
    // own pose basis so wakes remain seated through swerves and ribbon rolls.
    headOffset.set(0,r.type==='rocket'?.1452*e.pose.scale.y:0,rear);
    const articulated=r.type==='rocket'||r.type==='lock'||r.type==='laser'||r.type==='confetti';
    if(articulated)headOffset.applyQuaternion(e.pose.quaternion).add(e.pose.position);
    else headOffset.copy(e.a).multiplyScalar(rear);
    e.emit.copy(pNow).add(headOffset);
    normal.crossVectors(side,e.a).normalize();
    tmpA.copy(headOffset);
    let sCount=0,hCount=0,pCount=0, walked=0;

    if(r.type==='rocket'||r.type==='laser'||r.type==='confetti'||r.type==='lock'){
      const taper=.80+.20*Math.sin(clock*(r.type==='rocket'?57:51)+o.id*.61);
      const close=r.type==='rocket'?(1.23+.64*taper):r.type==='laser'?.51:.37;
      for(const j of r.type==='rocket'?NOZZLES:CENTER){
        const strength=j===0?1:.64;
        if(r.type==='rocket'){
          // Measured aperture centers of the approved normalized model (unit pose).
          e.b.set(.1891*j*e.pose.scale.x,(j===0?.1452:-.0726)*e.pose.scale.y,rear)
            .applyQuaternion(e.pose.quaternion).add(e.pose.position);
        } else e.b.copy(headOffset);
        tmpC.copy(e.b).addScaledVector(e.a,-close*strength);
        segment(e.trail,sCount++,e.b,tmpC,r.width*(.84+.24*taper)*strength,r.width*(.66+.38*taper)*strength);
      }
    }

    for(let i=0;i<e.size;i++){
      const k=((e.head-i+n)%n)*3;
      tmpB.fromArray(e.history,k).sub(pNow);
      const distance=tmpA.distanceTo(tmpB);
      if(distance<.087)continue;
      if(walked>=r.tail)break;
      if(walked+distance>r.tail)tmpB.lerp(tmpA,1-(r.tail-walked)/distance);
      walked=Math.min(r.tail,walked+distance);
      const taper=Math.max(.035,(1-Math.max(i/n*.82,walked/r.tail*.75))**1.02);
      if(r.type==='twin'){
        for(const j of WINGS){
          e.b.copy(tmpA).addScaledVector(side,j*(.39+i*.024));
          tmpC.copy(tmpB).addScaledVector(side,j*(.42+i*.026));
          segment(e.trail,sCount++,e.b,tmpC,r.width*taper,r.width*taper*.45);
        }
      }else if(r.type!=='droplets'&&((r.type!=='hoop'&&r.type!=='embers'&&r.type!=='confetti')||i%2===0)&&
        (r.type!=='rocket'||walked<4.25)){
        const thickness=r.type==='laser'?.48:r.type==='lock'?.61:1;
        const hot=r.type==='rocket'?.96-i/n*.66:1;
        if(r.type==='embers'||r.type==='confetti'){
          tmpC.copy(tmpA).lerp(tmpB,r.type==='embers'?.58:.69);
          segment(e.trail,sCount++,tmpA,tmpC,r.width*taper*hot,r.width*taper*thickness*hot);
        }else segment(e.trail,sCount++,tmpA,tmpB,r.width*taper*hot,r.width*taper*thickness*hot);
      }
      if(r.type==='rocket'){
        // Discrete puffs rise and spread instead of a full-width opaque trail.
        tmpC.copy(tmpB).addScaledVector(normal,.049*i+.019*i*i).addScaledVector(side,.092*i*Math.sin(clock*10.8+i*2.36));
        const billow=.13+.061*i;
        bead(e.haze,hCount++,tmpC,billow*.92,billow*.75,billow*1.43,age*1.9+i);
      }else if((r.type!=='droplets'||i%2===0)&&(r.type!=='embers'||i<3)){
        segment(e.haze,hCount++,tmpA,tmpB,r.border*taper,r.border*taper*(r.type==='embers'?.58:.53));
      }
      if(r.type==='hoop'){
        const radius=(.35+i*.102)*Math.max(.46,taper);
        tmpC.copy(tmpB).addScaledVector(normal,.083*Math.sin(i*.79+age*12));
        oriented(e.sparks,pCount++,tmpC,e.a,radius,radius,.55,age*9+i*.74);
      }else if(r.type!=='laser'){
        const repeats=r.type==='confetti'||r.type==='twin'||r.type==='lock'?2:1;
        for(let j=0;j<repeats;j++){
          const theta=clock*(r.type==='lock'?21:16)+i*2.04+j*Math.PI;
          const spread=r.type==='confetti'?.71:r.type==='twin'?.62:r.type==='lock'?.43:.225;
          tmpC.copy(tmpB).addScaledVector(side,Math.cos(theta)*spread*taper);
          tmpC.addScaledVector(normal,Math.sin(theta)*spread*taper+(r.type==='droplets'?-i*.072:r.type==='embers'?.041*i:0));
          const w=(r.type==='droplets'?.23:r.type==='confetti'?.19:r.type==='rocket'?.14:.12)*taper;
          if(r.type==='droplets'){
            bead(e.sparks,pCount++,tmpC,w*1.23,w*1.07,w*.89,theta);
          }else if(r.type==='confetti'){
            oriented(e.sparks,pCount++,tmpC,e.a,w*.94,w*.38,w*(1.26+j*.22),theta);
          }else{
            oriented(e.sparks,pCount++,tmpC,e.a,w,w*.70,w*(r.type==='rocket'?2.6:1.9),theta);
          }
        }
      }
      tmpA.copy(tmpB);
    }
    finish(e.trail,sCount);finish(e.haze,hCount);finish(e.sparks,pCount);
    if (e.roadCue) {
      const floor = road.position.y;
      e.roadCue.position.set(0, floor + .064 - o.y, 0);
      const scale = (o.type === 'lob' ? .66 + Math.max(0, o.y - floor) * .081 : .68) * (.87 + .17 * Math.sin(clock * 15));
      e.roadCue.scale.set(scale, 1, scale);
      e.roadCue.rotation.set(road.grade ?? 0, Math.atan2(road.forward?.x??0,road.forward?.z??1), road.bank ?? 0,'YXZ');
    }
    if (e.lock) {
      const target = o.target?.kart;
      e.lock.visible = Boolean(target && !target.fall);
      if (e.lock.visible) {
        loc(target.s, target.x, target.y + .20, tmpA);
        e.lock.position.copy(tmpA).sub(pNow);
        e.lock.scale.setScalar(.90 + .13 * Math.sin(age * 17));
        e.lock.rotation.y = age * (o.type === 'rocket' ? 4.4 : -2.1);
        e.lockTicks.count=4;
      }
    }
    writeHistory(e,e.emit,clock);
  }

  function drawPulse(o, e, age) {
    const phase = clamp(1 - o.life / .34, 0, 1);
    const radius = Math.max(.05, o.radius ?? 1);
    const leading = radius * Math.max(.04, phase);
    const fade = Math.pow(1 - phase, .58);
    const rings = [e.wave, e.echo, e.flash];
    for (let i = 0; i < rings.length; i++) {
      const radiusNow = leading * (i === 0 ? 1 : i === 1 ? .713 : .920);
      rings[i].rotation.set(-Math.PI / 2,0,i===2?age*10:0);
      rings[i].position.y = (i - 1) * (.045 + phase * .095);
      rings[i].scale.set(radiusNow, radiusNow, Math.max(.013, radiusNow * fade * (i === 0 ? .62 : .49)));
      rings[i].visible = phase < (i === 2 ? .79 : .97);
    }
    for (let i = 0; i < 18; i++) {
      const theta = i * TAU / 18 + age * 1.35;
      const r = leading * (.89 + .105 * Math.sin(i * 4.1));
      const pulseLift = .11 + Math.sin(phase * Math.PI) * (.15 + .19 * Math.sin(i * 2.3) ** 2);
      tmpA.set(Math.cos(theta) * r, pulseLift, Math.sin(theta) * r);
      const scale = Math.min(.19, .035 * radius) * fade * (.72 + .28 * Math.cos(i * 1.7 + age * 19));
      bead(e.dashes, i, tmpA, scale * .78, scale, scale * 1.32, theta);
    }
    finish(e.dashes, 18);
  }

  function drawShield(o, e, age) {
    const breathe = 1 + .036 * Math.sin(age * 5.4);
    const grow = .80 + .20 * clamp(age * 8.8, 0, 1);
    const x = (o.scaleX ?? 1) * breathe * grow;
    const y = (o.scaleY ?? 1) * grow;
    const z = (o.scaleZ ?? 1) * breathe * grow;
    e.pose.scale.set(x, y, z);
    e.pose.rotation.set(0, age * .44, 0);
    e.film.rotation.set(Math.PI / 2 + Math.sin(age * 2.17) * .13, age * .67, 0);
    e.film.scale.set(x, z, y * .89);
    e.guard.rotation.set(Math.PI / 2 - .56, -age * .79, age * .33);
    e.guard.scale.set(x * .94, z * .9, y * .7);
    const h = Math.sin(age * 2.95) * .59;
    const ringScale = Math.sqrt(1 - h * h) * .968;
    e.scan.rotation.x = Math.PI / 2;
    e.scan.position.y = h * y;
    e.scan.scale.set(x * ringScale, z * ringScale, .56);
    for (let i = 0; i < 8; i++) {
      const q = i * TAU / 8 + age * .95;
      tmpA.set(Math.sin(q) * x * .99, Math.cos(q * 1.5 + age) * y * .20, Math.cos(q) * z * .99);
      const v = .045 + .022 * Math.sin(age * 17 + i * 1.5);
      bead(e.sparks, i, tmpA, v, v * 1.65, v, q);
    }
    finish(e.sparks, 8);
  }

  function drawGround(o, e, road, age) {
    const floor = road.position.y + .053 - e.group.position.y;
    const bank = road.bank ?? 0, grade = road.grade ?? 0;
    if (o.type === 'slip') {
      const tremble = .92 + .064 * Math.sin(age * 5.8);
      e.pose.position.y = -.058;
      e.pose.scale.y *= 1 + .19 * Math.sin(age * 6.7);
      e.pose.rotateZ(.031 * Math.sin(age * 8.0));
      e.pool.position.y = floor;
      e.pool.rotation.set(grade, 0, bank);
      e.pool.scale.set(2.02 * tremble, 1, 1.50 * tremble);
      e.lip.position.y = floor + .008;
      e.lip.rotation.copy(e.pool.rotation);
      const swell=.5+.5*Math.sin(age*5.28-.6);
      const spread=.72+.28*swell;
      e.lip.scale.set(2.04 * spread, 1, 1.49 * spread);
      for (let i = 0; i < 7; i++) {
        const p = (age * (.68 + i * .04) + i * .31) % 1;
        const bounce = Math.sin(p * Math.PI);
        const th = (i + .1) * TAU / 7;
        tmpA.set(Math.sin(th) * (1.32 + .26 * p), floor + .037 + .26 * bounce, Math.cos(th) * (1.04 + .20 * p));
        const size = .033 + .083 * bounce;
        bead(e.drops, i, tmpA, size, size * (.69 + .31 * bounce));
      }
      finish(e.drops, 7);
    } else if (o.type === 'box' || o.type === 'attached') {
      const attached = o.type === 'attached';
      const heat = .84 + .16 * Math.sin(age * (attached ? 25 : 7.6));
      if (!attached) {
        e.pose.position.y = .031 * Math.sin(8 * age);
        e.pose.rotateY(.12 * Math.sin(age * 2.6));
        e.pose.scale.y *= heat;
      } else {
        // Latch over the victim rather than flashing below the road before its first core tick.
        e.pose.position.y = o.height > 1 ? .03 : (o.owner?.kart?.y ?? 0) + 2.9;
        e.pose.rotateZ(.17 * Math.sin(age * 18));
        e.pose.rotateX(.12 * Math.sin(age * 14));
        e.pose.scale.set(heat, 1.0 + (1 - heat) * .37, heat);
      }
      e.base.visible = !attached;
      e.base.position.y = floor;
      e.base.rotation.set(grade, 0, bank);
      e.base.scale.set(1.46 * heat, 1, 1.37 * heat);
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8 + age * (attached ? -1.73 : .26);
        const pulse = .07 + .058 * Math.sin(age * 8.6 + i);
        const r = attached ? .79 + .13 * Math.sin(age * 7 + i) : 1.31;
        tmpA.set(Math.sin(angle) * r, attached ? e.pose.position.y + .06 + .24 * Math.sin(angle * 2 + age * 9) : floor + .11, Math.cos(angle) * r);
        bead(e.corner, i, tmpA, pulse, pulse * 1.43, pulse * 1.18, angle);
      }
      finish(e.corner, 8);
    } else if (o.type === 'strip') {
      const yaw = o.rotY || 0;
      e.lane.position.set(0, floor + .058, 0);
      e.lane.rotation.set(grade, yaw, bank, 'YXZ');
      e.lane.scale.set(o.scaleX ?? 1, 1, o.scaleZ ?? 1);
      for (let i = 0; i < 4; i++) {
        const progress = (age * 1.30 + i / 4) % 1;
        const m = e.chevrons[i];
        m.position.set(0, .012, -.44 + .88 * progress);
        m.scale.set(.78 + .11 * Math.sin(progress * Math.PI), 1, .31 + .08 * Math.sin(progress * Math.PI));
      }
    } else if (o.type === 'puck') {
      const armed = age >= .45;
      const dial = clamp(age / .45, 0, 1);
      e.arming.position.y = floor + .011;
      e.arming.rotation.set(-Math.PI/2+grade,0,age*(armed?-2.2:1.4),'YXZ');
      const outer = armed ? .90 + .11 * Math.sin(age * 13) : .76 + .27 * dial;
      e.arming.scale.set(outer,outer,.67);
      e.radius.position.y = floor + .024;
      e.radius.rotation.set(grade,0,bank);
      const alarm=armed?2.27+.69*(1-Math.cos(TAU*((age*1.65)%1)))*.5:.83+.17*dial;
      e.radius.visible = armed;
      e.radius.scale.set(alarm, 1, alarm);
      e.pose.position.y=armed?.047+.037*Math.sin(age*17):-.022;
      e.pose.rotateX(armed ? .046 * Math.sin(age * 17) : 0);
      for (let i = 0; i < 12; i++) {
        const t = i * TAU / 12 + age * (armed ? -2.84 : 1.76), step = (age * 3.7 + i / 12) % 1;
        const r = armed ? 1.19 + step * 1.28 : outer;
        tmpA.set(Math.sin(t) * r, floor + .055 + Math.sin(step * Math.PI) * (armed ? .37 : .13), Math.cos(t) * r);
        bead(e.sparks, i, tmpA, .06 + .033 * Math.sin(step * Math.PI), .16 - step * .068, .061, t);
      }
      finish(e.sparks, armed ? 12 : Math.ceil(dial * 12));
    }
  }

  function drawFlair(o, e, age) {
    const style = e.flair.style;
    const enter = clamp(age * 10.5, 0, 1);
    const vanish = clamp(o.life * (style === 'bass' ? 3.5 : 4.4), 0, 1);
    const t = clamp(age / .48, 0, 1);
    const size = enter * vanish;
    const flutter = Math.sin(age * (style === 'spring' ? 31 : 16));
    e.pose.rotateX((style === 'spring' ? .31 : .15) * flutter);
    e.pose.rotateZ((style === 'siphon' ? .28 : .14) * Math.sin(age * 12.6));
    e.pose.scale.multiplyScalar(.84 + .16 * enter);
    if (style === 'spring') e.pose.scale.y *= .75 + .31 * enter + .12 * flutter;
    if (style === 'triple') e.pose.rotateY(age * 4.4);
    if (style === 'comet') e.pose.rotateZ(-age * 5.7);
    // Radial speaker wave, spring coil, siphon spool and turbo halo read differently.
    const band = style === 'bass' ? .54 + t * 1.38 : style === 'comet' ? .63 + .22 * t : .38 + t * .64;
    e.hoop.scale.set(band * (.76 + size * .23), band, Math.max(.02, size * .60));
    e.hoop.position.y = style === 'spring' ? -.19 - .22 * t : style === 'bass' ? -.38 : -.18;
    e.hoop.rotation.set(style === 'siphon' ? .26 : Math.PI / 2 + .21 * Math.sin(age * 6.12), 0, style === 'spool' ? age * 10.8 : 0);
    const count = style === 'triple' || style === 'comet' || style === 'bass' ? 9 : 6;
    for (let i = 0; i < count; i++) {
      const a = i * TAU / count + age * (style === 'spool' ? 16 : style === 'comet' ? -12 : 8);
      const spiral = style === 'comet' ? .34 + .16 * t + i * .05 : style === 'bass' ? band : .29 + .49 * t;
      const spread = ((i + age * 14) % 3) / 3;
      tmpA.set(Math.cos(a) * spiral, style === 'spring' ? -.16 - spread * .36 : (spread - .46) * (.20 + t * .60), Math.sin(a) * spiral);
      const spark = size * (.082 + spread * .051);
      bead(e.sparks, i, tmpA, spark, spark * (style === 'rise' || style === 'triple' ? 2.12 : 1.36), spark * .87, a);
    }
    finish(e.sparks, count);
  }

  function drawBroom(o, e, age) {
    const heading = age * 6;
    e.pose.rotateX(.14 * Math.sin(heading * 2));
    e.pose.rotateZ(.21 * Math.sin(heading));
    e.pose.position.y = .068 * Math.sin(age * 10);
    e.sweep.rotation.set(.12, heading, .07);
    e.sweep.position.y = -.39;
    const reach = 1.06 + .20 * Math.sin(18 * age);
    e.sweep.scale.set(reach, 1, reach * .79);
    for (let i = 0; i < 12; i++) {
      const tail = (i + 1) / 12;
      const theta = heading - tail * 2.51;
      const phi = 1.45 + tail * .60;
      tmpA.set(Math.sin(theta) * phi, -.28 + .13 * Math.sin(age * 11 + i), Math.cos(theta) * phi);
      bead(e.sparks, i, tmpA, (.13 - tail * .069), .055, .14 - tail * .099, theta);
    }
    finish(e.sparks, 12);
  }

  function syncObjectMesh(o, e, clock) {
    e.group.visible = o.visible !== false;
    const age = Math.max(0, clock - (o.born ?? clock));
    if (!e.group.visible) return;
    if (o.type === 'cable' || o.type === 'beam') { renderTethers(o, e, clock, age); return; }
    const road = sample(o.s, o.x);
    pNow.set(road.position.x, o.y, road.position.z);
    e.group.position.copy(pNow);
    e.pose.rotation.set(o.rotX || 0, o.rotY || 0, o.rotZ || 0, o.rotOrder || 'XYZ');
    e.pose.position.set(0, 0, 0);
    e.pose.scale.set(o.scaleX ?? 1, o.scaleY ?? 1, o.scaleZ ?? 1);
    if (e.rule) renderTrail(o, e, road, clock, age);
    else if (o.type === 'pulse') drawPulse(o, e, age);
    else if (o.type === 'shield') drawShield(o, e, age);
    else if (o.type === 'flair') drawFlair(o, e, age);
    else if (o.type === 'broom') drawBroom(o, e, age);
    else drawGround(o, e, road, age);
  }

  function acquireMesh(o, clock) {
    const key = poolKey(o);
    const bucket = freePool.get(key);
    const e = bucket?.length ? bucket.pop() : buildEntry(o, key);
    if (bucket && !bucket.length) freePool.delete(key);
    if (e.inPool) { e.inPool = false; pooled--; }
    e.head = -1; e.size = 0; e.lastSample = -Infinity;
    for (const m of e.owned) m.count = 0;
    activeMeshes.set(o.id, e);
    root.add(e.group);
    syncObjectMesh(o, e, clock);
  }

  function disposeEntry(e) {
    e.group.removeFromParent();
    for (const m of e.owned) m.dispose();
    // Item-art templates and effect geometries/materials are shared, not entry-owned.
    e.group.clear();
  }

  function releaseMesh(o) {
    const e = activeMeshes.get(o.id);
    if (!e) return;
    activeMeshes.delete(o.id);
    root.remove(e.group);
    const bucket = freePool.get(e.key);
    if (disposed || pooled >= POOL_MAX || (bucket?.length ?? 0) >= POOL_PER_KEY) {
      disposeEntry(e); return;
    }
    if (!bucket) freePool.set(e.key, [e]);
    else bucket.push(e);
    e.inPool = true; pooled++;
  }

  function hideMesh(o) {
    const e = activeMeshes.get(o.id);
    if (e) e.group.visible = false;
  }

  function syncAll(objects, clock) {
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i], e = activeMeshes.get(o.id);
      if (e) syncObjectMesh(o, e, clock);
    }
  }

  const core = createGameplayCore(track, {
    onSpawn: acquireMesh,
    onRemove: releaseMesh,
    onHide: hideMesh,
    onSync: syncAll,
    onVisualCue,
  });

  function setTrack(next) {
    core.setTrack(next);
    track = next;
  }

  function syncFromCore() {
    syncAll(core.objects, core.elapsed);
  }

  // Race-load shader warm-up: one of every item visual, in the scene until the returned function runs.
  function warmVisuals() {
    const kinds = [...Object.keys(FLIGHT), 'pulse', 'cable', 'beam', 'shield', 'slip', 'box', 'strip', 'puck', 'broom']
      .map((type) => ({ type }));
    for (const itemType of Object.keys(FLAIR)) kinds.push({ type: 'flair', itemType });
    kinds.push({ type: 'attached', itemType: 'box' });
    const built = kinds.map((o) => buildEntry(o, poolKey(o)));
    for (const e of built) root.add(e.group);
    return () => { for (const e of built) disposeEntry(e); };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    core.reset();
    for (const list of freePool.values()) for (const e of list) disposeEntry(e);
    freePool.clear();
    pooled = 0;
    root.removeFromParent();
    for (const geometry of Object.values(geometries)) geometry.dispose();
    for (const m of materials.values()) m.dispose();
    materials.clear();
  }

  return {
    core,
    setTrack,
    reset: core.reset,
    dispose,
    withdraw: core.withdraw,
    use: core.use,
    fireBlasters: core.fireBlasters,
    update: core.update,
    decide: core.decide,
    hitHazard: core.hitHazard,
    skyGot: core.skyGot,
    syncFromCore,
    warmVisuals,
  };
}
