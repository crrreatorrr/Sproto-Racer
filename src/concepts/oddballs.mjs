import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const {PI} = Math;
const bronze='#c58c43', gold='#f2ac4c', silver='#b9b9ba', black='#222128', ash='#37323b',
    cream='#f3dfbc', white='#fff3d7', teal='#149ca2', wood='#92502e', cane='#eab373',
    lamp='#ffe2a0', dark='#211b23', red='#b43032', yellow='#f5a928';

// Chassis equipment is baked as rigid art; steering and wheel animation stay with the race renderer.
const SHELL='solid', ALLOY='metal', HIDE='rubber', LIGHT='glow', GLASS='glass', VIOLET='violet';

function build(h){
  function add(geo,c,p,rot=[0,0,0],scale=[1,1,1],mat=SHELL){
    geo.scale(...scale);
    h.mesh(mat===VIOLET?'#bb96ff':c,geo,p,rot,mat===VIOLET?GLASS:mat);
  }
  const box=(c,x,y,z,w,ht,d,r=.055,mat=SHELL,rot=[0,0,0])=>add(new RoundedBoxGeometry(w,ht,d,1,Math.min(r,w*.48,ht*.48,d*.48)),mat===GLASS?'#a4d8e3':c,[x,y,z],rot,[1,1,1],mat);
  const sph=(c,x,y,z,w,ht,d,mat=SHELL,rot=[0,0,0])=>add(new T.SphereGeometry(1,14,10),c,[x,y,z],rot,[w,ht,d],mat);
  const cyl=(c,x,y,z,rt,rb,len,rot=[0,0,0],mat=SHELL,n=16)=>add(new T.CylinderGeometry(rt,rb,len,n),c,[x,y,z],rot,[1,1,1],mat);
  function strut(c,a,b,r,r2=r,mat=ALLOY,sides=8){
    const origin=new T.Vector3(...a),end=new T.Vector3(...b),diff=end.clone().sub(origin);
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),diff.clone().normalize());
    const geo=new T.CylinderGeometry(r2,r,diff.length(),sides);
    geo.applyQuaternion(q);add(geo,c,origin.lerp(end,.5).toArray(),[0,0,0],[1,1,1],mat);
  }
  function pipe(c,ps,r,mat=ALLOY,steps=Math.max(8,ps.length*4),sides=7){
    add(new T.TubeGeometry(new T.CatmullRomCurve3(ps.map(p=>new T.Vector3(...p))),steps,r,sides,false),c,[0,0,0],[0,0,0],[1,1,1],mat);
  }
  const tor=(c,x,y,z,r,t,rot=[0,0,0],scale=[1,1,1],mat=ALLOY)=>add(new T.TorusGeometry(r,t,8,30),c,[x,y,z],rot,scale,mat);
  const lathe=(c,x,y,z,profile,rot=[0,0,0],scale=[1,1,1],mat=SHELL)=>add(new T.LatheGeometry(profile.map(p=>new T.Vector2(...p)),28),c,[x,y,z],rot,scale,mat);
  function wedge(c,points,depth,at,rot=[0,0,0],mat=SHELL){
    const shape=new T.Shape();
    points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    const geo=new T.ExtrudeGeometry(shape,{steps:1,depth,bevelEnabled:true,bevelSegments:1,bevelSize:.027,bevelThickness:.027,curveSegments:3});
    geo.translate(0,0,-depth*.5);add(geo,c,at,rot,[1,1,1],mat);
  }
  return {add,box,sph,cyl,strut,pipe,tor,lathe,wedge};
}

function seat(a,x,y,z,s,col='#533728'){
  a.box(col,x,y-.067*s,z+.035*s,.94*s,.19*s,.94*s,.10*s,HIDE);
  a.box(col,x,y+.39*s,z+.443*s,.93*s,.82*s,.20*s,.12*s,HIDE,[.105,0,0]);
  a.box(col,x,y+.68*s,z+.44*s,.58*s,.27*s,.24*s,.09*s,HIDE);
  for(const k of [-1,1])a.box(col,x+k*.50*s,y+.10*s,z,.15*s,.27*s,.76*s,.06*s,HIDE);
}
function lamps(a,x,y,z,r=.15,c=lamp){
  for(const s of [-1,1]){
    a.cyl(ash,s*x,y,z,r*1.24,r*1.24,.13,[PI/2,0,0],ALLOY);
    a.cyl(c,s*x,y,z-.074,r,r,.03,[PI/2,0,0],LIGHT);
  }
}

