import * as T from 'three';
import {assembly,alloyReflections} from './kart-assembly.js';
import {kartDetail} from './kart-detail.js';
import outletsByCar from './concepts/exhaust.json' with {type:'json'};

// Outlet coordinates use the body-local frame: Z+ points back. The hardware and
// particle rig share one origin, so turn, hop, hover and hit-roll stay aligned.
const byCar = new Map(Object.entries(outletsByCar));
const templateSets = [new Map(),new Map()];
const steel = new T.MeshStandardMaterial({vertexColors:true,roughness:.29,metalness:.69,envMap:alloyReflections(),envMapIntensity:.85,side:T.DoubleSide});
const flashRing = new T.TorusGeometry(1,.10,8,26);

function nozzleShell(depth,r,jet){
  const throat=r*(jet?.72:.73);
  // Closed annular wall with a real hollow center, tapering at the mounting end.
  return new T.LatheGeometry([
    [throat*.67,-depth],[r*.76,-depth],[r*.85,-depth*.67],[r*.94,-depth*.24],
    [r,-depth*.12],[r,-.013],[r*.94,0],[throat,0],
    [throat*.92,-.025],[throat*.67,-depth],
  ].map(([x,y])=>new T.Vector2(x,y)),20).rotateX(Math.PI/2);
}

function hardware(carId,specs){
  const templates=templateSets[kartDetail()];
  if(templates.has(carId))return templates.get(carId);
  const parts=assembly(steel);
  for(const spec of specs){
    const {x,y,z,r,kind,paint}=spec,jet=kind==='jets';
    const depth=spec.depth??(jet?.22:.19);
    const add=(geometry,color,p=[0,0,0],angle=0)=>parts.add(geometry,steel,
      color,[x+p[0],y+p[1],z+p[2]],[0,0,angle]);
    add(nozzleShell(depth,r,jet),jet?'#7e98a5':'#a8adb1');
    add(new T.CylinderGeometry(r*.52,r*.52,.014,20).rotateX(Math.PI/2),'#111015',[0,0,-depth*.82]);
    add(new T.TorusGeometry(r*.855,r*.060,6,22),paint??(jet?'#4fc9de':'#76614a'),[0,0,-.008]);
    add(new T.TorusGeometry(r*.86,r*.090,6,22),jet?'#455768':'#686976',[0,0,-depth*.55]);
    if(jet)for(let i=0;i<4;i++){
      const a=i*Math.PI*.5+Math.PI*.25;
      add(new T.BoxGeometry(r*.23,r*.16,depth*.47),paint??'#6cd9eb',
        [Math.cos(a)*r*.85,Math.sin(a)*r*.85,-depth*.49],a);
    }
  }
  // All static outlets share one cached body-space mesh and one draw call.
  const [built]=parts.finish();
  templates.set(carId,built);
  return built;
}

// An uncapped, tapered pulse extends from exactly z=0, with no phantom gap.
function plumeGeometry(){
  const geometry=new T.LatheGeometry([
    [1,0],[1.02,.04],[1.22,.14],[1.57,.28],[1.52,.40],[1.19,.57],[.86,.70],[.49,.86],[.20,.96],[0,1]
  ].map(([x,y])=>new T.Vector2(x,y)),16).rotateX(Math.PI/2);
  const coords=geometry.attributes.position,colors=new Float32Array(coords.count*3);
  for(let i=0;i<coords.count;i++){
    const z=coords.getZ(i), a=1-.43*T.MathUtils.smoothstep(z,.22,1);
    colors.set([a,a,a],i*3);
  }
  geometry.setAttribute('color',new T.BufferAttribute(colors,3));
  return geometry;
}
const plume = plumeGeometry();
function buildFlame(spec,index) {
  const nozzle=new T.Group();
  nozzle.name='boost-effect';nozzle.visible=false;
  const outerPaint=new T.MeshBasicMaterial({color:0x409eff,transparent:true,opacity:.83,depthWrite:false,toneMapped:false,vertexColors:true});
  const corePaint=new T.MeshBasicMaterial({color:0xdef9ff,toneMapped:false,vertexColors:true});
  const ringPaint=new T.MeshBasicMaterial({color:0xbbdeff,transparent:true,depthWrite:false,toneMapped:false});
  const outer=new T.Mesh(plume,outerPaint),core=new T.Mesh(plume,corePaint),ring=new T.Mesh(flashRing,ringPaint);
  // Geometry is module-owned; its instance materials still get disposed normally.
  for(const piece of [outer,core,ring]){piece.userData.sharedExhaustGeometry=true;nozzle.add(piece);}
  return {nozzle,outer,core,ring,index,spec,outerPaint,corePaint,ringPaint};
}

export function mountExhausts(body,carId){
  const specs=byCar.get(carId);
  if(!specs?.length)throw new Error('No exhaust mounting data for '+carId);
  const outletMesh=hardware(carId,specs).clone();
  outletMesh.name='exhaust-hardware';
  outletMesh.userData.sharedKartPart=true;
  body.add(outletMesh);
  return specs.map((spec,index)=>{
    const {x,y,z}=spec;
    const aperture=new T.Vector3(x,y,z);
    const effect=buildFlame(spec,index);
    effect.nozzle.position.copy(aperture);
    body.add(effect.nozzle);
    return {...effect,hardware:[outletMesh],aperture};
  });
}

// skyTier >= 0 while flying a Sky Lane: the exhaust burns hot, longer per tier, gold at tier 3.
export function animateExhausts(flames,b,time,skyTier=-1){
  const flying=skyTier>=0,flash=b.ignition||0,power=flying?1.05+.28*skyTier:(b.plume||0);
  const superFire=flying?skyTier>=2:b.flameTier===2,gold=skyTier>=3;
  for(const {nozzle,outer,core,ring,index,spec,outerPaint,corePaint,ringPaint} of flames){
    nozzle.visible=power>.015||flash>.02;
    if(!nozzle.visible)continue;
    const jet=spec.kind==='jets';
    const ripple=1+.095*Math.sin(time*34+index*.85);
    const length=((superFire?1.50:jet?1.10:.94)*power+.81*flash)*ripple;
    const throat=spec.r*(jet?.65:.64);
    const radius=throat*Math.min(.98,.28+.65*Math.sqrt(Math.max(0,power+.68*flash)));
    const style=spec.flame??(jet?'ice':'torch');
    const color=style==='violet'?(superFire?0xa56cff:0x59edd9):style==='ice'?(superFire?0x5489ff:0x49dbf8):(superFire?0x50b5ff:0xff732d);
    outerPaint.color.setHex(gold?0xffd34a:color);
    outerPaint.opacity=.73+.18*Math.max(power,flash);
    corePaint.color.setHex(gold?0xfffbe0:superFire||style!=='torch'?0xdffaff:0xffecc7);
    outer.scale.set(radius,radius,length);
    outer.rotation.z=time*.8+index*.5;
    core.scale.set(radius*.51,radius*.51,length*.59);
    // Starts just beyond the hollow throat, directly on the aperture axis.
    outer.position.z=.006;
    core.position.z=.009;
    ring.visible=flash>.14;
    if(ring.visible){
      const bloom=throat*(.74+(1-flash)*2.1);
      ring.scale.set(bloom,bloom,bloom);
      ring.position.z=.02+(1-flash)*.42*length;
      ringPaint.opacity=flash*.77;
      ringPaint.color.copy(corePaint.color);
    }
  }
}

export function exhaustSpec(carId){return byCar.get(carId);}
