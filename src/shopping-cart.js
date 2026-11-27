import * as T from 'three';
import {assembly,alloyReflections,surface} from './kart-assembly.js';
import {kartDetail,once} from './kart-detail.js';
import {basketPoint,cartHandle,cartHalfTrack,cartDriver,cartAxles} from './shopping-cart-layout.js';

// One mipmapped enamel print is shared by the four basket plates.
function marketEnamel(){
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=256;
  const ctx=canvas.getContext('2d');
  ctx.beginPath();ctx.roundRect(3,3,1018,250,27);
  ctx.fillStyle='#efdfbb';ctx.fill();ctx.clip();
  ctx.fillStyle='#10373f';ctx.fillRect(8,8,1008,240);
  ctx.fillStyle='#147e80';ctx.fillRect(8,191,1008,47);
  ctx.fillStyle='#ffbc55';ctx.fillRect(8,186,1008,5);
  for(const [i,color] of ['#ffba4a','#ff6739','#e23635'].entries()){
    const x=65+i*54;
    ctx.fillStyle=color;ctx.beginPath();
    ctx.moveTo(x,156);ctx.lineTo(x+55,49);ctx.lineTo(x+96,49);ctx.lineTo(x+41,156);ctx.fill();
  }
  ctx.fillStyle='#fff1d5';ctx.font='italic 900 124px Arial, sans-serif';
  ctx.fillText('SPROTO',292,157);
  ctx.font='bold 33px Arial, sans-serif';ctx.fillText('M A R K E T',303,230);
  for(let i=0;i<6;i++)for(let j=0;j<2;j++){
    if((i+j)%2===0)ctx.fillRect(826+i*22,71+j*22,22,22);
  }
  const texture=new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  return new T.MeshStandardMaterial({map:texture,alphaTest:.5,metalness:.13,roughness:.34,envMap:alloyReflections()});
}

function createFinishes(){
  const alloy=new T.MeshStandardMaterial({vertexColors:true,metalness:.86,roughness:.21,envMap:alloyReflections(),envMapIntensity:1.15});
  const plastic=new T.MeshStandardMaterial({vertexColors:true,roughness:.41});
  const rubber=new T.MeshStandardMaterial({vertexColors:true,roughness:.83});
  return {alloy,plastic,rubber,enamel:marketEnamel()};
}

