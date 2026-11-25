import * as T from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import reflectionUrl from './assets/hexshift-reflections.hdr?url';
import contactUrl from './assets/hexshift-contact.png';
import slickUrl from './assets/hexshift-slick.webp';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const hexshiftDriver={x:0,y:.84,z:.20,scale:.70};
const tau=2*Math.PI;
const enamel=color=>new T.MeshPhysicalMaterial({color,metalness:.26,roughness:.30,
  clearcoat:1,clearcoatRoughness:.12,envMapIntensity:.42});
let plum,ivory,brass,bronze,steel,leather,harness,rubber,mint,jewel;
function initMaterials(){
  if(plum)return;
  plum=enamel('#461031');ivory=enamel('#f2d5ad');
  brass=new T.MeshStandardMaterial({color:'#dba75d',metalness:.86,roughness:.25,envMapIntensity:.83});
  bronze=new T.MeshStandardMaterial({color:'#81614b',metalness:.78,roughness:.34});
  steel=new T.MeshStandardMaterial({color:'#767a78',metalness:.8,roughness:.32});
  leather=new T.MeshStandardMaterial({color:'#33282d',roughness:.76});
  harness=new T.MeshStandardMaterial({color:'#843f44',roughness:.77});
  rubber=new T.MeshStandardMaterial({color:'#282529',roughness:.83});
  mint=new T.MeshBasicMaterial({color:'#abffe0',toneMapped:false});
  jewel=new T.MeshPhysicalMaterial({color:0xffffff,emissive:'#2bc383',emissiveIntensity:.28,
    vertexColors:true,flatShading:true,roughness:.12,metalness:.16,clearcoat:1,envMapIntensity:.7});
}
let templates,contactMap;

export function styleHexshiftShadow(shadow){
  if(!contactMap){
    contactMap=new T.TextureLoader().load(contactUrl);
    contactMap.colorSpace=T.SRGBColorSpace;
  }
  shadow.geometry.dispose();
  shadow.geometry=new T.PlaneGeometry(2,2);
  shadow.material.map=contactMap;
  shadow.material.color.set(0xffffff);
  shadow.material.opacity=1;
}

