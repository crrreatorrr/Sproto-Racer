import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const {PI} = Math;
const bronze='#c58c43', gold='#f2ac4c', silver='#b9b9ba', black='#222128', ash='#37323b',
    cream='#f3dfbc', white='#fff3d7', teal='#149ca2', wood='#92502e', cane='#eab373',
    lamp='#ffe2a0', dark='#211b23', red='#b43032', yellow='#f5a928';

// Chassis equipment is baked as rigid art; steering and wheel animation stay with the race renderer.
const SHELL='solid', ALLOY='metal', HIDE='rubber', LIGHT='glow', COAT='coat', GLASS='glass', VIOLET='violet';

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
  // Each length station is [z, half-width, crown-y, depth-half-height, lateral offset].
  // Rounded-rect cross-sections are used for pressed body skins, narrower ovals for pontoons.
  function hull(c,stations,mat=SHELL,{facets=24,squareness=1}={}){
    const v=[],ix=[];
    const p=n=>Math.sign(n)*Math.pow(Math.abs(n),squareness);
    for(const [z,w,y,ht,x=0] of stations)for(let j=0;j<facets;j++){
      const t=j*2*PI/facets;v.push(x+w*p(Math.sin(t)),y+ht*p(Math.cos(t)),z);
    }
    for(let i=0;i<stations.length-1;i++)for(let j=0;j<facets;j++){
      const a=i*facets+j,b=i*facets+(j+1)%facets,d=b+facets,e=a+facets;
      ix.push(a,e,b,b,e,d);
    }
    for(const [end,d] of [[0,-1],[stations.length-1,1]]){
      const [z,,y,,x=0]=stations[end], center=v.length/3;v.push(x,y,z);
      for(let j=0;j<facets;j++){
        const a=end*facets+j,b=end*facets+(j+1)%facets;
        ix.push(...(d<0?[center,a,b]:[center,b,a]));
      }
    }
    const mesh=new T.BufferGeometry();
    mesh.setAttribute('position',new T.Float32BufferAttribute(v,3));mesh.setIndex(ix);mesh.computeVertexNormals();
    add(mesh,c,[0,0,0],[0,0,0],[1,1,1],mat);
  }
  function patch(c,side,def,mat=SHELL,nx=12,ny=8){
    const v=[],ix=[];
    for(let i=0;i<=ny;i++)for(let j=0;j<=nx;j++)v.push(...def(j/nx,i/ny));
    for(let i=0;i<ny;i++)for(let j=0;j<nx;j++){
      const a=i*(nx+1)+j,b=a+1,e=a+nx+1,d=e+1;
      ix.push(...(side>0?[a,e,b,b,e,d]:[a,b,e,b,d,e]));
    }
    const mesh=new T.BufferGeometry();
    mesh.setAttribute('position',new T.Float32BufferAttribute(v,3));mesh.setIndex(ix);mesh.computeVertexNormals();
    add(mesh,c,[0,0,0],[0,0,0],[1,1,1],mat);
  }
  return {add,box,sph,cyl,strut,pipe,tor,lathe,wedge,hull,patch};
}

function seat(a,x,y,z,s,col='#533728'){
  a.box(col,x,y-.067*s,z+.035*s,.94*s,.19*s,.94*s,.10*s,HIDE);
  a.box(col,x,y+.39*s,z+.443*s,.93*s,.82*s,.20*s,.12*s,HIDE,[.105,0,0]);
  a.box(col,x,y+.68*s,z+.44*s,.58*s,.27*s,.24*s,.09*s,HIDE);
  for(const k of [-1,1]){
    a.box(col,x+k*.50*s,y+.10*s,z,.15*s,.27*s,.76*s,.06*s,HIDE);
    a.pipe('#9d7062',[[x+k*.40*s,y+.14*s,z-.28*s],[x+k*.40*s,y+.32*s,z+.30*s],[x+k*.35*s,y+.70*s,z+.32*s]],.012*s,HIDE,8,5);
    a.box('#38343a',x+k*.37*s,y+.19*s,z+.20*s,.075*s,.047*s,.21*s,.014*s,HIDE);
  }
  for (const h of [.33,.46,.59]) a.box('#151417',x,y+h*s,z+.354*s,.56*s,.022*s,.021*s,.005*s,HIDE);
}
function lamps(a,x,y,z,r=.15,c=lamp){
  for(const s of [-1,1]){
    a.cyl(ash,s*x,y,z,r*1.24,r*1.24,.13,[PI/2,0,0],ALLOY);
    a.tor(silver,s*x,y,z-.073,r*1.14,r*.105,[0,0,0],[1,1,1],ALLOY);
    a.cyl(c,s*x,y,z-.074,r,r,.03,[PI/2,0,0],LIGHT);
  }
}