function createParts(){
  const {alloy,plastic,rubber,enamel}=once('shopping-cart:finishes',createFinishes);
  const chrome='#e1e8e9',steel='#9cafbb',red='#ee4432',darkRed='#ab2832',ivory='#fff3d5';
  const teal='#138384',petrol='#194650',gold='#ffb343';
  const frame=assembly(alloy);
  const {pipe,box}=frame;

  function rim(height,radius,color){
    for(const side of [-1,1])pipe(color,basketPoint(side,0,height),basketPoint(side,1,height),radius);
    for(const end of [0,1])pipe(color,basketPoint(-1,end,height),basketPoint(1,end,height),radius);
  }
  rim(0,.035,steel);
  rim(.43,.015,chrome);
  rim(.89,.016,chrome);
  rim(1,.035,chrome);
  for(let i=0;i<=16;i++){
    const along=i/16;
    for(const side of [-1,1])pipe(chrome,basketPoint(side,along,0),basketPoint(side,along,1),.014,alloy,.014,8);
    pipe(steel,basketPoint(-1,along,0),basketPoint(1,along,0),.015,alloy,.015,8);
  }
  for(let i=0;i<=10;i++){
    const x=i/5-1;
    for(const end of [0,1])pipe(chrome,basketPoint(x,end,0),basketPoint(x,end,1),.014,alloy,.014,8);
    pipe(steel,basketPoint(x,0,0),basketPoint(x,1,0),.013,alloy,.013,8);
  }

  function badge(point){
    const corners=[point(0,0),point(1,0),point(1,1),point(0,1)];
    frame.add(surface(corners,[0,1,2,0,2,3],[[0,0],[1,0],[1,1],[0,1]]),enamel);
    // Domed fasteners on the face hold each sign to the wire slats.
    for(const u of [.033,.967])for(const v of [.20,.80]){
      frame.add(new T.SphereGeometry(.018,10,6),alloy,chrome,point(u,v));
    }
  }
  for(const side of [-1,1]){
    badge((u,v)=>{
      const along=.26+.48*(side===1?1-u:u);
      const p=basketPoint(side,along,.49+.375*v);
      p[0]+=side*.033;
      return p;
    });
  }
  for(const end of [0,1]){
    badge((u,v)=>{
      const p=basketPoint((end===1?1:-1)*(u*2-1)*.58,end,.50+.35*v);
      p[2]+=(end===1?1:-1)*.035;
      return p;
    });
  }

  // Lower parcel rack and the two continuous uprights supporting the push bar.
  const h=cartHandle;
  for(const side of [-1,1]){
    const post=[side*1.055,h.y,h.z];
    const rail=[side*cartHalfTrack,.53,1.29];
    pipe(teal,[side*.67,.53,-1.53],rail,.051,plastic);
    // Short enamel sleeves mark the rail ends, leaving the center rack bright.
    const railPoint=t=>[side*(.67+(.84-.67)*t),.53,-1.53+2.82*t];
    for(const [a,b,col] of [[.068,.115,gold],[.125,.18,red],[.80,.85,red],[.86,.88,gold]]){
      pipe(col,railPoint(a),railPoint(b),.053,plastic);
    }
    pipe(chrome,rail,[side*.96,1.71,1.40],.052);
    pipe(chrome,[side*.96,1.71,1.40],post,.052);
    pipe(steel,[side*.68,.54,-1.30],basketPoint(side,.23,0),.040);
    pipe(chrome,[side*.76,.54,1.03],basketPoint(side,.72,0),.039);
    for(const [z] of cartAxles){
      pipe(steel,[side*.63,.53,z],[side*cartHalfTrack,.53,z],.053);
      box(petrol,[side*cartHalfTrack,.586,z],[.165,.042,.195],.018,0,plastic);
      pipe(chrome,[side*cartHalfTrack,.604,z],[side*cartHalfTrack,.625,z],.048,alloy,.045,6);
    }
    // Rear reflectors sit on the gate below the sign and above the number plate.
    const [rx,ry,rz]=basketPoint(side*.73,1,.43);
    box(petrol,[rx,ry,rz+.018],[.22,.105,.056],.023,.30,plastic);
    box(red,[rx,ry,rz+.049],[.181,.076,.035],.018,.30,plastic);
    for(let i=-1;i<=1;i++)box('#ff7852',[rx+i*.044,ry,rz+.067],[.015,.053,.009],.004,.30,plastic);
    // Wrap the red guards over the top front corners, like the reference.
    pipe(red,basketPoint(side*.73,0,1),basketPoint(side,0,1),.058,plastic);
    pipe(red,basketPoint(side,0,1),basketPoint(side,.083,1),.058,plastic);
    box(red,basketPoint(side,0,1),[.107,.112,.107],.030,0,plastic);
    pipe(red,[side*.91,h.y,h.z],[side*h.halfWidth,h.y,h.z],h.radius,plastic);
    for(let i=0;i<3;i++){
      const along=.026+.024*i;
      pipe(i===0?gold:darkRed,basketPoint(side,along,1),basketPoint(side,along+.007,1),.060,plastic);
    }
    pipe(darkRed,[side*1.053,h.y-.055,h.z-.022],post,.067,plastic);
  }
  for(const side of [-1,1]){
    const grip=(a,b,r,color,mat)=>pipe(color,[side*a,h.y,h.z],[side*b,h.y,h.z],r,mat,r,24);
    grip(.51,.907,.065,petrol,rubber);
    for(let i=0;i<8;i++)grip(.53+i*.046,.546+i*.046,.068,teal,rubber);
    grip(.476,.508,.066,gold,alloy);
    grip(.884,.916,.070,gold,alloy);
    grip(1.080,1.084,.041,steel,alloy);
  }
  pipe(ivory,[-.922,h.y,h.z],[.922,h.y,h.z],.061,plastic);
  for(const z of [-1.53,1.29]){
    const x=z<0?.67:cartHalfTrack;
    pipe(chrome,[-x,.53,z],[x,.53,z],.05);
  }
  for(let i=-2;i<=2;i++)pipe(steel,[i*.20,.53,-1.52],[i*.24,.53,1.28],.021);
  pipe(steel,[-.80,.53,.61],[.80,.53,.61],.027);

  // The folding red seat is mounted inside the wire basket.
  const d=cartDriver;
  box(red,[0,d.y-.17,d.z+.10],[.99,.12,.80],.052,0,plastic);
  box(red,[0,d.y+.16,d.z+.51],[1.02,.65,.10],.045,.10,plastic);
  // Recessed ribs and warm piping pick out the red seat from the chase camera.
  for(const side of [-1,1]){
    const x=side*.43;
    pipe(gold,[x,d.y-.075,d.z+.545],[x,d.y+.410,d.z+.595],.013,plastic);
  }
  for(let i=0;i<4;i++){
    const dy=-.056+i*.115;
    box(darkRed,[0,d.y+.16+dy,d.z+.563+dy*.10],[.70,.047,.025],.012,.10,plastic);
  }
  for(const side of [-1,1]){
    pipe(steel,[side*.41,.83,d.z-.21],[side*.41,d.y-.21,d.z+.31],.030);
    pipe(chrome,[side*.51,.86,d.z+.31],[side*.51,d.y+.48,d.z+.56],.026);
  }

  const fork=assembly(alloy),wheel=assembly(plastic),r=cartAxles[0][1];
  for(const side of [-1,1]){
    const x=side*.112;
    fork.pipe(steel,[x,0,0],[x,.19,-.035],.039);
    fork.pipe(chrome,[x,.19,-.035],[side*.042,.24,0],.039);
    fork.pipe(gold,[x,0,0],[side*.149,0,0],.056,alloy,.050,6);
    fork.pipe(petrol,[side*.149,0,0],[side*.151,0,0],.024,alloy,.024,6);
  }
  fork.pipe(chrome,[0,.22,0],[0,.39,0],.058);
  fork.pipe(steel,[0,.25,0],[0,.30,0],.091);
  fork.pipe(petrol,[0,.24,0],[0,.256,0],.092);
  fork.pipe(gold,[0,.29,0],[0,.307,0],.092);

  // Revolve the caster tread around its axle, with two shallow running grooves.
  const tread=[[-.092,.143],[-.092,.208],[-.086,.226],[-.071,.240],[-.052,r],
    [-.041,r],[-.038,.240],[-.033,.240],[-.030,r],[.030,r],[.033,.240],
    [.038,.240],[.041,r],[.052,r],[.071,.240],[.086,.226],[.092,.208],[.092,.143]];
  wheel.add(new T.LatheGeometry(tread.map(([x,radius])=>new T.Vector2(radius,x)),40),
    rubber,'#283640',[0,0,0],[0,0,-Math.PI/2]);
  for(const side of [-1,1]){
    function disc(color,a,b,radius,material,endRadius=radius){
      wheel.pipe(color,[side*a,0,0],[side*b,0,0],radius,material,endRadius,36);
    }
    disc('#324c55',.069,.090,.160,rubber);
    disc(red,.090,.094,.172,plastic,.164);
    disc(gold,.094,.097,.145,alloy);
    disc(petrol,.097,.099,.129,alloy);
    disc(steel,.099,.103,.063,alloy,.058);
    for(let i=0;i<5;i++){
      const angle=i*Math.PI*2/5,y=.094*Math.cos(angle),z=.094*Math.sin(angle);
      wheel.pipe('#101e25',[side*.099,y,z],[side*.100,y,z],.018,rubber,.014,10);
    }
  }
  return {frame:frame.finish(),wheel:wheel.finish(),fork:fork.finish()};
}

const built=[];
export function attachShoppingCart(body,axles){
  const parts=built[kartDetail()]??=createParts();
  function attach(parent,templates){
    for(const template of templates){
      const mesh=new T.Mesh(template.geometry,template.material);
      mesh.userData.sharedKartPart=true;
      parent.add(mesh);
    }
  }
  attach(body,parts.frame);
  for(const axle of axles){
    attach(axle,parts.wheel);
    const fork=new T.Group();
    fork.position.copy(axle.position);
    attach(fork,parts.fork);
    body.add(fork);
    axle.userData.fork=fork;
  }
}
