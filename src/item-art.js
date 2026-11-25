import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Each opaque item is baked once. Every shot of that design shares one mesh layout.
const shapes={
  box:new THREE.BoxGeometry(), gem:new THREE.IcosahedronGeometry(1,0),
  orb:new THREE.IcosahedronGeometry(1,1), diamond:new THREE.OctahedronGeometry(1),
  tube:new THREE.CylinderGeometry(.5,.5,1,8), cone:new THREE.ConeGeometry(.5,1,8),
  ring:new THREE.TorusGeometry(.83,.12,4,12), fin:new THREE.ConeGeometry(.5,1,3),
};
const ink=0x223445, cream=0xfff3c8, mint=0x67edce, orange=0xff784e, gold=0xffcb56;
const X=Math.PI/2, templates=new Map();
const paint=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});
const film=new THREE.MeshBasicMaterial({color:0x73edff,transparent:true,opacity:.15,depthWrite:false});
const lattice=new THREE.MeshBasicMaterial({color:0x78edff,transparent:true,opacity:.32,wireframe:true,depthWrite:false});

function build(type){
  const parts=[];
  function part(shape,color,x,y,z,w,h,d,rx=0,ry=0,rz=0){
    let g=shapes[shape];
    g=g.index?g.toNonIndexed():g.clone();
    g.deleteAttribute('uv');
    g.scale(w,h,d);g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);
    const tint=new THREE.Color(color),n=g.attributes.position.count,colors=new Float32Array(n*3);
    for(let i=0;i<n;i++)tint.toArray(colors,i*3);
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);
  }
  function can(x,y,z,scale,color){
    const band=(at,r,h,c)=>part('tube',c,x,y+at*scale,z,r*scale,h*scale,r*scale);
    band(0,1.08,1.5,color);band(.68,1.13,.15,cream);band(-.68,1.13,.15,ink);
    band(-.21,1.10,.27,ink);part('box',cream,x,y+.18*scale,z+.49*scale,.22*scale,.52*scale,.09*scale,0,0,-.38);
  }
  function dart(color,heavy){
    const size=heavy?1.23:1;
    part('tube',ink,0,0,-.02,.83*size,1.65,.83*size,X);
    part('cone',color,0,0,.97,1.02*size,1.05,1.02*size,X);
    part('tube',cream,0,0,.35,.89*size,.21,.89*size,X);
    part('cone',gold,0,0,-1.03,.46,.68,.46,-X);
    for(const side of [-1,1])part('fin',color,side*.47*size,0,-.54,.66,.86,.32,-X,side*.2);
  }
  switch(type){
    case 'pickup':
      part('box',0xc6ed68,0,0,0,1.33,1.27,1.33);
      for(const y of [-.60,.60])part('box',ink,0,y,0,1.46,.16,1.46);
      for(let side=0;side<4;side++){
        const angle=side*X;
        const mark=(y,w,h)=>part('box',ink,Math.sin(angle)*.68,y,Math.cos(angle)*.68,w,h,.045,0,angle);
        mark(.10,.16,.43);mark(-.26,.18,.15);
      }
      break;
    case 'soda':can(0,0,0,1,0xa7dd44);break;
    case 'triple':for(const [x,y,z] of [[-.43,-.24,.15],[.43,-.24,.15],[0,.42,-.32]])can(x,y,z,.75,gold);break;
    case 'ball':
      part('orb',orange,0,0,0,.83,.83,.83);part('ring',ink,0,0,0,.91,.91,1.1,X);
      for(const z of [-.73,.73])part('diamond',cream,0,0,z,.28,.28,.14);break;
    case 'bubble':
      part('ring',mint,0,0,0,1,1,.46,X);part('ring',0x4bbccc,0,0,0,1,1,.35,.18,.4,.65);
      part('gem',cream,-.52,.57,.43,.11,.17,.1);break;
    case 'slip':
      part('gem',0xac79ef,0,-.04,0,1,.68,.88);
      part('orb',0xc39af4,.29,.27,.16,.56,.63,.54);
      for(const x of [-.24,.18])part('diamond',ink,x,.30,.6,.085,.15,.09);break;
    case 'box':
      part('box',orange,0,0,0,1,1,1);part('box',cream,0,.07,0,1.035,.21,1.035);
      part('box',ink,0,.47,0,1.1,.17,1.1);
      for(const z of [-.51,.51])part('diamond',ink,0,-.1,z,.20,.26,.05);break;
    case 'cursor':
      part('fin',0xff579e,0,0,.22,1.4,1.65,.60,X);
      part('box',ink,0,0,-.62,.49,.31,.86);part('box',cream,0,.18,-.42,.18,.08,.63);
      part('cone',0xffbbde,0,0,-1.1,.36,.55,.36,-X);break;
    case 'speaker':
      part('box',ink,0,0,0,1.15,1.48,.67);
      for(const [y,r] of [[-.26,.88],[.38,.45]]){
        part('tube',0xaf71e9,0,y,.37,r,.17,r,X);part('tube',ink,0,y,.47,r*.67,.13,r*.67,X);
        part('diamond',cream,0,y,.54,r*.22,r*.22,.08);
      }break;
    case 'spool':
      part('tube',mint,0,0,0,.89,.95,.89,0,0,X);
      for(const x of [-.49,.49])part('tube',ink,x,0,0,1.42,.2,1.42,0,0,X);
      part('ring',cream,.45,-.42,.55,.46,.58,.7);break;
    case 'strip':
      part('box',ink,0,0,0,1,.07,1);
      for(const x of [-1,1])part('box',mint,x*.16,.06,.03,.115,.04,.52,0,-x*.62);break;
    case 'disc':
      part('tube',ink,0,0,0,2.1,.33,2.1);part('tube',0x42d3ed,0,.13,0,1.77,.27,1.77);
      part('diamond',cream,0,.29,0,.44,.23,.44);
      for(const x of [-.78,.78])part('box',gold,x,.18,0,.29,.13,.35);break;
    case 'fan':
      for(const side of [-1,0,1]){
        const color=[0x68efea,0xff79ae,gold][side+1];
        part('diamond',color,side*.55,0,.13-Math.abs(side)*.24,.28,.28,.96,0,side*.3);
        part('gem',cream,side*.65,0,.65-Math.abs(side)*.24,.14,.14,.22);
      }break;
    case 'lightbolt':
      part('tube',0x5bf7ff,0,0,0,.19,.65,.19,X);
      part('orb',0xd9ffff,0,0,.30,.10,.10,.16);break;
    case 'bolt':
      part('diamond',0xff80b6,0,0,0,.31,.31,.84);part('cone',gold,0,0,-.67,.34,.67,.34,-X);break;
    case 'lob':
      part('orb',0x8bcf43,0,-.06,0,.78,.69,.78);
      part('ring',cream,0,.08,0,.89,.89,.77,X);part('tube',ink,0,.58,0,.5,.34,.5);
      part('gem',gold,.12,.91,0,.2,.29,.2);break;
    case 'ring':
      part('ring',gold,0,0,0,1.28,1.28,1.35,X);
      for(const x of [-.98,.98])part('fin',orange,x,0,0,.48,.67,.4,X,0,.22);break;
    case 'puck':
      part('tube',ink,0,-.12,0,1.85,.42,1.85);part('tube',0x9c67ed,0,.12,0,1.44,.24,1.44);
      part('diamond',0xf1ccff,0,.39,0,.42,.47,.42);
      for(const x of [-.67,.67])part('cone',gold,x,.23,0,.26,.57,.26);break;
    case 'broom':
      part('orb',mint,0,.04,0,.74,.43,.62);part('box',ink,0,.09,.55,.88,.21,.16);
      for(const x of [-.31,.31])part('box',cream,x,.1,.65,.17,.10,.06);
      for(const x of [-.53,0,.53])part('cone',gold,x,-.37,-.23,.52,.57,.56,Math.PI);
      part('ring',ink,0,.32,0,.65,.65,.4,X);break;
    case 'spring':
      part('box',orange,0,-.52,.15,1.18,.27,1.52);part('box',ink,0,.48,0,.98,.22,1.19);
      for(const y of [-.30,-.05,.20])part('ring',cream,0,y,0,.54,.54,.8,X,0,.14);break;
    case 'siphon':
      part('tube',mint,0,0,0,.75,1.45,.75,X);
      for(const z of [-.69,.69])part('tube',ink,0,0,z,1.24,.20,1.24,X);
      part('cone',cream,0,0,.95,1.07,.52,1.07,-X);break;
    case 'rocket':dart(0xff604e,true);break;
    case 'comet':
      part('orb',gold,0,0,.17,.79,.76,.83);part('ring',cream,0,0,.17,.93,.93,.8,.9,.3);
      part('cone',orange,0,0,-.91,.91,1.38,.91,-X);break;
    default:throw Error('Unknown item model '+type);
  }
  const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
  const model=new THREE.Mesh(geometry,paint);
  if(type==='bubble'){model.add(new THREE.Mesh(shapes.orb,film),new THREE.Mesh(shapes.orb,lattice));}
  model.name=type;
  return model;
}

export function itemModel(type){
  if(!templates.has(type))templates.set(type,build(type));
  return templates.get(type).clone();
}

const trailShape=new THREE.ConeGeometry(.5,1,4).rotateX(-X).translate(0,0,-.5);
const trails=new Map();
export function projectileModel(type,tint){
  const model=itemModel(type);
  if(type==='lightbolt'||type==='bolt'||type==='cursor'||type==='rocket'){
    const color=tint??(type==='rocket'?0xffad4a:0xff98cc);
    if(!trails.has(color))trails.set(color,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.68,depthWrite:false}));
    const trail=new THREE.Mesh(trailShape,trails.get(color));
    trail.position.z=type==='lightbolt'?-.22:type==='bolt'?-.48:-.87;
    trail.scale.set(.44,.44,2);
    model.add(trail);model.userData.trail=trail;
  }
  return model;
}