function basket(a){
  const steel='#a8adb6';
  a.hull('#616b77',[[-1.43,.45,.36,.075],[-1.18,.61,.39,.091],[.72,.67,.42,.10],[1.25,.57,.40,.088],[1.43,.43,.39,.061]],ALLOY,{facets:16,squareness:.37});
  a.box('#242127',0,.565,-.19,.99,.065,1.33,.035,HIDE);
  for(const x of [-.51,.51]){
    a.pipe(steel,[[x*.82,.30,-1.82],[x,.358,-1.46],[x*1.10,.40,-.82],[x*1.20,.42,.55],[x*1.30,.45,1.35]],.048,ALLOY,18,9);
    a.strut(silver,[x*.84,.31,-1.52],[x*1.72,.27,-1.46],.051,.036,ALLOY);
    a.strut('#252321',[x*1.10,.43,1.05],[x*1.94,.52,1.20],.073,.051,ALLOY);
  }
  a.cyl('#5f5b5b',0,.52,1.17,.17,.152,.38,[0,0,PI/2],ALLOY,12);
  a.pipe(silver,[[-.52,.42,-1.34],[0,.42,-1.04],[.52,.42,-1.34]],.039,ALLOY,12,8);
  a.pipe(silver,[[-.59,.32,1.32],[-.60,.28,-1.42],[-.48,.18,-1.94],[.48,.18,-1.94],[.60,.28,-1.42],[.59,.32,1.32]],.048);
  function border(t){
    const w=.67+.19*t, endWidth=.57+.165*t, fr=-1.34-.22*t,re=1.10+.08*t,y=.48+.80*t;
    const frame=[[-endWidth,y,fr],[endWidth,y,fr],[w,y+.25*t,re],[-w,y+.25*t,re],[-endWidth,y,fr]];
    for(let i=0;i<4;i++)a.strut(silver,frame[i],frame[i+1],t===1?.046:.028);
    for(let i=0;i<4;i++)a.sph(silver,...frame[i],.043,.039,.040,ALLOY);
  }
  for(const t of [0,.24,.48,.73,1])border(t);
  for(const s of [-1,1]){
    for(let i=0;i<=8;i++){
      const t=i/8;
      a.strut(silver,[s*(.57+.10*t),.48,-1.34+2.44*t],[s*(.735+.125*t),1.28+.25*t,-1.56+2.74*t],.025);
    }
    a.pipe(silver,[[s*.68,.56,.99],[s*.78,1.47,1.21],[s*.84,2.14,1.52],[s*.76,2.19,1.55]],.050);
    a.box(steel,s*.59,1.02,1.30,.52,.27,.93,.065,ALLOY);
    for(let k=0;k<3;k++)a.pipe(silver,[[s*(.38+k*.16),.77,.82],[s*(.48+k*.17),.84,1.21],[s*(.51+k*.17),1.16,1.50],[s*(.53+k*.17),1.44,1.62]],.070);
  }
  for(let i=-4;i<=4;i++)a.strut(silver,[i*.136,.48,-1.34],[i*.18,1.28,-1.56],.024);
  a.strut('#dc352d',[-.75,2.19,1.55],[.75,2.19,1.55],.083,.083,COAT);
  for(let i=0;i<9;i++)a.cyl('#ba2a28',(i-4)*.149,2.19,1.55,.086,.086,.024,[0,0,PI/2],HIDE,10);
  for(const side of [-1,1]){
    const x=side*.7;
    a.pipe(silver,[[side*.56,1.07,1.29],[x,1.22,1.47],[x,1.46,1.61],[x,1.47,1.75]],.068,ALLOY,12,8);
    a.box('#555d68',side*.69,1.39,1.17,.24,.28,.60,.069,ALLOY,[.17,0,side*.17]);
    for(let i=0;i<4;i++)a.box(silver,side*.74,1.474,1.00+i*.105,.11,.026,.037,.009,ALLOY,[.17,0,side*.17]);
  }
  a.box('#3f3d46',0,1.591,1.32,.78,.082,.48,.028,HIDE);
  for(const x of [-.31,.31])a.box(red,x,1.559,1.468,.10,.038,.23,.008,COAT);
  a.box(ash,0,1.42,1.22,.96,.27,.73,.065,HIDE);
  a.box(silver,0,1.69,1.18,.93,.16,.56,.055,ALLOY);
  for(const x of [-.28,0,.28]){
    a.cyl(silver,x,1.69,.91,.151,.151,.10,[PI/2,0,0],ALLOY,12);
    a.cyl('#59171d',x,1.69,.852,.109,.109,.027,[PI/2,0,0],HIDE,16);
    a.tor('#c64136',x,1.69,.837,.112,.025,[0,0,0],[1,1,1],COAT);
    a.cyl('#201b25',x,1.69,.829,.073,.073,.011,[PI/2,0,0],HIDE,12);
  }
}
function tug(a){
  const lime='#b6cc10', low='#7d8d0d';
  a.hull('#819408',[[-1.52,.79,.461,.232],[-1.34,.874,.505,.25],[-.93,.83,.51,.24],[.22,.762,.48,.215],[1.00,.78,.50,.236],[1.44,.843,.51,.232],[1.54,.76,.503,.20]],COAT,{facets:24,squareness:.33});
  a.box('#44474d',0,.385,.03,1.41,.125,2.69,.065,ALLOY);
  a.box('#303138',0,.61,.252,.97,.13,1.33,.05,HIDE);
  a.box(lime,0,.76,-.99,1.76,.24,.96,.08,COAT);
  a.box('#84910c',0,.884,-.979,1.17,.034,.67,.021,ALLOY);
  a.box('#cfdb24',0,.908,-.979,1.12,.03,.62,.018,COAT);
  for(const x of [-.48,.48])for(const z of [-.742,-1.22])
    a.cyl('#878e44',x,.93,z,.016,.016,.028,[0,0,0],ALLOY,6);
  a.box(lime,0,.73,1.22,1.71,.30,.63,.07);
  a.box(black,0,.34,-1.53,1.90,.39,.19,.05,HIDE);
  for(let i=0;i<5;i++)a.box(white,(i-2)*.35,.347,-1.64,.16,.35,.032,.007,SHELL,[0,0,-.45]);
  for(const s of [-1,1]){
    a.hull(lime,[[-1.417,.092,.68,.11,s*.82],[-1.224,.13,.817,.098,s*.812],[-.831,.133,.819,.088,s*.806],[-.52,.116,.71,.122,s*.797],[.04,.113,.60,.117,s*.806],[.48,.123,.71,.15,s*.807],[.87,.13,.817,.089,s*.813],[1.29,.126,.813,.086,s*.816],[1.47,.103,.72,.108,s*.819]],COAT,{facets:14,squareness:.42});
    a.box('#53574d',s*.88,.446,.0,.094,.119,.58,.024,HIDE);
    for(let i=0;i<4;i++)a.box('#919340',s*.928,.454,-.197+.125*i,.02,.053,.036,.009,ALLOY);
    a.box(low,s*.887,.63,.55,.046,.41,.55,.04);
    a.box('#33363b',s*.65,.719,1.52,.29,.19,.093,.025,HIDE);
    a.box(red,s*.65,.726,1.57,.225,.11,.022,.008,COAT);
    a.box('#ced4cd',s*.58,.710,1.585,.057,.053,.012,.003,ALLOY);
    a.wedge('#687809',[[0,0],[.46,0],[.37,.14],[.07,.13]],.043,[s*.90,.421,.0],[0,PI/2,0],ALLOY);
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
    a.tor('#a66e41',0,y,0,r,.057,[PI/2,0,0],[1,1.13,1],HIDE);
    // Two interwoven strands, rather than a straight torus with loose beads.
    for(let twist=0;twist<2;twist++){
      const ps=Array.from({length:97},(_,i)=>{
        const t=i*2*PI/96,wave=19*t+twist*PI,spread=r+.031*Math.cos(wave);
        return [spread*Math.sin(t),y+.037*Math.sin(wave),spread*1.13*Math.cos(t)];
      });
      a.pipe(['#dfab72','#ffc78e'][twist],ps,.031,HIDE,96,5);
    }
  }
  a.wedge('#814723',[[-.53,.27],[-.57,.10],[-.50,-.29],[-.28,-.39],[.28,-.39],[.50,-.29],[.57,.10],[.53,.27],[.26,.34],[0,.24],[-.26,.34]],.102,[0,.88,-1.132],[0,0,0],HIDE);
  for(const side of [-1,1]){
    const x=side*.45;
    a.box('#745034',x,.49,1.097,.34,.32,.12,.09,ALLOY);
    a.box(gold,x,.49,1.147,.27,.22,.055,.055,ALLOY);
    a.pipe('#4c2e22',[[side*.433,1.018,-1.191],[side*.557,.89,-1.16],[side*.55,.68,-1.167],[side*.40,.59,-1.190]],.023,HIDE,10,5);
    a.pipe('#eeb173',[[side*.17,.98,-1.234],[side*.33,1.009,-1.247],[side*.463,.97,-1.213]],.033,SHELL,9,6);
  }
  for(let i=0;i<11;i++){
    const t=2*PI*i/11;
    a.cyl('#7f4a33',.905*Math.sin(t),1.384,1.019*Math.cos(t),.014,.014,.018,[0,0,0],ALLOY,6);
  }
  for(const s of [-1,1]){
    a.pipe('#d29457',[[s*.065,1.02,-1.22],[s*.32,1.12,-1.24],[s*.54,1.13,-1.19]],.075,SHELL);
    a.sph(wood,s*.32,.98,-1.235,.17,.070,.06,HIDE);
    a.pipe(cane,[[s*.08,.77,-1.22],[s*.34,.82,-1.21],[s*.48,.74,-1.19],[s*.51,.62,-1.17]],.066,SHELL);
  }
  a.wedge('#f1bc78',[[-.06,.09],[.082,.08],[.102,-.02],[.073,-.10],[-.087,-.09],[-.115,-.02]],.065,[0,.911,-1.244],[0,0,0],SHELL);
  a.wedge('#4d261a',[[-.32,.038],[-.22,.108],[.22,.108],[.32,.038],[.22,-.055],[-.22,-.055]],.036,[0,.648,-1.246],[0,0,0],HIDE);
  a.pipe(cane,[[-.36,.61,-1.22],[0,.56,-1.25],[.36,.61,-1.22]],.07,SHELL);
  for(let i=0;i<5;i++){
    const t=i*2*PI/5; a.sph('#df4233',.99+Math.cos(t)*.03,1.03+Math.sin(t)*.13,-.26+Math.cos(t)*.13,.047,.095,.085,SHELL,[t,0,0]);
  }
  a.sph('#f6bd54',1.04,1.03,-.26,.046,.051,.051);
}
function icecream(a){
  const sky='#78c9d7',pink='#ee78a7',glass='#294b56';
  a.hull(sky,[[-1.62,.71,.638,.198],[-1.50,.83,.62,.25],[-1.31,.69,.605,.271],[-.92,.695,.605,.275],[-.37,.84,.60,.293],[.38,.83,.601,.296],[.92,.692,.601,.267],[1.32,.699,.603,.267],[1.54,.86,.594,.298],[1.62,.74,.596,.230]],COAT,{facets:26,squareness:.32});
  // True molded fender openings, outside a narrower undercarriage.
  const lowerEdge=[[-1.62,.34],[-1.46,.33],[-1.356,.36],[-1.33,.50],[-1.27,.64],[-1.16,.72],[-.99,.75],[-.84,.721],[-.72,.638],[-.639,.481],[-.618,.34],[.678,.34],[.717,.49],[.78,.63],[.89,.719],[1.04,.751],[1.20,.696],[1.31,.61],[1.376,.474],[1.405,.34],[1.61,.34]];
  for(const sign of [-1,1]){
    a.wedge(sky,[...lowerEdge,[1.61,.94],[-1.62,.94]],.072,[sign*.907,0,0],[0,-PI/2,0],COAT);
    for(const [start,end] of [[2,10],[11,19]]){
      const line=lowerEdge.slice(start,end+1).map(([z,y])=>[sign*.947,y+.005,z]);a.pipe('#9fd6df',line,.025,COAT,20,6);
    }
  }
  a.box(cream,0,.98,.22,1.86,.43,2.99,.06);
  a.box(pink,0,.97,.22,1.873,.073,3.012,.025);
  a.wedge(cream,[[-1.68,0],[-1.04,.77],[1.54,.77],[1.57,0]],.136,[-.87,1.13,.0],[0,-PI/2,0]);
  a.wedge(cream,[[-1.68,0],[-1.04,.77],[1.54,.77],[1.57,0]],.136,[.87,1.13,.0],[0,-PI/2,0]);
  a.hull(cream,[[-1.062,.83,2.095,.052],[-.975,.945,2.13,.085],[-.67,.954,2.152,.078],[1.25,.953,2.149,.079],[1.52,.929,2.12,.077],[1.58,.827,2.118,.052]],COAT,{facets:24,squareness:.48});
  for(const sign of [-1,1])a.pipe('#cab694',[[sign*.82,2.083,-1.05],[sign*.938,2.079,-.87],[sign*.951,2.076,.27],[sign*.936,2.07,1.51],[sign*.82,2.066,1.57]],.016,ALLOY,16,6);
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
    a.box(silver,sign*.969,1.58,-.09,.017,.525,.036,.007,ALLOY);
    a.box(silver,sign*.969,1.585,1.359,.017,.522,.036,.007,ALLOY);
    a.box(cream,sign*.925,1.25,-.43,.022,.74,.52,.025);
    a.box('#a5a9aa',sign*.963,1.304,-.348,.031,.034,.188,.013,ALLOY);
    a.box('#e7b675',sign*.945,.67,-1.10,.026,.08,.15,.02,LIGHT);
    a.box(red,sign*.73,.62,1.735,.17,.24,.034,.027,COAT);
    a.box('#ebe1c1',sign*.732,.552,1.756,.106,.039,.015,.006,ALLOY);
    for(let j=0;j<9;j++){
      a.box(j%2?cream:pink,sign*1.11,1.90,.63+(j-4)*.16,.43,.047,.16,.018,SHELL,[0,0,-sign*.23]);
      a.box(j%2?cream:pink,sign*1.316,1.821,.63+(j-4)*.16,.051,.105,.16,.024);
    }
  }
  a.box(cream,0,1.313,1.670,1.63,.90,.072,.07);
  a.box(silver,0,.361,1.696,1.87,.17,.12,.04,ALLOY);
  a.box(ash,0,1.367,1.721,.03,.62,.024,.006,HIDE);
  for(const x of [-.58,-.29,0,.29,.58])a.box(yellow,x,2.115,-1.027,.127,.071,.03,.021,LIGHT);
}
function turntable(a){
  const mag='#cf1576',pink='#fa6bc6';
  a.hull('#b9156b',[[-1.54,.52,.54,.189],[-1.39,.74,.578,.245],[-1.17,.794,.647,.28],[-.77,.821,.673,.30],[-.08,.82,.626,.275],[.39,.785,.568,.243],[.82,.801,.627,.292],[1.21,.793,.64,.228],[1.44,.629,.596,.192]],COAT,{facets:24,squareness:.45});
  a.hull('#dc2e93',[[-1.37,.686,.879,.062],[-1.24,.794,.922,.083],[-.90,.819,.943,.08],[-.45,.825,.934,.078],[-.02,.755,.855,.049],[.10,.631,.84,.026]],COAT,{facets:22,squareness:.32});
  for(const sign of [-1,1]){
    a.hull('#bc196f',[[-.39,.041,.869,.041,sign*.67],[-.22,.073,.907,.069,sign*.711],[.16,.092,.938,.094,sign*.735],[.56,.098,.963,.111,sign*.752],[.97,.101,1.003,.142,sign*.745],[1.11,.083,1.005,.122,sign*.721],[1.17,.051,.958,.067,sign*.706]],COAT,{facets:16,squareness:.39});
    a.pipe('#e94d9f',[[sign*.67,.898,-.38],[sign*.742,.951,-.18],[sign*.790,1.029,.45],[sign*.785,1.128,.99],[sign*.748,1.066,1.143]],.022,COAT,13,6);
    a.wedge(mag,[[-.42,-.13],[.56,-.135],[.53,.059],[.08,.189],[-.41,.025]],.066,[sign*.791,.64,.23],[0,PI/2,0],COAT);
  }
  a.box('#971059',0,.37,-1.31,1.33,.22,.45,.08,SHELL,[.31,0,0]);
  a.box(black,0,.38,-1.55,.93,.115,.033,.017,HIDE);
  a.cyl(silver,0,1.034,-.62,.664,.664,.055,[0,0,0],ALLOY,32);
  a.cyl(black,0,1.082,-.62,.628,.628,.041,[0,0,0],HIDE,32);
  for(let i=0;i<5;i++)a.tor('#42404a',0,1.108,-.62,.56-i*.082,.008,[PI/2,0,0],[1,1,1],HIDE);
  a.cyl(pink,0,1.111,-.62,.185,.185,.016,[0,0,0],COAT,22);
  for(const x of [-.752,.752]){
    const slot= x<0?.32:.22;
    a.box(ash,x,1.024,slot,.134,.045,.47,.034,HIDE);
    a.box(silver,x,1.051,slot,.025,.017,.338,.005,ALLOY);
    a.box(pink,x,1.071,slot-.064,.115,.065,.074,.012,COAT);
    a.box('#321524',x*.83,.73,1.422,.284,.263,.061,.05,HIDE);
    for(let i=0;i<4;i++)a.box(silver,x*.83,.65+.046*i,1.457,.20,.018,.018,.004,ALLOY);
  }
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
  a.hull('#0d97a5',[[-1.51,.41,.652,.145],[-1.39,.645,.701,.231],[-1.17,.84,.686,.293],[-.91,.974,.633,.38],[-.62,1.01,.593,.285],[-.34,.98,.551,.238],[.14,.965,.55,.208],[.52,1.012,.64,.285],[.89,.963,.668,.337],[1.18,.873,.667,.286],[1.44,.661,.624,.18],[1.52,.41,.564,.114]],COAT,{facets:30,squareness:.65});
  // Raised cockpit surround and flared wheel-tops are shaped separately from the tub.
  for(const sign of [-1,1]){
    a.hull(teal,[[.19,.109,.738,.143,sign*.825],[.44,.171,.763,.181,sign*.863],[.76,.206,.913,.225,sign*.823],[.98,.209,.914,.224,sign*.802],[1.20,.166,.771,.164,sign*.746],[1.42,.09,.64,.12,sign*.664]],COAT,{facets:18,squareness:.74});
    a.pipe('#2a6e70',[[sign*.962,.626,.32],[sign*1.003,.708,.57],[sign*1.018,.761,.83],[sign*.986,.711,1.08],[sign*.897,.628,1.30]],.018,ALLOY,15,6);
  }
  for(const side of [-1,1]){
    a.pipe(silver,[[side*.74,.62,.41],[side*.89,.64,.52],[side*1.01,.73,.83],[side*.90,.65,1.19],[side*.72,.57,1.27]],.042,ALLOY,12,7);
    a.sph(red,side*.51,.72,1.384,.14,.083,.062,COAT);
    a.box(ash,side*.35,.424,1.485,.27,.22,.123,.05,ALLOY);
  }
  for(let i=0;i<22;i++){
    const t=i*2*PI/22;
    a.pipe('#34323c',[-.082,.0,.082].map((h,j)=>[(1.16-(j%2)*.013)*Math.sin(t),.43+h,(1.60-(j%2)*.013)*Math.cos(t)]),.012,HIDE,4,5);
  }
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
  a.tor('#8a542d',0,.79,-1.167,.70,.024,[-.20,0,0],[1,.74,1],ALLOY);
  a.tor('#d49c54',0,.925,-.786,.635,.018,[-.20,0,0],[1,.76,1],ALLOY);
  // Relief cast into the upper taper, in the same curvature as the bell.
  for(const x of [-.39,-.196,0,.196,.39]){
    const f=Math.abs(x);
    const base=1.313-.29*f;
    a.pipe('#8a5936',[[x-.048,base,-1.023],[x-.043,base+.061,-.855],[x,base+.106,-.767],[x+.043,base+.056,-.85],[x+.048,base,-1.023]],.017,ALLOY,10,5);
  }
  a.sph(gold,0,.54,-1.22,.179,.197,.174,ALLOY);
  a.strut(mute,[0,.65,-1.22],[0,.928,-.949],.05,.066,ALLOY);
  for(let i=0;i<13;i++){
    const t=i*PI/6, x=.72*Math.sin(t), y=.785+.525*Math.cos(t);
    a.cyl('#bb8247',x,y,-1.216-.105*Math.cos(t),.035,.041,.045,[PI/2-.20,0,0],ALLOY,7);
  }
  a.pipe(br,[[-.75,.64,.88],[-.69,1.52,.89],[-.53,1.93,.90],[0,2.08,.95],[.53,1.93,.90],[.69,1.52,.89],[.75,.64,.88]],.104);
  a.pipe(gold,[[-.70,1.18,.78],[-.61,1.73,.80],[-.38,1.97,.84],[0,2.015,.87],[.38,1.97,.84],[.61,1.73,.80],[.70,1.18,.78]],.032);
  a.tor(gold,0,2.13,.96,.167,.064);
  for(const s of [-1,1]){
    for(const [z,span] of [[-.925,.43],[1.01,.417]]){
      a.hull(br,[[z-span,.153,.692,.064,s*.885],[z-.26,.191,.83,.081,s*.877],[z-.15,.207,.924,.078,s*.874],[z+.10,.206,.94,.072,s*.875],[z+.25,.188,.863,.073,s*.876],[z+span,.146,.716,.065,s*.877]],ALLOY,{facets:15,squareness:.5});
    }
    a.strut(trim,[s*.61,.68,.70],[s*.59,1.18,-.18],.065,.065);
    a.sph(gold,s*.73,1.16,-.31,.11,.11,.11,ALLOY);
    a.box('#693c29',s*.505,.50,1.35,.334,.25,.118,.066,ALLOY);
    a.pipe(trim,[[s*.76,.86,-1.17],[s*.88,.967,-.93],[s*.90,.895,-.62]],.023,ALLOY,8,6);
    a.pipe(trim,[[s*.76,.91,.71],[s*.89,.996,.96],[s*.90,.888,1.26]],.023,ALLOY,8,6);
  }
}
function amphibian(a){
  const aqua='#27b3ab', pale='#e5d0a3',green='#3c783f';
  a.hull(aqua,[[-1.51,.36,.61,.093],[-1.39,.59,.662,.175],[-1.15,.65,.735,.215],[-.81,.67,.758,.221],[-.36,.645,.676,.18],[.12,.646,.572,.138],[.54,.665,.615,.178],[.97,.724,.677,.19],[1.25,.74,.70,.17],[1.42,.62,.644,.113]],COAT,{squareness:.64});
  a.hull('#16887f',[[-1.19,.351,.852,.033],[-1.02,.422,.921,.053],[-.70,.399,.964,.048],[-.42,.31,.936,.043],[-.30,.247,.89,.025]],COAT,{squareness:.51,facets:18});
  a.box('#346963',0,.55,.32,1.04,.068,1.28,.048,HIDE);
  for(const s of [-1,1]){
    a.hull(pale,[[-1.535,.113,.55,.071,s*.993],[-1.412,.223,.554,.141,s*.996],[-1.19,.338,.565,.203,s*.992],[-.76,.385,.591,.228,s*1.0],[-.33,.399,.603,.241,s*1.0],[.29,.389,.595,.222,s*1.004],[.78,.367,.598,.205,s*1.009],[1.17,.325,.592,.183,s*1.013],[1.40,.234,.601,.146,s*.995],[1.535,.133,.605,.078,s*.984]],SHELL,{facets:22});
    a.hull(aqua,[[-1.490,.141,.622,.061,s*.994],[-1.36,.241,.655,.132,s*.998],[-1.05,.335,.720,.199,s*1.001],[-.68,.381,.754,.206,s*1.005],[-.16,.397,.758,.214,s*.998],[.49,.385,.725,.195,s*1.003],[.98,.349,.715,.189,s*1.001],[1.33,.251,.690,.135,s*.996],[1.514,.126,.641,.073,s*.990]],COAT,{facets:24,squareness:.82});
    a.pipe('#88d0bf',[[s*1.12,.84,-1.20],[s*1.24,.923,-.69],[s*1.31,.933,-.13],[s*1.28,.901,.42],[s*1.18,.812,1.03]],.025,ALLOY,13,6);
    a.cyl('#3f4d43',s*.98,.63,1.394,.18,.22,.32,[PI/2,0,0],ALLOY);
    a.box(aqua,s*.773,.81,1.14,.23,.22,.42,.055,COAT);
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
    a.wedge(i%2?'#6c9c51':'#519350',[[-.048,.05],[.102,.155],[.125,.339],[.039,.539],[-.071,.509],[-.103,.353],[-.071,.17]],.053,[0,1.66,1.106],[.03,0,-t],COAT);
    const rp=(r,w,z)=>[Math.sin(t)*r+Math.cos(t)*w,1.66+Math.cos(t)*r-Math.sin(t)*w,z];
    a.pipe('#356738',[rp(.164,.052,1.074),rp(.337,.074,1.070),rp(.477,.043,1.079)],.014,ALLOY,8,5);
  }
  a.strut(ash,[-.70,.79,1.15],[-.38,1.30,1.10],.074);
  a.strut(ash,[.70,.79,1.15],[.38,1.30,1.10],.074);
}
function steam(a){
  const fire='#c13836',brass='#c99749', smoke='#343139';
  a.box(fire,0,.62,.11,1.50,.36,3.26,.079);
  a.hull(fire,[[-1.425,.512,.940,.509],[-1.375,.559,.940,.559],[-1.15,.56,.94,.56],[-.32,.556,.94,.558],[.086,.521,.94,.52],[.157,.47,.94,.466]],COAT,{facets:30});
  a.tor('#932c2d',0,.94,-1.424,.51,.044,[0,0,0],[1,1,1],COAT);
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
  // Pressed canopy spans an open seated cab; outer gutter follows a genuine curved arch.
  a.hull('#a4292d',[[.01,.721,2.271,.061],[.067,.793,2.297,.068],[.21,.823,2.314,.07],[.68,.821,2.314,.075],[1.13,.805,2.307,.067],[1.27,.767,2.297,.061],[1.32,.690,2.292,.044]],COAT,{facets:26,squareness:.66});
  for(const s of [-1,1]){
    a.pipe('#e84b46',[[s*.683,2.269,.015],[s*.787,2.267,.11],[s*.817,2.272,.29],[s*.819,2.267,.88],[s*.784,2.267,1.19],[s*.700,2.275,1.306]],.027,COAT,19,7);
    a.wedge(fire,[[-.43,0],[-.40,.15],[.41,.15],[.45,.02]],.051,[s*.736,1.19,1.55],[0,PI/2,0],COAT);
  }
  a.box(fire,0,1.44,1.225,1.38,1.55,.119,.067);
  a.box(brass,0,1.39,1.157,1.19,.052,.056,.026,ALLOY);
  for(const s of [-1,1]){
    a.box(fire,s*.68,1.04,.75,.15,.35,1.1,.046,COAT);
    a.box(brass,s*.762,1.155,.75,.023,.03,1.06,.009,ALLOY);
    a.wedge('#b77531',[[0,.10],[.35,.10],[.43,0],[.03,0]],.042,[s*.75,.68,-1.03],[0,PI/2,0],ALLOY);
    a.cyl(brass,s*.43,.54,1.782,.125,.14,.196,[PI/2,0,0],ALLOY,12);
    a.strut('#a46a3b',[s*.55,.71,1.29],[s*.55,.73,1.755],.031,.031,ALLOY);
    for(const z of [-.74,-.327,.15,.60,1.10,1.41])a.cyl('#e0b064',s*.74,.765,z,.015,.015,.027,[0,0,0],ALLOY,6);
    a.strut(fire,[s*.64,1.10,.11],[s*.64,2.24,.11],.067,.067,SHELL);
    a.strut(fire,[s*.64,1.22,1.17],[s*.64,2.28,1.17],.067,.067,SHELL);
    a.strut(brass,[s*.73,.66,-.85],[s*.73,.66,1.27],.057,.056);
    a.wedge('#b58d56',[[0,-.031],[.12,-.054],[.766,-.037],[.95,.005],[.785,.054],[.171,.052]],.031,[s*.893,.557,-.339],[0,PI/2,0],ALLOY);
    a.cyl('#7a4f28',s*.897,.55,.112,.078,.078,.051,[0,0,PI/2],ALLOY,12);
    a.cyl(gold,s*.924,.55,.112,.045,.045,.025,[0,0,PI/2],ALLOY,10);
    a.box(fire,s*.62,.91,1.58,.114,.50,.60,.044);
    a.strut(brass,[s*.66,1.22,1.32],[s*.66,1.22,1.91],.041,.041);
  }
  a.box(fire,0,.84,1.89,1.38,.45,.13,.052);
}
function beetle(a){
  const amber='#e99120',shine='#ffcb5d', darkCopper='#70412b';
  a.box(darkCopper,0,.34,.05,1.15,.21,2.61,.12,ALLOY);
  a.hull(amber,[[-1.625,.242,.58,.16],[-1.534,.43,.63,.219],[-1.38,.585,.675,.274],[-1.17,.654,.74,.309],[-.932,.688,.782,.35],[-.695,.654,.767,.328],[-.479,.568,.705,.249],[-.29,.419,.627,.17],[-.12,.305,.582,.102]],COAT,{facets:26,squareness:.86});
  a.pipe(gold,[[0,.523,-1.65],[0,.92,-1.36],[0,1.15,-.95],[0,1.17,-.59]],.047);
  for(const s of [-1,1]){
    // Folded elytra are real curved shells; embossed veins trace the same surface.
    const wing=(u,v,rim=0)=>{
      const edge=Math.pow(Math.max(0,Math.sin(PI*u)),.54);
      const xx=.438+.145*u+edge*(v*.26+.021)*(.84+.16*u)+rim*.87;
      const yy=.886+.476*u+edge*(.094+.661*v-.060*v*v)+rim*.41;
      return [s*xx,yy,-.17+1.79*u+.055*edge*v];
    };
    a.patch('#c7792e',s,(u,v)=>wing(u,v),COAT,20,12);
    a.patch('#8d4f28',-s,(u,v)=>wing(u,v,-.037),SHELL,20,12);
    a.patch('#ffba45',s,(u,v)=>wing(.071+u*.861,.084+v*.827,.008),GLASS,18,10);
    for(const v of [.08,.44,.73,.91,1]){
      const ps=Array.from({length:17},(_,i)=>wing(i/16,v,.012));
      a.pipe(v===1?'#ffbd62':'#e29b3f',ps,v===1?.037:.015,ALLOY,27,6);
    }
    for(const u of [.21,.38,.55,.72,.88]){
      const ps=Array.from({length:9},(_,i)=>wing(u-.043*i/8,.10+.89*i/8,.016));
      a.pipe('#f8bc5b',ps,.012,COAT,14,6);
    }
    a.box('#80513a',s*.322,.59,1.342,.25,.24,.135,.06,ALLOY);
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
  a.add(back,purple,[0,1.12,.295],[0,0,0],[.86,.90,.81],COAT);
  // Open front and upper arc: solid purple rear shell and translucent clear dome panel.
  const cover=new T.SphereGeometry(1,36,20,PI,PI,0,PI*.70);
  a.add(cover,purple,[0,1.142,.26],[.04,0,0],[.945,1.063,.906],VIOLET);
  const coverRim=Array.from({length:25},(_,i)=>{
    const t=.11+i/24*(PI-.22);
    return [.936*Math.cos(t),1.161+1.007*Math.sin(t),.251-.043*Math.sin(t)];
  });
  a.pipe('#d8a04c',coverRim,.042,ALLOY,30,7);
  // Thin bevel reflects as a line instead of drawing over the entire driver's face.
  a.pipe('#e4b566',coverRim.slice(4,21).map(([x,y,z])=>[x*.965,y+.015,z-.066]),.012,ALLOY,24,5);
  a.hull(purple,[[-1.023,.264,.605,.113],[-.949,.432,.637,.183],[-.815,.574,.661,.214],[-.64,.671,.645,.225],[-.37,.748,.62,.25],[-.12,.721,.59,.227],[.12,.685,.561,.189],[.58,.61,.571,.187],[.869,.457,.593,.179]],COAT,{facets:28});
  a.tor('#a06f4d',0,.635,-1.067,.227,.023,[0,0,0],[1.19,.56,1],ALLOY);
  a.pipe(gold,[[-.73,.79,-.30],[-.86,1.26,-.16],[-.78,1.73,.17],[-.50,1.97,.33],[0,2.08,.45],[.50,1.97,.33],[.78,1.73,.17],[.86,1.26,-.16],[.73,.79,-.30]],.049);
  a.pipe(bronze,[[-.72,.73,-.37],[-.56,.85,-.72],[0,.93,-1.02],[.56,.85,-.72],[.72,.73,-.37]],.037);
  a.cyl(gold,0,2.072,.45,.11,.14,.105,[0,0,0],ALLOY);
  for(const s of [-1,1]){
    a.strut(gold,[s*.57,.42,.65],[s*.97,.41,.68],.103,.094);
    a.sph(bronze,s*.868,1.15,-.12,.083,.090,.09,ALLOY);
    a.cyl('#645092',s*.40,.61,1.038,.114,.15,.24,[PI/2,0,0],ALLOY);
    a.pipe('#aa7a47',[[s*.66,1.77,.70],[s*.77,1.43,.66],[s*.81,1.18,.59],[s*.69,.81,.58]],.029,ALLOY,10,6);
    a.pipe('#aa7bdd',[[s*.54,.47,-.65],[s*.66,.51,-.48],[s*.76,.56,-.25]],.022,COAT,8,5);
  }
  a.strut(bronze,[0,.68,-.90],[0,.26,-1.24],.079,.057);
  a.sph(gold,0,.64,-1.048,.29,.155,.115,ALLOY);
  a.sph(lamp,0,.645,-1.150,.224,.104,.062,LIGHT);
}
function dragon(a){
  const ivory='#ddd09e',ivoryL='#f4e4bc',warm='#b09970',socket='#624827';
  a.box(socket,0,.39,.12,1.35,.27,2.68,.095,HIDE);
  a.hull(ivoryL,[[-2.027,.111,.601,.061],[-1.964,.246,.624,.106],[-1.786,.283,.692,.123],[-1.594,.326,.737,.145],[-1.425,.370,.81,.188],[-1.224,.466,.86,.211],[-1.07,.485,.849,.204],[-.932,.442,.823,.158],[-.737,.31,.741,.119],[-.576,.17,.679,.099]],SHELL,{facets:26,squareness:.66});
  a.hull(warm,[[-2.003,.155,.382,.039],[-1.884,.295,.381,.075],[-1.67,.381,.407,.085],[-1.386,.425,.461,.080],[-1.12,.473,.543,.076],[-.96,.449,.583,.061],[-.83,.337,.575,.046]],SHELL,{facets:22,squareness:.57});
  a.pipe('#b59061',[[0,.711,-1.932],[0,.781,-1.718],[0,.907,-1.497],[0,1.047,-1.279],[0,1.036,-1.042]],.029,SHELL,18,7);
  for(const s of [-1,1]){
    a.sph(socket,s*.455,.815,-1.306,.140,.139,.212,HIDE,[.20,s*.25,0]);
    a.sph('#d59339',s*.523,.846,-1.311,.063,.071,.072,LIGHT);
    a.pipe(ivoryL,[[s*.383,.831,-1.506],[s*.448,.957,-1.444],[s*.513,1.015,-1.337],[s*.544,.988,-1.208],[s*.562,.881,-1.147]],.059,SHELL,16,8);
    a.pipe(ivory,[[s*.371,.765,-1.489],[s*.463,.729,-1.417],[s*.535,.724,-1.294],[s*.570,.778,-1.177]],.047,SHELL,15,7);
    a.pipe(ivoryL,[[s*.20,.819,-1.614],[s*.306,.914,-1.435],[s*.413,.907,-1.25],[s*.461,.852,-1.129]],.045,SHELL,12,7);
    a.pipe(warm,[[s*.075,.753,-1.945],[s*.143,.804,-1.848],[s*.176,.818,-1.725]],.021,HIDE,8,6);
    a.pipe(ivoryL,[[s*.51,.58,-1.62],[s*.58,.635,-1.42],[s*.635,.682,-1.13],[s*.64,.708,-.94]],.065,SHELL,12,7);
    a.box(warm,s*.45,.55,1.49,.23,.24,.23,.07,HIDE);
    a.pipe(ivoryL,[[s*.39,.44,1.48],[s*.54,.49,1.53],[s*.59,.58,1.49]],.057,SHELL,10,6);
    a.sph(socket,s*.17,.753,-1.84,.085,.038,.148,HIDE,[.22,s*.12,0]);
    a.pipe(ivoryL,[[s*.46,.79,-1.04],[s*.39,.93,-.93],[s*.36,1.19,-.77],[s*.40,1.43,-.68]],.096,SHELL);
    a.strut(ivoryL,[s*.40,1.27,-.722],[s*.43,1.50,-.66],.077,.008,SHELL);
    a.pipe(ivory,[[s*.31,.50,-1.91],[s*.45,.51,-1.63],[s*.52,.53,-1.29],[s*.51,.65,-.98]],.062,SHELL);
    for(let j=0;j<5;j++) {
      const z=-1.853+j*.145,w=.23+j*.043,y=.529+j*.037;
      a.strut(ivoryL,[s*w,y,z],[s*(w-.032),y-.121-(j===3?.056:0),z-.047],j===3?.048:.035,.004,SHELL,8);
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
    two([.865,-.99,.349,.24],[.865,1.04,.349,.24],{rim:silver}),[1.36,-1.77,1.81],icecream,[.35,1.80]),
  concept('groove-racer','Groove Racer','Turntable kart','#cf1576','#fa6bc6',{y:.83,z:.45,scale:.76},'#4e354f',
    two([.935,-1.01,.441,.30],[.935,1.03,.468,.30],{rim:'#e03690',style:'speaker'}),[1.17,-1.58,1.56],turntable),
  concept('bumper-bolt','Bumper Bolt','Round bumper-car racer',teal,white,{y:.92,z:.45,scale:.74},'#775039',
    [axle(0,-.94,.235,.235,true,{rim:silver}),...pair(1.01,.87,.392,.247,false,{rim:silver})],[1.31,-1.74,1.78],bumper),
  concept('bronze-bell','Bronze Bell','Open bronze bell kart','#b87333',gold,{y:.85,z:.26,scale:.74},'#674437',
    two([.89,-.93,.436,.29],[.89,.96,.449,.29],{rim:gold,style:'offroad'}),[1.13,-1.59,1.52],bell),
  concept('reed-skimmer','Reed Skimmer','Twin-pontoon hover racer','#27b3ab',cream,{y:.86,z:.23,scale:.78},'#795238',
    [],[1.48,-1.67,1.58],amphibian,[.70,1.42],true),
  concept('steam-sprint','Steam Sprint','Miniature steam locomotive','#c13836',gold,{y:.85,z:.57,scale:.73},'#54392f',
    [...pair(.786,-.96,.401,.22,true,{style:'spoke',rim:red}),...pair(.786,.08,.498,.22,false,{style:'spoke',rim:red}),...pair(.786,1.19,.498,.22,false,{style:'spoke',rim:red})],[.99,-1.89,2.05],steam,[.61,1.95]),
  concept('amber-beetle','Amber Beetle','Wing-shell wheels-only racer','#e99120','#ffcb5d',{y:.76,z:.40,scale:.75},'#69422d',
    two([.857,-1.08,.394,.277],[.857,1.03,.432,.283],{style:'offroad',rim:'#e99120'}),[1.21,-1.75,1.67],beetle),
  concept('violet-marble','Violet Marble','Glass bubble trike','#6529a7',gold,{y:.78,z:.08,scale:.73},'#70493d',
    [axle(0,-1.20,.265,.20,true,{rim:gold}),...pair(.907,.67,.411,.245,false,{rim:gold})],[1.13,-1.48,1.18],marble),
  concept('bone-wyrm','Bone Wyrm','Ivory dragon-skeleton kart','#ddd09e','#b09970',{y:.79,z:.29,scale:.75},'#76513a',
    two([.85,-1.06,.401,.27],[.85,1.00,.430,.28],{style:'offroad',rim:cream}),[1.09,-2.08,2.28],dragon,[.53,1.45]),
];