function basket(a){
  const steel='#a8adb6';
  a.box(steel,0,.34,.18,1.33,.14,2.53,.14,ALLOY);
  a.pipe(silver,[[-.59,.32,1.32],[-.60,.28,-1.42],[-.48,.18,-1.94],[.48,.18,-1.94],[.60,.28,-1.42],[.59,.32,1.32]],.048);
  function border(t){
    const w=.67+.19*t,fr=-1.34-.22*t,re=1.10+.08*t,y=.48+.80*t;
    const frame=[[-w,y,fr],[w,y,fr],[w,y+.25*t,re],[-w,y+.25*t,re],[-w,y,fr]];
    for(let i=0;i<4;i++)a.strut(silver,frame[i],frame[i+1],t===1?.043:.028);
  }
  for(const t of [0,.24,.48,.73,1])border(t);
  for(const s of [-1,1]){
    for(let i=0;i<=8;i++){
      const t=i/8;
      a.strut(silver,[s*.67,.48,-1.34+2.44*t],[s*.86,1.28+.25*t,-1.56+2.74*t],.025);
    }
    a.pipe(silver,[[s*.68,.56,.99],[s*.78,1.47,1.21],[s*.84,2.14,1.52],[s*.76,2.19,1.55]],.050);
    a.box(steel,s*.59,1.02,1.30,.52,.27,.93,.065,ALLOY);
    for(let k=0;k<3;k++)a.pipe(silver,[[s*(.38+k*.16),.77,.82],[s*(.48+k*.17),.84,1.21],[s*(.51+k*.17),1.16,1.50],[s*(.53+k*.17),1.44,1.62]],.070);
  }
  for(let i=-4;i<=4;i++)a.strut(silver,[i*.15,.48,-1.34],[i*.20,1.28,-1.56],.024);
  a.strut('#dc352d',[-.75,2.19,1.55],[.75,2.19,1.55],.083,.083,SHELL);
  a.box(ash,0,1.42,1.22,.96,.27,.73,.065,HIDE);
  a.box(silver,0,1.69,1.18,.93,.16,.56,.055,ALLOY);
  for(const x of [-.28,0,.28]){
    a.cyl(silver,x,1.69,.91,.151,.151,.10,[PI/2,0,0],ALLOY,12);
    a.cyl('#862421',x,1.69,.852,.112,.112,.027,[PI/2,0,0],HIDE,12);
  }
}
function tug(a){
  const lime='#b6cc10', low='#7d8d0d';
  a.box(lime,0,.47,.04,1.75,.58,2.95,.13);
  a.box(lime,0,.76,-.99,1.76,.24,.96,.08);
  a.box(lime,0,.73,1.22,1.71,.30,.63,.07);
  a.box(black,0,.34,-1.53,1.90,.39,.19,.05,HIDE);
  for(let i=0;i<5;i++)a.box(white,(i-2)*.35,.347,-1.64,.16,.35,.032,.007,SHELL,[0,0,-.45]);
  for(const s of [-1,1]){
    a.box(lime,s*.80,.70,.22,.26,.22,1.26,.05);
    a.box(low,s*.887,.63,.55,.046,.41,.55,.04);
    for(let j=0;j<5;j++)a.box(ash,s*.92,.48+j*.068,.55,.035,.032,.44,.01,HIDE);
    a.box(ash,s*.53,.75,-1.488,.37,.25,.09,.04,HIDE);
    a.box(lamp,s*.53,.75,-1.537,.28,.16,.035,.02,LIGHT);
    for(const z of [-1.24,1.15])a.tor(lime,s*.68,.915,z,.085,.030);
  }
  a.cyl(black,.66,1.04,1.13,.033,.033,.47);
  a.cyl(ash,.66,1.29,1.13,.103,.11,.07);
  a.cyl('#ffc12a',.66,1.38,1.13,.080,.098,.14,[0,0,0],LIGHT);
}
function barrel(a){
  const blueS=['#107981','#118d91','#138f96','#0c858b','#17959b'];
  a.lathe(teal,0,.79,0,[[.77,-.53],[.92,-.39],[1.04,-.14],[1.08,.23],[1.03,.48],[.91,.59],[.79,.57],[.85,.49],[.91,.30],[.91,-.39],[.74,-.46],[.77,-.53]],[0,0,0],[1,1,1.13]);
  for(let i=0;i<24;i++){
    const t=i*PI/12;
    const points=[[.788,.29],[.966,.50],[1.056,.76],[1.064,1.04],[1.025,1.229],[.921,1.376]].map(([r,y])=>[Math.sin(t)*r,y,Math.cos(t)*r*1.13]);
    a.pipe(blueS[i%5],points,.048,SHELL,10,5);
  }
  for(const [y,r] of [[1.26,1],[.43,.913]]) {
    a.tor(cane,0,y,0,r,.062,[PI/2,0,0],[1,1.13,1]);
    for(let i=0;i<24;i++){
      const t=i*PI/12;
      a.add(new T.SphereGeometry(1,8,5),i%2?'#f6c788':'#cf975d',[r*Math.sin(t),y,r*1.13*Math.cos(t)],[0,t,.2],[.094,.059,.061],ALLOY);
    }
  }
  a.box('#683521',0,.88,-1.13,1.15,.79,.11,.21,HIDE);
  for(const s of [-1,1]){
    a.pipe('#d29457',[[s*.065,1.02,-1.22],[s*.32,1.12,-1.24],[s*.54,1.13,-1.19]],.075,SHELL);
    a.sph(wood,s*.32,.98,-1.235,.17,.070,.06,HIDE);
    a.pipe(cane,[[s*.08,.77,-1.22],[s*.34,.82,-1.21],[s*.48,.74,-1.19],[s*.51,.62,-1.17]],.066,SHELL);
  }
  a.sph(cane,0,.91,-1.244,.10,.13,.10);
  a.pipe(cane,[[-.36,.61,-1.22],[0,.56,-1.25],[.36,.61,-1.22]],.07,SHELL);
  for(let i=0;i<5;i++){
    const t=i*2*PI/5; a.sph('#df4233',.99+Math.cos(t)*.03,1.03+Math.sin(t)*.13,-.26+Math.cos(t)*.13,.047,.095,.085,SHELL,[t,0,0]);
  }
  a.sph('#f6bd54',1.04,1.03,-.26,.046,.051,.051);
}
function icecream(a){
  const sky='#78c9d7',pink='#ee78a7',glass='#294b56';
  a.box(sky,0,.62,.08,1.85,.64,3.12,.10);
  a.box(cream,0,.98,.22,1.86,.43,2.99,.06);
  a.box(pink,0,.97,.22,1.873,.073,3.012,.025);
  a.wedge(cream,[[-1.68,0],[-1.04,.77],[1.54,.77],[1.57,0]],.136,[-.87,1.13,.0],[0,-PI/2,0]);
  a.wedge(cream,[[-1.68,0],[-1.04,.77],[1.54,.77],[1.57,0]],.136,[.87,1.13,.0],[0,-PI/2,0]);
  a.box(cream,0,2.14,.27,1.92,.20,2.61,.09);
  a.box(cream,0,1.67,1.49,1.76,.64,.16,.055);
  a.box(cream,0,1.11,-1.38,1.78,.16,.55,.047,SHELL,[.21,0,0]);
  a.box(ash,0,1.17,-1.04,1.56,.15,.32,.048,HIDE);
  a.strut(cream,[-.79,1.20,-1.38],[-.79,2.10,-1.0],.072,.072,SHELL);
  a.strut(cream,[.79,1.20,-1.38],[.79,2.10,-1.0],.072,.072,SHELL);
  a.strut(cream,[0,1.22,-1.38],[0,2.10,-1.0],.028,.028,SHELL);
  a.box(white,0,1.65,-1.185,1.54,.96,.022,.010,GLASS,[.415,0,0]);
  a.box(silver,0,.36,-1.519,1.95,.19,.20,.04,ALLOY);
  a.box(ash,0,.66,-1.62,.81,.37,.065,.059,HIDE);
  for(let j=0;j<4;j++)a.box(silver,0,.535+j*.080,-1.658,.71,.029,.043,.015,ALLOY);
  for(const x of [-.66,.66]){
    a.box(ash,x,.71,-1.61,.26,.25,.07,.041,HIDE);
    a.box(lamp,x,.71,-1.654,.20,.178,.035,.03,LIGHT);
    a.strut(silver,[x*1.20,1.48,-1.06],[x*1.68,1.47,-1.08],.031);
    a.box(silver,x*1.68,1.48,-1.085,.13,.27,.09,.041,ALLOY);
    a.strut(silver,[x*.63,1.232,-1.416],[x*1.06,1.31,-1.38],.017);
  }
  for(const sign of [-1,1]){
    a.box(cream,sign*.92,1.62,.61,.06,.68,1.59,.043);
    a.box(glass,sign*.960,1.60,.64,.026,.50,1.30,.022,HIDE);
    a.box(silver,sign*1.03,1.33,.63,.24,.056,1.36,.021,ALLOY);
    for(let j=0;j<9;j++){
      a.box(j%2?cream:pink,sign*1.11,1.90,.63+(j-4)*.16,.43,.047,.16,.018,SHELL,[0,0,-sign*.23]);
      a.box(j%2?cream:pink,sign*1.316,1.821,.63+(j-4)*.16,.051,.105,.16,.024);
    }
  }
  for(const x of [-.58,-.29,0,.29,.58])a.box(yellow,x,2.115,-1.027,.127,.071,.03,.021,LIGHT);
}
function turntable(a){
  const mag='#cf1576',pink='#fa6bc6';
  a.box(mag,0,.62,.06,1.65,.54,2.78,.19);
  a.box(mag,0,.89,-.63,1.65,.24,1.55,.12);
  a.box('#971059',0,.37,-1.31,1.33,.22,.45,.08,SHELL,[.31,0,0]);
  a.box(black,0,.38,-1.55,.93,.115,.033,.017,HIDE);
  a.cyl(silver,0,1.034,-.62,.664,.664,.055,[0,0,0],ALLOY,32);
  a.cyl(black,0,1.082,-.62,.628,.628,.041,[0,0,0],HIDE,32);
  for(let i=0;i<5;i++)a.tor('#42404a',0,1.108,-.62,.56-i*.082,.008,[PI/2,0,0],[1,1,1],HIDE);
  a.cyl(pink,0,1.111,-.62,.185,.185,.016,[0,0,0],SHELL,22);
  a.cyl(silver,0,1.135,-.62,.025,.025,.044);
  for(let i=0;i<4;i++)a.box(i%2?mag:pink,(i-1.5)*.32,.905,-1.36,.226,.115,.18,.033);
  for(const z of [-.61,-.2]){
    a.cyl(ash,-.70,1.099,z,.102,.107,.17,[0,0,0],HIDE);
    for(let i=0;i<8;i++){const t=i*PI/4;
      a.cyl('#615361',-.70+.101*Math.sin(t),1.098,z+.101*Math.cos(t),.012,.012,.13);
    }
  }
  a.pipe('#837489',[[.69,.84,1.18],[.64,1.38,1.26],[.69,2.17,1.11],[.68,2.22,1.0]],.093);
  a.box(ash,.69,2.234,1.03,.34,.21,.36,.047,ALLOY);
  a.pipe(silver,[[.63,2.232,1.01],[.47,2.23,.40],[.11,2.27,-.61],[-.07,2.18,-.91]],.046);
  a.box(ash,-.08,2.16,-.94,.22,.17,.27,.057,HIDE);
  a.box(pink,-.08,2.069,-.94,.12,.035,.13,.014,LIGHT);
}
function bumper(a) {
  a.tor(black,0,.43,0,1.0,.151,[PI/2,0,0],[1.09,1.49,1.39],HIDE);
  a.tor(silver,0,.55,0,1.0,.041,[PI/2,0,0],[1.035,1.425,1],ALLOY);
  a.sph(teal,0,.63,-.33,1.02,.41,1.17);
  a.sph(teal,0,.65,.82,.962,.50,.69);
  a.pipe(silver,[[-.75,.78,.95],[-.78,1.15,.56],[-.71,1.23,.10],[-.52,1.04,-.44],[0,.99,-.62],[.52,1.04,-.44],[.71,1.23,.10],[.78,1.15,.56],[.75,.78,.95]],.060);
  for(const s of [-1,1])a.pipe(white,[[s*.23,.969,-1.21],[s*.21,1.028,-1.04],[s*.19,1.088,-.70]],.057,SHELL);
  lamps(a,.50,.77,-1.38,.134);
  for(let i=0;i<3;i++)a.box(silver,0,.536+i*.07,-1.517,.40-.039*i,.033,.056,.012,ALLOY);
  a.strut(silver,[.57,.92,.90],[.76,2.075,1.05],.025,.018);
  a.sph('#f43b3b',.76,2.085,1.05,.104,.104,.104);
}
function bell(a){
  const br='#b87333', trim='#dcaa63', mute='#8c512d';
  a.box(mute,0,.40,.15,1.53,.28,2.55,.16,ALLOY);
  // Hollow bell mouth, flared toward the nose, with a distinct rolling clapper inside.
  a.lathe(br,0,.91,-.56,[[.06,-.68],[.38,-.64],[.47,-.40],[.51,-.17],[.64,.15],[.77,.42],[.80,.60],[.76,.68],[.69,.68],[.67,.58],[.61,.34],[.46,.00],[.44,-.24],[.30,-.48],[.06,-.55]],[-1.77,0,0],[1,1,.72],ALLOY);
  a.tor(trim,0,.774,-1.178,.76,.067,[-.20,0,0],[1,.73,1],ALLOY);
  a.tor(trim,0,.953,-.581,.56,.036,[-.20,0,0],[1,.75,1],ALLOY);
  a.sph(gold,0,.54,-1.22,.179,.197,.174,ALLOY);
  a.pipe(br,[[-.75,.64,.88],[-.69,1.52,.89],[-.53,1.93,.90],[0,2.08,.95],[.53,1.93,.90],[.69,1.52,.89],[.75,.64,.88]],.104);
  a.pipe(gold,[[-.70,1.18,.78],[-.61,1.73,.80],[-.38,1.97,.84],[0,2.015,.87],[.38,1.97,.84],[.61,1.73,.80],[.70,1.18,.78]],.032);
  a.tor(gold,0,2.13,.96,.167,.064);
  for(const s of [-1,1]){
    a.box(br,s*.87,.85,-.89,.40,.16,.82,.073,ALLOY,[.19,0,s*.13]);
    a.box(br,s*.87,.87,1.00,.40,.16,.78,.073,ALLOY,[-.15,0,-s*.12]);
    a.strut(trim,[s*.61,.68,.70],[s*.59,1.18,-.18],.065,.065);
    a.sph(gold,s*.73,1.16,-.31,.11,.11,.11,ALLOY);
  }
}
function amphibian(a){
  const aqua='#27b3ab', pale='#e5d0a3',green='#3c783f';
  a.sph(aqua,0,.70,-.10,.74,.40,1.53);
  a.box(aqua,0,.77,-.95,1.28,.50,.96,.17,SHELL,[.15,0,0]);
  for(const s of [-1,1]){
    a.sph(pale,s*1.00,.59,.01,.39,.36,1.55);
    a.sph(aqua,s*1.00,.74,.03,.40,.31,1.52);
    for(const z of [-.50,.65]){
      const ps=[[s*.65,.63,z],[s*.74,.89,z],[s*1.02,.998,z],[s*1.30,.87,z],[s*1.39,.63,z]];
      a.pipe(ash,ps,.062,HIDE);
    }
    a.pipe(silver,[[s*.60,.73,-.24],[s*.60,1.14,.13],[s*.59,1.34,.70],[s*.54,1.30,.97]],.055);
  }
  a.pipe('#887f65',[[-.74,.52,-1.18],[-.54,.44,-1.42],[0,.43,-1.58],[.54,.44,-1.42],[.74,.52,-1.18]],.064);
  lamps(a,.49,.71,-1.35,.179);
  for(const s of [-1,1])for(const off of [-.070,0,.070]){
    a.strut(ash,[s*.49+off,.577,-1.46],[s*.49+off,.843,-1.46],.013);
    a.strut(ash,[s*.49-.13,.71+off,-1.46],[s*.49+.13,.71+off,-1.46],.013);
  }
  a.tor(green,0,1.66,1.03,.632,.073);
  a.tor('#316136',0,1.66,1.18,.627,.055);
  a.cyl(green,0,1.66,1.10,.142,.142,.20,[PI/2,0,0]);
  for(let i=0;i<5;i++){
    const t=i*2*PI/5;
    a.sph(i%2?'#6aa04c':'#4b913f',Math.sin(t)*.337,1.66+Math.cos(t)*.337,1.112,.136,.265,.051,SHELL,[0,0,-t]);
  }
  a.strut(ash,[-.70,.79,1.15],[-.38,1.30,1.10],.074);
  a.strut(ash,[.70,.79,1.15],[.38,1.30,1.10],.074);
}
function steam(a){
  const fire='#c13836',brass='#c99749', smoke='#343139';
  a.box(fire,0,.62,.11,1.50,.36,3.26,.079);
  a.cyl(fire,0,.94,-.65,.56,.56,1.55,[PI/2,0,0]);
  a.cyl(smoke,0,.94,-1.457,.50,.50,.09,[PI/2,0,0],ALLOY);
  a.cyl(brass,0,.94,-1.515,.174,.174,.082,[PI/2,0,0],ALLOY);
  for(const z of [-1.27,-.68,-.11])a.tor(brass,0,.94,z,.554,.028);
  for(let i=0;i<12;i++){
    const t=i*PI/6;a.sph(gold,Math.sin(t)*.406,.94+Math.cos(t)*.406,-1.513,.032,.032,.032,ALLOY);
  }
  a.cyl(smoke,0,1.69,-1.00,.225,.108,.63,[0,0,0],ALLOY);
  a.cyl(brass,0,2.018,-1.00,.245,.233,.069,[0,0,0],ALLOY);
  a.cyl('#1c1a1f',0,2.054,-1.0,.190,.190,.011,[0,0,0],HIDE);
  a.cyl(brass,0,1.58,-.538,.121,.17,.20,[0,0,0],ALLOY);
  a.sph(gold,0,1.69,-.538,.123,.078,.123,ALLOY);
  a.cyl(brass,0,1.54,-1.18,.181,.181,.17,[PI/2,0,0],ALLOY);
  a.cyl(lamp,0,1.54,-1.277,.136,.136,.030,[PI/2,0,0],LIGHT);
  a.wedge(brass,[[-.83,-.24],[.83,-.24],[.52,.24],[-.52,.24]],.18,[0,.385,-1.67],[-.4,0,0],ALLOY);
  for(let i=0;i<7;i++)a.box(ash,(i-3)*.17,.376,-1.774,.082,.33,.035,.013,HIDE,[-.40,0,-(i-3)*.10]);
  a.box(fire,0,2.29,.64,1.58,.15,1.32,.068,SHELL,[-.08,0,0]);
  a.box(fire,0,1.44,1.225,1.38,1.55,.119,.067);
  a.box(brass,0,1.39,1.157,1.19,.052,.056,.026,ALLOY);
  for(const s of [-1,1]){
    a.box(fire,s*.68,1.04,.75,.15,.35,1.1,.046);
    a.strut(fire,[s*.64,1.10,.11],[s*.64,2.24,.11],.067,.067,SHELL);
    a.strut(fire,[s*.64,1.22,1.17],[s*.64,2.28,1.17],.067,.067,SHELL);
    a.strut(brass,[s*.73,.66,-.85],[s*.73,.66,1.27],.057,.056);
    a.box(fire,s*.62,.91,1.58,.114,.50,.60,.044);
    a.strut(brass,[s*.66,1.22,1.32],[s*.66,1.22,1.91],.041,.041);
  }
  a.box(fire,0,.84,1.89,1.38,.45,.13,.052);
}
function beetle(a){
  const amber='#e99120',shine='#ffcb5d', darkCopper='#70412b';
  a.box(darkCopper,0,.34,.05,1.15,.21,2.61,.12,ALLOY);
  a.sph(amber,0,.69,-.96,.72,.49,.74);
  a.pipe(gold,[[0,.523,-1.65],[0,.92,-1.36],[0,1.15,-.95],[0,1.17,-.59]],.047);
  for(const s of [-1,1]){
    a.sph(amber,s*.675,1.25,.74,.55,.33,.97,SHELL,[-.41,0,s*.70]);
    a.sph(shine,s*.72,1.29,.77,.49,.30,.87,SHELL,[-.41,0,s*.70]);
    a.pipe(gold,[[s*.43,.85,-.10],[s*.70,1.28,.10],[s*.92,1.65,.66],[s*.70,1.87,1.15],[s*.49,1.56,1.55],[s*.41,1.02,1.55]],.048);
    for(let i=0;i<3;i++)a.pipe(amber,[[s*.49,.96+.14*i,.25+.16*i],[s*.74,1.33+.12*i,.44+.16*i],[s*.91,1.58+.09*i,.75+.14*i]],.026);
    a.pipe(darkCopper,[[s*.57,.75,-1.34],[s*.66,1.02,-1.45],[s*.56,1.23,-1.57],[s*.44,1.22,-1.63]],.045);
    a.strut(bronze,[s*.45,.13,-1.11],[s*.75,.57,-1.10],.063,.056);
    for(let i=0;i<3;i++)a.tor(gold,s*(.51+.065*i),.22+.09*i,-1.10,.073,.018,[-PI/2,0,s*.45]);
  }
  lamps(a,.44,.62,-1.48,.164,shine);
}
function marble(a){
  const purple='#6529a7', deep='#352157';
  a.sph(deep,0,.78,.12,.74,.51,.89);
  const back=new T.SphereGeometry(1,24,14,0,PI);
  a.add(back,purple,[0,1.12,.295],[0,0,0],[.86,.90,.81]);
  // Open front and upper arc: solid purple rear shell and translucent clear dome panel.
  const cover=new T.SphereGeometry(1,24,14,0,2*PI,0,1.16);
  a.add(cover,purple,[0,1.14,.15],[.13,0,0],[.93,.97,.87],VIOLET);
  a.sph(purple,0,.65,-.38,.76,.36,.66);
  a.pipe(gold,[[-.73,.79,-.30],[-.86,1.26,-.16],[-.78,1.73,.17],[-.50,1.97,.33],[0,2.08,.45],[.50,1.97,.33],[.78,1.73,.17],[.86,1.26,-.16],[.73,.79,-.30]],.049);
  a.pipe(bronze,[[-.72,.73,-.37],[-.56,.85,-.72],[0,.93,-1.02],[.56,.85,-.72],[.72,.73,-.37]],.037);
  a.cyl(gold,0,2.072,.45,.11,.14,.105,[0,0,0],ALLOY);
  for(const s of [-1,1]){
    a.strut(gold,[s*.57,.42,.65],[s*.97,.41,.68],.103,.094);
    a.sph(bronze,s*.868,1.15,-.12,.083,.090,.09,ALLOY);
  }
  a.strut(bronze,[0,.68,-.90],[0,.26,-1.24],.079,.057);
  a.sph(gold,0,.64,-1.048,.29,.155,.115,ALLOY);
  a.sph(lamp,0,.645,-1.150,.224,.104,.062,LIGHT);
}
function dragon(a){
  const ivory='#ddd09e',ivoryL='#f4e4bc',warm='#b09970',socket='#624827';
  a.box(socket,0,.39,.12,1.35,.27,2.68,.095,HIDE);
  a.sph(ivory,0,.635,-1.13,.54,.27,.56);
  a.sph(ivoryL,0,.682,-1.48,.30,.19,.575);
  a.sph(warm,0,.413,-1.54,.35,.105,.52);
  for(const s of [-1,1]){
    a.sph(warm,s*.359,.759,-1.17,.185,.124,.26,HIDE,[.20,s*.22,0]);
    a.sph(socket,s*.377,.776,-1.235,.158,.083,.169,HIDE,[.15,s*.24,0]);
    a.sph(gold,s*.442,.786,-1.224,.051,.060,.059,LIGHT);
    a.sph(socket,s*.17,.753,-1.84,.085,.038,.148,HIDE,[.22,s*.12,0]);
    a.pipe(ivoryL,[[s*.46,.79,-1.04],[s*.39,.93,-.93],[s*.36,1.19,-.77],[s*.40,1.43,-.68]],.096,SHELL);
    a.strut(ivoryL,[s*.40,1.27,-.722],[s*.43,1.50,-.66],.077,.008,SHELL);
    a.pipe(ivory,[[s*.31,.50,-1.91],[s*.45,.51,-1.63],[s*.52,.53,-1.29],[s*.51,.65,-.98]],.062,SHELL);
    for(let j=0;j<4;j++) {
      const z=-1.75+j*.17;
      a.strut(ivoryL,[s*(.33+j*.038),.562,z],[s*(.30+j*.043),.424,z-.053],.043,.006,SHELL);
    }
    for(let j=0;j<4;j++){
      const z=-.20+j*.38;
      a.pipe(j%2?ivoryL:ivory,[[s*.58,.38,z-.16],[s*.75,.62,z-.10],[s*.86,1.03,z],[s*.72,1.39,z+.08],[s*.65,1.55,z+.13]],.058,SHELL);
      a.strut(ivoryL,[s*.71,1.37,z+.08],[s*.67,1.62,z+.19],.063,.008,SHELL);
    }
    a.pipe(ivory,[ [s*.51,.92,-.94],[s*.69,1.07,-.44],[s*.78,1.18,.26],[s*.66,1.31,.94],[s*.52,1.38,1.28] ],.063,SHELL);
  }
  a.strut(ivoryL,[-.62,1.04,-.38],[.62,1.04,-.38],.053,.053,SHELL);
  const tail=[[0,.87,1.05],[0,1.02,1.34],[0,1.19,1.60],[0,1.42,1.78],[0,1.55,1.98],[0,1.58,2.17]];
  a.pipe(ivory,tail,.075,SHELL);
  tail.forEach(([x,y,z],i)=>{
    const r=.131-i*.013;
    a.sph(i%2?ivory:ivoryL,x,y,z,r*1.1,r*.84,r*1.09);
    a.strut(ivoryL,[x,y+.022,z],[x,y+r*1.64,z+.083],r*.38,.008,SHELL);
  });
}