// A closed loft. Rows run nose to tail, columns run left to right over
// the painted face and return underneath, giving the tapered tips thickness.
function shell(rows,columns,point){
  const positions=[],indices=[],uv=[];
  for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++){
    positions.push(...point(i/rows,tau*j/columns));
    uv.push(i/rows,j/columns);
    if(i<rows&&j<columns){
      const a=i*(columns+1)+j,b=a+columns+1;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
  }
  // Close both ends across the thickness of the panel.
  for(const row of [0,rows]){
    for(let j=0;j<columns/2;j++){
      const a=row*(columns+1)+j,b=row*(columns+1)+columns-j;
      const face=[a,b-1,a+1,a,b,b-1];
      indices.push(...(row===0?face:face.reverse()));
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.setIndex(indices);g.computeVertexNormals();return g;
}

// Bake static pieces by finish. Every racer and garage preview shares the
// resulting geometry, while its axles and floating crystal move independently.
function assembly(){
  const buckets=new Map();
  function add(geometry,material,position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]){
    const matrix=new T.Matrix4().compose(new T.Vector3(...position),
      new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale));
    const g=geometry;
    if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));
    g.applyMatrix4(matrix);
    if(!buckets.has(material))buckets.set(material,[]);
    buckets.get(material).push(g);
  }
  function tube(points,r,material){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
    add(new T.TubeGeometry(curve,Math.max(4,points.length*3),r,8,false),material);
  }
  function finish(){
    return Array.from(buckets,([mat,parts])=>{
      const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());
      return new T.Mesh(merged,mat);
    });
  }
  return {add,tube,finish};
}
function chassis(){
  const p=assembly();
  p.add(new T.BoxGeometry(1.19,.16,2.36),leather,[0,.32,.06]);
  // Vault over the nose gem, flaring out at the cockpit like the reference.
  p.add(shell(24,36,(t,a)=>{
    const x=Math.cos(a),y=Math.sin(a);
    const width=.31+.34*Math.sin(t*Math.PI*.79);
    const z=-1.66+1.15*t+.69*t**3*x*x;
    const crown=.72+.34*Math.sin(t*Math.PI*.65);
    // A pair of shoulders rolls down to the arch around the gem. Slightly
    // concave channels between them and the center catch long reflections.
    const shoulder=.084*Math.exp(-((Math.abs(x)-.71)**2)/.019);
    const yTop=crown-.30*x*x+(.043*y+shoulder)*Math.max(y,0);
    const lip=.030*(1-t)**2*(1-x*x);
    return [x*width,yTop+.030*Math.min(y,0),z-lip];
  }),ivory);
  for(const side of [-1,1]){
    const rail=(points,r,mat)=>p.tube(points.map(([x,y,z])=>[side*x,y,z]),r,mat);
    rail([[.32,.23,-1.76],[.38,.33,-1.51],[.51,.63,-.88],[.63,.72,-.21],[.65,.68,.62],[.56,.60,1.20]],.057,brass);
    rail([[.35,.23,-1.73],[.47,.33,-.84],[.60,.38,.23],[.62,.48,1.25]],.046,brass);
    // The broad cast sill catches the ivory hood and carries it back to
    // the rear housing. The space below it reveals the suspension links.
    p.add(shell(26,12,(t,a)=>{
      const z=-1.30+2.55*t,arch=Math.sin(t*Math.PI);
      const x=side*(.44+.223*arch+.066*t);
      return [x+.048*Math.cos(a),.38+.265*arch+.09*t+.081*Math.sin(a)*(.35+.65*arch),z];
    }),brass);
    for(const z of [-.65,-.06,.53]){
      rail([[.51,.37,z-.10],[.60,.50,z+.16],[.62,.68,z+.23]],.031,brass);
    }
    for(const axleZ of [-1.10,1.03]){
      rail([[.42,.38,axleZ+.18],[.82,.40,axleZ],[1.02,.45,axleZ]],.043,brass);
      rail([[.49,.63,axleZ+.06],[.79,.48,axleZ],[.95,.44,axleZ]],.036,brass);
      // Three nested scythes on each corner sweep over the tire. The
      // blades narrow in plan and drop in profile toward both free tips.
      for(let layer=0;layer<3;layer++){
        p.add(shell(44,24,(t,a)=>{
          const arch=Math.sin(Math.PI*t),u=Math.cos(a),v=Math.sin(a);
          const sweep=arch**.72;
          const width=.009+(.188-layer*.010)*sweep;
          const out=.846+layer*.127+.056*arch;
          const y=.635+.555*arch**.87-layer*.075+.065*t;
          // Broad crowned face and a rolled, thin edge. Each lower blade
          // rakes farther aft, so their outlines separate at race distance.
          const roll=side*u;
          const crown=v>0?.049*v**.63:.030*v;
          const bevel=.028*Math.max(0,(roll-.63)/.37)**1.6;
          return [side*out+u*width,y+(crown-.087*roll-.019*roll*roll-bevel)*sweep,
            axleZ+(t-.5)*(1.53-layer*.13)+layer*.068-.055*roll*sweep];
        }),plum);
      }
    }
    // Forged tips run up to the ivory arch, surrounding the single gem.
    p.add(shell(22,16,(t,a)=>{
      // Squared forged cross-section with a chamfer down each outside edge.
      const u=Math.cos(a),v=Math.sin(a);
      const x=side*(.30+.14*t)+.081*Math.sign(u)*Math.abs(u)**.41;
      return [x,.235+.39*t**1.24+(.035+.038*t)*Math.sign(v)*Math.abs(v)**.52,
        -1.84+.60*t-.018*v];
    }),brass);
    for(const z of [-1.10,1.03]){
      const start=[side*.66,.80,z+.05],end=[side*.82,.44,z];
      p.tube([start,end],.030,steel);
      for(const t of [.03,.92]){
        const x=start[0]+(end[0]-start[0])*t,y=start[1]+(end[1]-start[1])*t;
        p.add(new T.CylinderGeometry(.078,.070,.048,18),bronze,[x,y,z+.05*(1-t)],[0,0,side*.4]);
      }
      // Triangulated wishbones join the fork to the hub carrier.
      for(const back of [-1,1]){
        rail([[.43,.35,z+.24*back],[.61,.34,z+.19*back],[.91,.42,z]],.027,bronze);
        p.add(new T.CylinderGeometry(.048,.048,.042,6),steel,[side*.54,.36,z+.21*back],[0,0,Math.PI/2]);
      }
      const spring=[];
      for(let i=0;i<=32;i++){
        const t=i/32,a=t*tau*3;
        spring.push([start[0]+(end[0]-start[0])*t+.05*Math.cos(a),
          start[1]+(end[1]-start[1])*t,start[2]+(end[2]-start[2])*t+.05*Math.sin(a)]);
      }
      p.tube(spring,.012,mint);
    }
    // Centered bucket and harness behind the occupant.
    p.add(new RoundedBoxGeometry(.116,.16,.58,3,.043),leather,[side*.326,.826,.28]);
    rail([[.32,.87,.03],[.32,.89,.28],[.32,.88,.51],[.32,1.12,.65],[.30,1.37,.72]],.009,harness);
    p.add(new T.BoxGeometry(.078,.50,.022),harness,[side*.17,1.08,.644],[-.12,0,0]);
    p.add(new RoundedBoxGeometry(.104,.07,.034,2,.011),brass,[side*.17,1.27,.658],[-.12,0,0]);
    p.add(new RoundedBoxGeometry(.065,.026,.040,1,.007),harness,[side*.17,1.27,.656],[-.12,0,0]);
    rail([[.46,.55,1.13],[.60,.94,1.12],[.65,1.33,1.12]],.068,brass);
  }
  p.add(new RoundedBoxGeometry(.73,.17,.71,3,.06),leather,[0,.685,.24]);
  p.add(new RoundedBoxGeometry(.71,.71,.11,3,.052),leather,[0,1.07,.72],[-.12,0,0]);
  // The rear deck ties the astrolabe supports to the exhaust and axle.
  p.add(shell(18,20,(t,a)=>[.61*Math.cos(a),.58+.15*Math.sin(a)+.075*Math.sin(t*Math.PI),.79+.83*t]),plum);
  // A ribbed engine cover, cast exhaust collars and the rear axle bearings
  // remain visible to the chase camera through the instrument.
  p.add(new RoundedBoxGeometry(.57,.08,.48,2,.035),bronze,[0,.745,1.31]);
  for(let i=0;i<8;i++)p.add(new RoundedBoxGeometry(.46,.035,.025,1,.008),steel,[0,.790,1.12+i*.053]);
  for(const side of [-1,1]){
    for(const [z,r,w,mat] of [[1.45,.163,.11,bronze],[1.60,.145,.07,brass],[1.79,.119,.033,brass]]){
      p.add(new T.CylinderGeometry(r,r,w,32),mat,[side*.52,.50,z],[Math.PI/2,0,0]);
    }
    p.add(new T.CylinderGeometry(.146,.146,.11,36),bronze,[side*.685,1.42,1.13],[0,0,Math.PI/2]);
    p.add(new T.CylinderGeometry(.089,.089,.13,8),brass,[side*.706,1.42,1.13],[0,0,Math.PI/2]);
  }
  const center=[0,1.48,1.13];
  // Lathed, stepped instrument bands have broad faces for the dial marks
  // and beveled rims that catch different highlights from front and rear.
  function band(profile,mat,tilt){
    const g=new T.LatheGeometry(profile.map(([r,d])=>new T.Vector2(r,d)),96);
    g.rotateX(Math.PI/2);p.add(g,mat,center,[0,tilt,0]);
  }
  band([[.682,-.033],[.685,-.044],[.742,-.044],[.755,-.032],[.755,.032],
    [.742,.044],[.685,.044],[.682,.033],[.682,-.033]],brass,0);
  band([[.591,-.020],[.595,-.028],[.626,-.028],[.637,-.015],[.637,.015],
    [.626,.028],[.595,.028],[.591,.020],[.591,-.020]],brass,.27);
  band([[.545,-.013],[.552,-.023],[.574,-.021],[.584,-.013],[.584,.013],
    [.574,.021],[.552,.023],[.545,.013],[.545,-.013]],bronze,-.27);
  for(const face of [-1,1]){
    const inlay=new T.TorusGeometry(.564,.011,8,96);
    inlay.translate(0,0,face*.023);
    p.add(inlay,mint,center,[0,-.27,0]);
  }
  for(let i=0;i<60;i++){
    const a=tau*i/60,r=.715,length=i%5===0?.043:.021;
    for(const face of [-1,1])p.add(new T.BoxGeometry(.007,length,.0025),bronze,
      [r*Math.sin(a),center[1]+r*Math.cos(a),center[2]+face*.044],[0,0,-a]);
  }
  // An open brass compass rose leaves sight lines through the astrolabe.
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,len=i%2?.19:.35;
    p.add(new T.ConeGeometry(i%2?.033:.062,len,4),brass,
      [Math.sin(a)*len/2,center[1]+Math.cos(a)*len/2,center[2]],[0,0,-a]);
    if(i%2===0){
      const x=.719*Math.sin(a),y=center[1]+.719*Math.cos(a);
      p.add(new RoundedBoxGeometry(.119,.119,.114,2,.012),bronze,[x,y,center[2]],[0,0,-a+Math.PI/4]);
      p.add(new T.OctahedronGeometry(.077),brass,[x,y,center[2]]);
    }
  }
  p.tube([[-.71,1.48,1.13],[0,1.48,1.13],[.71,1.48,1.13]],.015,brass);
  for(const face of [-1,1])p.add(new T.CylinderGeometry(.072,.077,.052,12),brass,
    [0,center[1],center[2]+face*.032],[Math.PI/2,0,0]);
  return p.finish();
}
function roadWheel(){
  const p=assembly();
  const section=[[-.173,.236],[-.185,.250],[-.192,.30],[-.193,.351],[-.185,.394],
    [-.168,.418],[-.144,.440],[-.112,.448],[-.070,.450],[-.066,.446],[-.060,.446],
    [-.055,.450],[.063,.450],[.068,.446],[.073,.446],[.078,.450],[.112,.448],
    [.144,.440],[.168,.418],[.185,.394],[.193,.351],[.192,.30],[.185,.250],[.173,.236]];
  function revolve(profile,mat){
    const g=new T.LatheGeometry(profile.map(([x,r])=>new T.Vector2(r,x)),64);
    p.add(g,mat,[0,0,0],[0,0,-Math.PI/2]);
  }
  revolve(section,rubber);
  for(const r of [.291,.356,.383]){
    p.add(new T.TorusGeometry(r,.0026,5,64),rubber,[.193,0,0],[0,Math.PI/2,0]);
  }
  revolve([[-.17,.249],[-.17,.221],[.117,.204],[.157,.211],[.202,.235],[.202,.252],
    [.197,.259],[.187,.259],[.183,.250],[-.17,.249]].reverse(),brass);
  p.add(new T.CylinderGeometry(.10,.14,.27,24),bronze,[-.055,0,0],[0,0,Math.PI/2]);
  p.add(new T.CylinderGeometry(.196,.196,.025,48),steel,[.087,0,0],[0,0,Math.PI/2]);
  p.add(new RoundedBoxGeometry(.062,.083,.126,2,.014),bronze,[.108,.137,.025],[.45,0,0]);
  for(let i=0;i<18;i++){
    const a=tau*i/18;
    p.add(new T.CylinderGeometry(.009,.009,.003,8),leather,[.101,.168*Math.cos(a),.168*Math.sin(a)],[0,0,Math.PI/2]);
  }
  // A single forged wheel face with six actual openings around the hub.
  const disc=new T.Shape();disc.absarc(0,0,.233,0,tau,false);
  for(let i=0;i<6;i++){
    const a=tau*i/6,hole=new T.Path();
    const xy=(r,angle)=>[r*Math.cos(a+angle),r*Math.sin(a+angle)];
    hole.moveTo(...xy(.105,-.11));
    hole.quadraticCurveTo(...xy(.092,.12),...xy(.108,.21));
    hole.lineTo(...xy(.179,.35));
    hole.quadraticCurveTo(...xy(.205,.39),...xy(.204,.20));
    hole.lineTo(...xy(.202,-.19));
    hole.quadraticCurveTo(...xy(.193,-.31),...xy(.180,-.26));
    hole.closePath();disc.holes.push(hole);
  }
  const web=new T.ExtrudeGeometry(disc,{depth:.019,bevelThickness:.005,bevelSize:.004,bevelSegments:2,curveSegments:8});
  p.add(web,brass,[.144,0,0],[0,Math.PI/2,0]);
  for(const [r,w,x,mat,n] of [[.093,.028,.176,bronze,32],[.068,.033,.193,brass,12],[.042,.017,.217,steel,6]]){
    p.add(new T.CylinderGeometry(r,r,w,n),mat,[x,0,0],[0,0,Math.PI/2]);
  }
  for(let i=0;i<6;i++){
    const a=tau*i/6;
    p.add(new T.CylinderGeometry(.014,.014,.016,6),steel,[.182,.082*Math.cos(a),.082*Math.sin(a)],[0,0,Math.PI/2]);
  }
  return p.finish();
}
function crystal(){
  const points=[],colors=[],outlines=assembly();
  const poleTop=[0,1,0],poleBottom=[0,-1,0];
  const ring=(i,r,y,offset)=>[r*Math.cos(i*tau/6+offset),y,r*Math.sin(i*tau/6+offset)];
  const tints=['#9affd5','#54ceab','#d6ffed','#58df9a','#baffce','#60ecbc'];
  function facet(a,b,c,tint){
    points.push(...a,...b,...c);
    const rgb=new T.Color(tint);
    for(let i=0;i<3;i++)colors.push(rgb.r,rgb.g,rgb.b);
  }
  for(let i=0;i<6;i++){
    const shoulder=ring(i,.83,.28,0),next=ring(i+1,.83,.28,0);
    const waist=ring(i,.96,-.11,Math.PI/6),prev=ring(i-1,.96,-.11,Math.PI/6);
    facet(poleTop,next,shoulder,tints[i]);
    facet(shoulder,next,waist,tints[(i+2)%6]);
    facet(shoulder,waist,prev,tints[(i+4)%6]);
    facet(poleBottom,prev,waist,tints[(i+1)%6]);
    for(const [a,b] of [[poleTop,shoulder],[shoulder,waist],[waist,poleBottom],[waist,next]]){
      outlines.tube([a,b],.020,mint);
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(points,3));
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();
  const m=new T.Mesh(g,jewel),[outline]=outlines.finish();
  outline.userData.sharedKartPart=true;m.add(outline);
  return m;
}
export function attachHexshift(body,wheels){
  if(!templates){
    initMaterials();
    const tread=new T.TextureLoader().load(slickUrl);
    tread.wrapS=tread.wrapT=T.RepeatWrapping;
    tread.anisotropy=4;
    rubber.bumpMap=tread;rubber.bumpScale=.0022;rubber.roughnessMap=tread;
    const reflection=new HDRLoader().load(reflectionUrl);
    // The loader starts with a 1px placeholder. Delay environment prefiltering
    // until the HDR pixels arrive, including when the first preview is already visible.
    reflection.image.height=0;
    reflection.mapping=T.EquirectangularReflectionMapping;
    for(const finish of [plum,ivory,brass,bronze,steel,jewel])finish.envMap=reflection;
    templates={chassis:chassis(),wheel:roadWheel(),gem:crystal()};
  }
  function attach(group,parts,flip=false){
    for(const template of parts){
      const mesh=template.clone();mesh.userData.sharedKartPart=true;
      if(flip)mesh.rotation.y=Math.PI;
      group.add(mesh);
    }
  }
  attach(body,templates.chassis);
  for(const axle of wheels)attach(axle,templates.wheel,axle.position.x<0);
  const gem=templates.gem.clone();gem.userData.sharedKartPart=true;
  gem.scale.set(.145,.225,.135);gem.position.set(0,.47,-1.66);body.add(gem);
  return gem;
}

// The three moons follow the slip angle during a boost and taper into the wake.
export function makeLunarWake(body){
  const shape=new T.Shape();
  shape.moveTo(-.13,.17);
  shape.bezierCurveTo(.16,.16,.17,-.12,-.08,-.18);
  shape.bezierCurveTo(.27,-.21,.31,.21,-.13,.17);
  const geometry=new T.ShapeGeometry(shape,16);
  const paint=new T.MeshBasicMaterial({color:'#a0ffdb',side:T.DoubleSide,transparent:true,depthWrite:false});
  const moons=Array.from({length:3},()=>new T.Mesh(geometry,paint));
  for(const moon of moons){moon.visible=false;body.add(moon);}
  return moons;
}
export function animateLunarWake(moons,power,slip,time){
  for(const [i,moon] of moons.entries()){
    moon.visible=power>.16;
    if(!moon.visible)continue;
    const t=(i/3+time*1.25)%1;
    moon.scale.setScalar(power*Math.sin(t*Math.PI)*1.35);
    moon.position.set(Math.sin(t*Math.PI)*.20+slip*t*2,.64+t*.54,1.76+t*2.3);
    moon.rotation.z=.35*Math.sin(t*Math.PI);
  }
}