const axle=(x,z,r,width,steer,extra={})=>({x,z,r,width,steer,...extra});
function pair(x,z,r,width,steer,extra={}) {
  return [-1,1].map(s=>axle(s*x,z,r,width,steer,extra));
}
function two(front,rear,extra={}) {
  return [...pair(...front,true,extra),...pair(...rear,false,extra)];
}
function concept(id,name,role,color,trim,mount,wh,wheels,bounds,body,tail=[.52,1.47],hover=false){
  const {x=0,y,z,scale}=mount;
  return {id,name,role,color,trim,mount:{x,y,z,scale},seat:false,wheels,bounds,tail,...(hover?{hover}:{}),
    build(h){
      const a=build(h);body(a);seat(a,x,y,z,scale,wh);
    }
  };
}

export const concepts=[
  concept('market-dragster','Market Dragster','Chrome wire-basket dragster','#dc352d',silver,{y:.74,z:-.05,scale:.81},'#af302a',
    [...pair(.89,-1.46,.272,.229,true,{rim:silver}),...pair(.994,1.20,.523,.481,false,{rim:silver})],[1.35,-2.12,1.81],basket,[.54,1.25]),
  concept('ramp-tug','Ramp Tug','Airport utility sprint tractor','#b6cc10',white,{y:.79,z:.22,scale:.75},'#342a2a',
    two([.91,-.96,.356,.27],[.91,1.10,.373,.27],{style:'offroad',rim:silver}),[1.15,-1.67,1.62],tug),
  concept('tiki-barrel','Tiki Barrel','Carved wooden barrel kart',teal,cane,{y:1.10,z:.055,scale:.75},'#74503b',
    two([1.006,-.65,.456,.312],[1.006,.72,.456,.312],{style:'wood',rim:cane,tire:wood}),[1.24,-1.37,1.31],barrel,[.55,1.18]),
  concept('ice-cream-van','Ice-Cream Van','Pastel step van','#78c9d7','#ee78a7',{y:1.02,z:-.57,scale:.56},'#705247',
    two([.865,-.99,.349,.24],[.865,1.04,.349,.24],{rim:silver}),[1.36,-1.77,1.76],icecream,[.35,1.80]),
  concept('groove-racer','Groove Racer','Turntable kart','#cf1576','#fa6bc6',{y:.83,z:.45,scale:.76},'#4e354f',
    two([.935,-1.01,.441,.30],[.935,1.03,.468,.30],{rim:'#e03690',style:'speaker'}),[1.17,-1.58,1.56],turntable),
  concept('bumper-bolt','Bumper Bolt','Round bumper-car racer',teal,white,{y:.92,z:.45,scale:.74},'#775039',
    [axle(0,-.94,.235,.235,true,{rim:silver}),...pair(1.01,.87,.392,.247,false,{rim:silver})],[1.31,-1.74,1.74],bumper),
  concept('bronze-bell','Bronze Bell','Open bronze bell kart','#b87333',gold,{y:.85,z:.26,scale:.74},'#674437',
    two([.89,-.93,.436,.29],[.89,.96,.449,.29],{rim:gold,style:'offroad'}),[1.13,-1.59,1.52],bell),
  concept('reed-skimmer','Reed Skimmer','Twin-pontoon hover racer','#27b3ab',cream,{y:.86,z:.23,scale:.78},'#795238',
    [],[1.48,-1.67,1.58],amphibian,[.70,1.42],true),
  concept('steam-sprint','Steam Sprint','Miniature steam locomotive','#c13836',gold,{y:.85,z:.57,scale:.73},'#54392f',
    [...pair(.786,-.96,.401,.22,true,{style:'spoke',rim:red}),...pair(.786,.08,.498,.22,false,{style:'spoke',rim:red}),...pair(.786,1.19,.498,.22,false,{style:'spoke',rim:red})],[.99,-1.89,2.05],steam,[.61,1.95]),
  concept('amber-beetle','Amber Beetle','Wing-shell wheels-only racer','#e99120','#ffcb5d',{y:.76,z:.40,scale:.75},'#69422d',
    two([.857,-1.08,.394,.277],[.857,1.03,.432,.283],{style:'offroad',rim:'#e99120'}),[1.21,-1.75,1.67],beetle),
  concept('violet-marble','Violet Marble','Glass bubble trike','#6529a7',gold,{y:.78,z:.08,scale:.73},'#70493d',
    [axle(0,-1.20,.265,.20,true,{rim:gold}),...pair(.907,.67,.411,.245,false,{rim:gold})],[1.13,-1.48,1.14],marble),
  concept('bone-wyrm','Bone Wyrm','Ivory dragon-skeleton kart','#ddd09e','#b09970',{y:.79,z:.29,scale:.75},'#76513a',
    two([.85,-1.06,.401,.27],[.85,1.00,.430,.28],{style:'offroad',rim:cream}),[1.09,-2.08,2.28],dragon,[.53,1.45]),
];
