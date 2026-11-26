// Sproto Racer reference boards 02 and 03. Ground at y=0, -Z forward.
const R=Math.PI/2, full=Math.PI*2;
const ink=0x22242a,rubber=0x27252a,steel=0x9aa3af,copper=0xa8794c,leather=0x2e292b;
const light=0xffe1a9, cyan=0x42eaf9;
function parts(h){
  const T=h.T;
  const variant=(mode)=>['glass','glow','metal','rubber','coat'].includes(mode)?mode:'solid';
  function add(color,geom,pos=[0,0,0],rot=[0,0,0],mode='paint'){
    return h.mesh(color,geom,pos,rot,variant(mode));
  }
  function box(color,pos,size,bevel=.05,rot=[0,0,0],mode){
    if(mode!=='glass'&&Math.min(...size)<.022)return add(color,new T.BoxGeometry(...size),pos,rot,mode);
    return mode==='glass'?h.glass(color,pos,size,bevel,rot):h.box(color,pos,size,bevel,rot,variant(mode));
  }
  function ell(color,pos,size,rot=[0,0,0],mode){
    return add(color,new T.SphereGeometry(1,20,12).scale(...size),pos,rot,mode);
  }
  function tube(color,pos,r,t,rot=[],mode){
    return add(color,new T.TorusGeometry(r,t,r<.20?6:8,r<.10?14:r<.38?28:42),pos,rot.length?rot:[0,0,0],mode);
  }
  function pipe(color,a,b,r,r2=r,mode='metal',n=14){
    const from=new T.Vector3(...a), to=new T.Vector3(...b), delta=to.clone().sub(from);
    const length=delta.length();if(length<1e-5)return;
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
    return add(color,new T.CylinderGeometry(r2,r,length,n),from.lerp(to,.5).toArray(),q,mode);
  }
  function rivet(color,pos,axis=[0,1,0],radius=.022){
    const d=new T.Vector3(...axis).multiplyScalar(.011);
    pipe(color,pos,new T.Vector3(...pos).add(d).toArray(),radius,radius*.89,'metal',6);
  }
  // Closed chamfered hull. Each station: [z, half-width, lower y, upper y, optional center x].
  function hull(color,stations,mode='coat'){
    const verts=[],idx=[];
    for(const [z,w,a,b,c=0] of stations){
      const q=w*.27,j=(b-a)*.23;
      verts.push(c-w+q,a,z,c+w-q,a,z,c+w,a+j,z,c+w,b-j,z,c+w-q,b,z,c-w+q,b,z,c-w,b-j,z,c-w,a+j,z);
    }
    for(let k=1;k<stations.length;k++)for(let i=0;i<8;i++){
      const a=(k-1)*8+i,b=(k-1)*8+(i+1)%8;idx.push(a,b,b+8,a,b+8,a+8);
    }
    for(let i=1;i<7;i++){const h=(stations.length-1)*8;idx.push(0,i+1,i,h,h+i,h+i+1);}
    const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(verts,3));
    geom.setIndex(idx);const flat=geom.toNonIndexed();geom.dispose();flat.computeVertexNormals();
    return add(color,flat,[0,0,0],[0,0,0],mode);
  }
  function path(color,points,r,mode){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
    return add(color,new T.TubeGeometry(curve,points.length*(r<.022?3:5),r,r<.035?6:8),[0,0,0],[0,0,0],mode);
  }
  function skin(color,points,tris,mode){
    if(mode==='cloth')tris=[...tris,...tris.slice().reverse()];
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));g.setIndex(tris);
    const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return add(color,flat,[0,0,0],[0,0,0],mode);
  }
  function lathe(color,profile,pos,rot=[0,0,0],mode){
    return add(color,new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),48),pos,rot,mode);
  }
  return {T, add,box,ell,tube,pipe,rivet,hull,path,skin,lathe};
}
function chair(p,x,y,z,w=.70,t=.74){
  p.box(leather,[x,y-.091,z+.08],[w,.18,.62],.09);
  p.box(leather,[x,y+t*.47,z+.43],[w*.94,t,.19],.08,[-.12,0,0]);
  for(let i=-2;i<=2;i++)p.box(0x484045,[x+i*w*.14,y+t*.52,z+.337],[w*.108,t*.68,.055],.020,[-.12,0,0]);
  for(const u of [-1,1]){
    p.box(0x423a3e,[x+u*w*.46,y+.04,z+.09],[.13,.20,.68],.056);
    p.path(0x706057,[[x+u*w*.44,y-.038,z-.22],[x+u*w*.46,y+.128,z-.15],
      [x+u*w*.466,y+.132,z+.21],[x+u*w*.43,y+t*.24,z+.349],[x+u*w*.405,y+t*.85,z+.392]],.009);
    p.pipe(0xa2a3ab,[x+u*w*.41,y-.17,z-.22],[x+u*w*.41,y-.17,z+.45],.019,.019,'metal',6);
  }
}
function steer(p,x,y,z,bike=false){
  if(bike){
    p.pipe(steel,[x,y-.31,z+.06],[x,y,z],.045);
    p.path(ink,[[x-.37,y-.035,z+.10],[x-.27,y,z+.03],[x,y-.026,z],[x+.27,y,z+.03],[x+.37,y-.035,z+.10]],.035);
    for(const s of [-1,1])p.pipe(rubber,[x+s*.27,y,z+.03],[x+s*.40,y-.039,z+.103],.054);
  }else{
    p.pipe(steel,[x,y-.20,z-.20],[x,y,z],.035);
    p.tube(ink,[x,y,z],.21,.035,[.32,0,0]);
    for(const s of [-1,1])p.pipe(steel,[x,y,z],[x+s*.17,y+.02,z+.005],.019);
    p.ell(steel,[x,y,z+.023],[.062,.055,.028]);
  }
}
function headlight(p,x,y,z,w=.21,h=.10,angle=0,bulb=light){
  p.box(ink,[x,y,z+.018],[w+.065,h+.06,.093],.033,[0,angle,0]);
  p.box(0xb7bec3,[x,y,z-.009],[w+.031,h+.032,.050],.023,[0,angle,0],'metal');
  p.box(bulb,[x,y,z-.033],[w,h,.025],.016,[0,angle,0],'glow');
  if(w>.29){
    for(const f of [-.25,.25])p.box(0xffedc7,[x+w*f,y,z-.049],[.012,h*.68,.006],.002,[0,angle,0],'coat');
  }
}
function rearLamp(p,x,y,z,w=.18){
  p.box(ink,[x,y,z],[w+.035,.12,.041],.02);
  p.box(0xff3944,[x,y,z+.024],[w,.075,.030],.012,[0,0,0],'glow');
}
// Small seated hardware remains static; exterior mouths are supplied by exhaust anchors.
function exhaustFlange(p,x,y,z,r,color=steel){
  p.box(0x252727,[x,y,z-.045],[r*2.8,r*2.30,.092],.033);
  p.tube(color,[x,y,z],r*1.11,.015,[0,0,0],'metal');
  for(const s of [-1,1])p.rivet(0x9aa0a8,[x+s*r*1.17,y,z-.020],[0,0,1],.012);
}
function rearLouvres(p,x,y,z,l,w,rows=5){
  for(let i=0;i<rows;i++){
    const zz=z+i*l/(rows-1);
    p.box(0x212329,[x,y-.006,zz],[w,.027,.039],.008);
    p.box(0x666b72,[x,y+.007,zz+.015],[w*.95,.014,.016],.004,[0,0,0],'metal');
  }
}
const mount=(x,y,z,scale=.71)=>({x,y,z,scale});
const wheel=(x,z,r,width,steer=false,style='offroad',rim=steel,tire=rubber)=>({x,z,r,width,steer,style,rim,tire});
const bulbs=(p,x,y,z,w,h)=>{for(const s of [-1,1])headlight(p,s*x,y,z,w,h,s*.10);};
function withDriver(p,fit,bike=false,hasSeat=true){
  const {x,y,z,scale:a}=fit;
  if(hasSeat)chair(p,x,y,z,.96*a,.93*a);
  steer(p,x,y+.34*a,z-.56*a,bike);
}
function concept({id,name,role,color,trim,mount,wheels,bounds,height,build,hover=false,tail}){
  const css=(value)=>'#'+Number(value).toString(16).padStart(6,'0');
  return {id,name,role,color:css(color),trim:css(trim),mount,wheels,bounds,contactHeight:height,hover,tail,seat:false,controls:false,build(h){build(parts(h),mount);}};
}
const orange=0xf9841d,gold=0xe4a331,leaf=0x829b34,khaki=0x76763e,
  blue=0x2052d6,coral=0xf26755, violet=0x6b2bbd, green=0xa5e82f, turquoise=0x0cb7d6,
  yellow=0xfbd018, plum=0xbc1482, white=0xe7edee;

const mono=concept({id:'ringrunner',name:'Ringrunner',role:'One-wheel trail racer',color:orange,trim:rubber,
  mount:mount(0,.72,.17,.70),wheels:[wheel(0,0,1.34,.43,false,'ring',orange)],bounds:[.61,-1.37,1.37],height:2.68,tail:[.49,1.1],
  build(p,fit){
    // Inner hoop does not spin: it carries the cabin while the external tread pivots.
    p.tube(ink,[0,1.34,0],1.00,.071,[0,R,0]);
    for(const s of [-1,1]){
      p.tube(orange,[s*.324,1.34,0],1.04,.065,[0,R,0],'coat');
      p.tube(steel,[s*.348,1.34,0],.963,.027,[0,R,0],'metal');
      p.tube(0x8a452c,[s*.371,1.34,0],1.045,.015,[0,R,0],'metal');
      for(let i=0;i<8;i++){
        const a=full*i/8, y=1.34+Math.cos(a)*1.075,z=Math.sin(a)*1.075;
        p.box(orange,[s*.326,y,z],[.14,.17,.33],.041,[a,0,0],'coat');
        for(const e of [-1,1])p.rivet(steel,[s*.398,y-e*Math.sin(a)*.113,z+e*Math.cos(a)*.113],[s,0,0],.017);
        if(i===0||i===2||i===6){
          p.box(0x44362c,[s*.401,y,z],[.034,.12,.202],.013,[a,0,0],'metal');
          p.box(light,[s*.420,y,z],[.014,.075,.151],.006,[a,0,0],'glow');
        }
      }
      p.path(ink,[[s*.29,.38,-.62],[s*.35,.42,-.19],[s*.35,.52,.42],[s*.28,.75,.78]],.071,'metal');
      p.path(steel,[[s*.32,.48,.35],[s*.43,.56,.56],[s*.49,.66,.80]],.052,'metal');
      exhaustFlange(p,s*.49,.66,.827,.078);
      p.box(0x4a3931,[s*.462,.54,.55],[.105,.139,.31],.031,[.22,0,s*.30],'metal');
    }
    p.hull(ink,[[-.71,.24,.34,.54],[-.43,.36,.30,.66],[.42,.37,.35,.75],[.83,.26,.44,.68]]);
    p.box(orange,[0,.48,-.62],[.44,.20,.27],.046,[.32,0,0],'coat');
    p.box(ink,[0,.582,-.64],[.21,.036,.118],.010,[.32,0,0]);
    p.box(cyan,[0,.604,-.645],[.15,.010,.067],.004,[.32,0,0],'glow');
    bulbs(p,.109,.51,-.76,.112,.081);
    chair(p,0,fit.y,fit.z,.66,.66);
    for(const s of [-1,1]){
      p.pipe(steel,[s*.22,fit.y-.11,-.23],[s*.20,fit.y+.227,-.236],.04);
      p.ell(orange,[s*.20,fit.y+.227,-.236],[.077,.073,.078]);
    }
  }});
const sail=concept({id:'windskiff',name:'Windskiff',role:'Wheeled land yacht',color:gold,trim:ink,
  mount:mount(0,.51,.35,.70),wheels:[wheel(0,-1.92,.415,.078,true,'spoke',copper),wheel(.99,1.18,.43,.086,false,'spoke',copper),wheel(-.99,1.18,.43,.086,false,'spoke',copper)],
  bounds:[1.13,-2.37,1.81],height:1.77,tail:[.48,1.35],
  build(p,fit){
    p.hull(gold,[[-1.69,.055,.39,.51],[-1.14,.20,.395,.61],[-.53,.33,.385,.65],[.13,.48,.37,.62],[.82,.48,.40,.63],[1.24,.32,.44,.65]]);
    p.hull(0xf1b840,[[-1.51,.07,.508,.56],[-.76,.25,.54,.64],[-.42,.33,.54,.70],[-.13,.33,.54,.69]]);
    for(const s of [-1,1]){
      p.path(gold,[[0,.57,-1.65],[s*.27,.61,-.69],[s*.438,.69,.03],[s*.475,.70,.55],[s*.39,.68,1.07],[0,.66,1.28]],.051);
      p.pipe(0x574134,[s*.37,.52,.92],[s*.99,.43,1.18],.032);
      p.pipe(0x574134,[s*.30,.44,.53],[s*.99,.43,1.18],.034);
      for(let i=0;i<4;i++)p.pipe(0x9b6c34,[s*.38,.45,.04+i*.24],[s*.42,.62,.23+i*.24],.024);
      const rail=[[s*.101,.551,-1.39],[s*.268,.577,-.78],[s*.404,.622,-.13],[s*.473,.658,.51],[s*.383,.672,1.09]];
      p.path(0xffde8d,rail,.010,'metal');
      for(const [x,y,z] of rail)p.rivet(0x785641,[x,y+.020,z]);
      p.box(0x40342d,[s*.45,.505,1.14],[.165,.106,.113],.028,[0,s*.15,0],'rubber');
    }
    p.pipe(0x574134,[0,.41,-1.63],[0,.414,-1.92],.035);
    p.pipe(steel,[0,.50,.91],[0,.50,1.26],.064,.082);
    exhaustFlange(p,0,.50,1.235,.095,0xa17d47);
    p.box(0x794b27,[0,.533,-1.579],[.091,.021,.157],.007);
    for(const t of [-1,1])p.rivet(steel,[t*.145,.638,-.837]);
    // The sail is locked at race angle; a curved sectional skin catches light along the seams.
    const a=[-.44,.67,-1.29],b=[-.42,2.90,.70],c=[-.36,1.08,1.79];
    p.pipe(0x694d2d,a,b,.035,.025);p.pipe(0x694d2d,[-.40,1.03,-.90],c,.026,.033);
    const ler=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
    const foot=[-.40,1.04,-.95],points=[],tri=[];
    for(let j=0;j<8;j++){
      const t=j/8,l=ler(foot,b,t),r=ler(c,b,t);
      for(let i=0;i<=8;i++){
        const u=i/8,v=ler(l,r,u);v[0]-=.13*Math.sin(Math.PI*u)*Math.sin(Math.PI*t);points.push(v);
        if(j&&i){const k=9*j+i;tri.push(k-10,k-9,k,k-10,k,k-1);}
      }
      if(j>0){
        const seam=Array.from({length:9},(_,i)=>{
          const u=i/8,v=ler(l,r,u);v[0]-=.135*Math.sin(Math.PI*u)*Math.sin(Math.PI*t)+.004;return v;
        });
        p.path(0x65616b,seam,.0038);
      }
    }
    const tip=points.push(b)-1;
    for(let i=0;i<8;i++){const k=7*9+i;tri.push(k,k+1,tip);}
    p.skin(0x36353d,points,tri,'cloth');
    for(let i=1;i<8;i+=2){const o=ler(a,b,i/8);p.tube(gold,o,.045,.009,[0,0,.4]);}
    withDriver(p,fit);
  }});
const sled=concept({id:'arctic-skip',name:'Arctic Skip',role:'Twin-pod hover sled',color:blue,trim:white,
  mount:mount(0,1.09,.28,.69),wheels:[],bounds:[1.21,-1.96,1.57],height:2.29,hover:true,tail:[.61,1.54],
  build(p,fit){
    p.hull(ink,[[-1.44,.30,.42,.74],[-.97,.53,.40,.91],[-.12,.45,.46,1.06],[.76,.39,.49,1.04],[1.48,.23,.59,.76]]);
    p.hull(blue,[[-1.62,.31,.61,.76],[-1.24,.56,.64,.97],[-.67,.44,.69,1.10],[-.34,.24,.74,1.08]]);
    p.hull(blue,[[.51,.29,.62,.89],[.85,.37,.63,.97],[1.53,.23,.63,.87]]);
    p.box(ink,[0,1.025,.37],[.58,.19,.98],.091,[.12,0,0],'rubber');
    for(let i=0;i<5;i++)p.box(0x424650,[0,1.102-i*.014,.39+i*.080],[.44,.021,.013],.004,[.12,0,0],'rubber');
    p.hull(0x172e67,[[-1.40,.067,.759,.784],[-1.05,.109,.979,.996],[-.68,.126,1.092,1.125],[-.40,.108,1.073,1.087]]);
    p.hull(white,[[-1.39,.031,.788,.803],[-1.07,.051,.988,1.004],[-.66,.061,1.123,1.141]]);
    headlight(p,0,.747,-1.614,.50,.13);
    for(const s of [-1,1]){
      const x=s*.81;
      p.pipe(steel,[s*.33,.74,-.65],[x,.55,-.64],.09);
      p.pipe(steel,[s*.30,.71,.51],[x,.53,.57],.077);
      p.hull(blue,[[-1.89,.24,.29,.43,x],[-1.30,.38,.28,.60,x],[-.51,.39,.28,.67,x],[.66,.33,.31,.65,x],[1.16,.25,.36,.58,x]]);
      p.hull(ink,[[-1.80,.22,.264,.36,x],[-.93,.385,.235,.355,x],[.73,.32,.244,.37,x],[1.14,.23,.284,.37,x]]);
      p.hull(white,[[-1.73,.106,.412,.444,x+s*.075],[-.99,.115,.584,.62,x+s*.105],[-.45,.11,.669,.69,x+s*.105]]);
      p.box(ink,[x,.69,.21],[.30,.075,.90],.03);
      rearLouvres(p,x,.734,-.112,.60,.235,6);
      p.box(cyan,[x,.27,.25],[.26,.040,1.03],.012,[0,0,0],'glow');
      p.path(0x5294f1,[[x+s*.119,.366,-1.79],[x+s*.294,.457,-1.42],[x+s*.365,.523,-.72],[x+s*.323,.529,.35],[x+s*.242,.486,1.09]],.009,'coat');
      for(const z of [-.53,.73])p.rivet(steel,[x+s*.086,.731,z]);
      exhaustFlange(p,x,.48,1.045,.118,0x4d627c);
      headlight(p,x,.365,-1.903,.36,.083);
    }
    withDriver(p,fit,true,false);
  }});
const bamboo=concept({id:'bamboo-trike',name:'Bamboo Trike',role:'Lashed-frame trike',color:leaf,trim:gold,
  mount:mount(0,.84,.17,.68),wheels:[wheel(0,-1.20,.49,.31,true,'offroad',leaf),wheel(.68,.94,.48,.34,false,'offroad',leaf),wheel(-.68,.94,.48,.34,false,'offroad',leaf)],
  bounds:[.94,-1.80,1.49],height:2.02,tail:[.67,1.30],
  build(p,fit){
    p.hull(leaf,[[-1.64,.10,.82,.90],[-1.34,.21,.90,1.00],[-.95,.29,.87,1.12],[-.50,.36,.72,1.02],[-.16,.27,.69,.94]]);
    p.hull(0x627830,[[-.62,.27,.53,.76],[.08,.43,.36,.72],[.70,.44,.40,.69],[1.24,.44,.47,.70]]);
    p.hull(leaf,[[.29,.27,.67,.84],[.76,.42,.64,.83],[1.36,.51,.65,.78]]);
    p.box(ink,[0,.815,.29],[.49,.14,.75],.062,[-.05,0,0]);
    for(const s of [-1,1]){
      const nodes=[[s*.12,.51,-1.17],[s*.31,.88,-.46],[s*.49,.69,.32],[s*.58,.69,1.31]];
      p.path(0x899f3d,nodes,.059);
      p.path(0x78952f,[[s*.14,.73,-1.15],[s*.28,.43,-.37],[s*.46,.39,.48],[s*.57,.68,1.32]],.052);
      p.pipe(0x9aaf41,[s*.26,.47,-.36],[s*.48,.69,.34],.039);
      p.pipe(0xacc25c,[s*.45,.41,.44],[s*.57,.69,1.31],.044);
      p.pipe(0xa19057,[s*.13,.52,-1.20],[s*.20,.96,-.77],.059,.045);
      for(const [x,y,z] of [nodes[1],nodes[2],nodes[3]]){
        for(let i=-2;i<=2;i++)p.tube(i%2?0xddb971:0xc79754,[x,y,z+i*.019],.064,.011,[0,0,s*.19],'rubber');
        p.pipe(0xb38745,[x-s*.047,y-.032,z-.051],[x+s*.050,y+.035,z+.040],.017,.015,'rubber',8);
      }
      for(const [a,b] of [[.10,.58],[.43,.81]]){
        const x=s*(.37+a*.18);
        p.tube(0x667138,[x,.71,b],.061,.015);
      }
      p.path(0x78684c,[[s*.13,.55,.54],[s*.246,.54,.86],[s*.315,.55,1.22]],.052,'metal');
      exhaustFlange(p,s*.315,.55,1.236,.077,0xa28645);
      p.pipe(0xb9ac5d,[s*.39,.51,.49],[s*.73,.50,.94],.047);
      p.box(ink,[s*.41,.41,.01],[.20,.075,.36],.018);
    }
    p.path(0xd2c055,[[-.49,.70,1.28],[0,.69,1.36],[.49,.70,1.28]],.045);
    p.path(0xbbcd45,[[0,.901,-1.59],[0,1.000,-1.34],[0,1.125,-.95],[0,1.085,-.71],[0,1.027,-.52]],.017,'coat');
    for(const d of [-1,1])p.path(0x99ae38,[[0,1.115,-.945],[d*.123,1.081,-.778],[d*.206,1.059,-.67]],.009,'coat');
    headlight(p,0,1.012,-1.20,.33,.12);
    withDriver(p,fit,true,false);
  }});
const mud=concept({id:'mud-marauder',name:'Mud Marauder',role:'Six-wheel utility buggy',color:khaki,trim:ink,
  mount:mount(0,.83,.02,.70),wheels:[-.99,.99].flatMap(x=>[-1.32,.51,1.47].map((z,i)=>wheel(x,z,i===0?.575:.525,.40,i===0,'offroad',0x999c58))),
  bounds:[1.28,-2.23,2.04],height:2.17,tail:[.57,1.95],
  build(p,fit){
    p.hull(0x484836,[[-1.92,.61,.37,.59],[-1.37,.84,.34,.68],[.35,.83,.37,.72],[1.60,.83,.40,.72],[1.99,.72,.45,.70]]);
    p.hull(khaki,[[-1.93,.74,.54,.75],[-1.61,.94,.59,.91],[-.92,.94,.62,1.03],[-.53,.75,.75,1.06]]);
    p.hull(0x89894a,[[-1.68,.37,.87,.91],[-1.04,.52,.93,1.075],[-.58,.36,.95,1.096]]);
    p.box(ink,[0,1.076,-.94],[.45,.065,.28],.02,[.16,0,0]);
    for(let i=-2;i<=2;i++)p.box(steel,[i*.071,1.11,-.94],[.018,.022,.22],.008,[.16,0,0]);
    p.box(khaki,[0,.705,1.37],[1.76,.22,1.22],.051);
    p.box(ink,[0,.84,1.45],[1.50,.08,1.02],.02);
    for(let i=-5;i<=5;i++)p.box(0x585744,[i*.128,.889,1.45],[.025,.015,.99],.005);
    for(const s of [-1,1]){
      p.hull(khaki,[[-1.76,.19,.63,.85,s*.88],[-1.35,.24,.92,1.02,s*.91],[-.92,.25,.89,1.01,s*.91],[-.54,.17,.62,.85,s*.89]]);
      p.hull(khaki,[[.45,.27,.76,.92,s*.85],[.84,.31,.83,1.04,s*.86],[1.53,.31,.87,1.04,s*.87],[1.88,.23,.67,.94,s*.87]]);
      p.box(0x777747,[s*.81,1.014,1.33],[.14,.37,1.32],.04);
      p.box(ink,[s*.90,1.09,1.34],[.03,.12,1.03],.012);
      p.path(0x484342,[[s*.69,.80,-.50],[s*.59,1.75,-.48],[s*.55,2.13,-.37],[s*.55,2.14,.54],[s*.70,.86,.72]],.063);
      p.pipe(0x524d49,[s*.57,1.97,.6],[s*.81,.88,1.28],.052);
      p.box(0x797a41,[s*.72,.88,.02],[.17,.24,.93],.045,[0,0,0],'coat');
      p.box(0x3c3c33,[s*.804,.909,.08],[.031,.081,.657],.007);
      for(let i=0;i<4;i++)p.rivet(0xa8a479,[s*.824,.913,-.153+i*.156],[s,0,0],.016);
      p.pipe(0x27292a,[s*.62,.51,1.19],[s*.43,.545,1.84],.078,.065,'metal');
      exhaustFlange(p,s*.43,.545,1.90,.094,0x777b63);
      p.pipe(0x5c5c4c,[s*.52,.61,1.56],[s*.52,.61,1.98],.027);
      p.pipe(ink,[s*.63,.780,-1.94],[s*.63,.780,-1.974],.136,.133);
      p.ell(light,[s*.63,.780,-1.978],[.108,.108,.026],[0,0,0],'glow');
      p.pipe(0x9e9582,[s*.63-.083,.780,-2.004],[s*.63+.083,.780,-2.004],.011);
      p.pipe(0x9e9582,[s*.63,.697,-2.004],[s*.63,.863,-2.004],.011);
      rearLamp(p,s*.59,.74,1.99);
    }
    p.pipe(0x5d5652,[-.57,2.10,-.42],[.57,2.10,-.42],.054);p.pipe(0x5d5652,[-.55,2.13,.53],[.55,2.13,.53],.052);
    p.path(0x514c4c,[[-.72,.43,-1.92],[-.69,.65,-2.08],[-.39,.65,-2.10],[.39,.65,-2.10],[.69,.65,-2.08],[.72,.43,-1.92]],.063);
    p.box(0x8a8780,[0,.45,-2.025],[.47,.21,.20],.03,[0,0,0],'metal');
    p.box(0x585d59,[0,.529,-2.101],[.31,.061,.045],.016,[0,0,0],'metal');
    p.path(0xb89a68,[[0,.497,-2.135],[.094,.465,-2.157],[.094,.373,-2.157],[.006,.363,-2.147],[-.04,.394,-2.132]],.018,'metal');
    for(const x of [-.24,.24])p.rivet(0x8b8b6d,[x,1.11,-.934]);
    p.pipe(ink,[-.17,.48,-2.13],[.17,.48,-2.13],.065);
    withDriver(p,fit);
  }});
const roller=concept({id:'tarmac-press',name:'Tarmac Press',role:'Road-roller sprinter',color:coral,trim:gold,
  mount:mount(0,.83,.29,.71),wheels:[wheel(0,-1.10,.668,1.52,true,'drum',gold),wheel(.80,.86,.57,.385,false,'offroad',gold),wheel(-.80,.86,.57,.385,false,'offroad',gold)],
  bounds:[1.09,-1.81,1.58],height:2.23,tail:[.67,1.55],
  build(p,fit){
    p.hull(ink,[[-.95,.59,.53,.82],[-.45,.81,.44,.79],[.49,.85,.45,.85],[1.51,.66,.54,.87]]);
    p.hull(coral,[[-1.52,.61,1.21,1.37],[-1.12,.84,1.12,1.36],[-.62,.75,.85,1.19],[-.34,.49,.77,1.04]]);
    p.hull(coral,[[.43,.50,.74,.98],[.91,.74,.78,1.14],[1.46,.66,.72,1.11]]);
    for(const s of [-1,1]){
      p.hull(coral,[[-1.32,.12,.35,.86,s*.805],[-1.03,.14,.40,1.07,s*.81],[-.67,.12,.47,1.10,s*.79],[-.11,.13,.54,.92,s*.75]]);
      p.hull(coral,[[.31,.14,.65,.93,s*.76],[.64,.21,.86,1.13,s*.80],[1.02,.22,.83,1.17,s*.80],[1.43,.18,.62,.99,s*.77]]);
      p.box(ink,[s*.962,.69,-.43],[.045,.26,.53],.018);
      p.box(gold,[s*.979,.744,-.45],[.022,.055,.39],.012);
      p.path(0x53463d,[[s*.62,.79,.12],[s*.58,1.70,.35],[s*.46,2.14,.53],[0,2.17,.55]],.075);
      p.box(gold,[s*.23,2.175,.55],[.14,.153,.175],.073,[0,0,0],'metal');
      p.pipe(gold,[s*.871,.668,-1.106],[s*.931,.668,-1.106],.111,.095);
      p.pipe(0x9c9a93,[s*.929,.667,-1.106],[s*.949,.667,-1.106],.070,.058);
      for(let i=0;i<4;i++)p.box(0x1c2225,[s*.973,.655,-.655+i*.069],[.023,.117,.045],.008,[.27,0,0]);
      p.path(0xfdd6ba,[[s*.88,.742,-.57],[s*.889,.715,-.38],[s*.845,.709,-.08]],.013,'coat');
      exhaustFlange(p,s*.40,.77,1.400,.089,0x795e4a);
      p.pipe(0x615d56,[s*.62,.77,1.11],[s*.40,.77,1.412],.061,.068);
      p.rivet(0xffc58f,[s*.679,1.107,1.097]);
      headlight(p,s*.46,1.304,-1.533,.29,.102);
      rearLamp(p,s*.46,.89,1.473);
    }
    withDriver(p,fit);
  }});
const saucer=concept({id:'violet-orbit',name:'Violet Orbit',role:'Bubble-dome saucer',color:violet,trim:cyan,
  mount:mount(0,.80,.12,.69),wheels:[],bounds:[1.91,-1.91,1.91],height:2.15,hover:true,tail:[.66,1.78],
  build(p,fit){
    p.lathe(0x302350,[[0,.40],[1.04,.40],[1.38,.47],[1.66,.58],[1.76,.67],[1.86,.82]],[0,0,0]);
    p.lathe(violet,[[1.82,.71],[1.877,.764],[1.885,.79],[1.882,.833],[1.862,.88],[1.784,.933],[1.68,1.00],[1.45,1.12],[1.25,1.22],[1.02,1.25],[.84,1.243]],[0,0,0],[0,0,0],'coat');
    p.lathe(0x2a173f,[[0,.61],[.81,.61],[.83,.79],[.84,1.243]],[0,0,0]);
    p.tube(0xb6a8c9,[0,1.242,0],.853,.037,[R,0,0],'metal');
    p.tube(0x3e2a64,[0,.819,0],1.862,.041,[R,0,0],'metal');
    p.tube(0x252038,[0,.743,0],1.832,.022,[R,0,0],'rubber');
    p.tube(0x8571a4,[0,.874,0],1.862,.012,[R,0,0],'metal');
    for(const d of [-1,1]){
      p.hull(0x403551,[[1.52,.14,.587,.790,d*.52],[1.68,.153,.585,.824,d*.52],[1.77,.116,.607,.805,d*.52]],'metal');
      exhaustFlange(p,d*.52,.715,1.662,.101,0x6a6480);
    }
    const deck = (paint,theta,ri,ro,yi,yo,span,mode) => {
      const at=(r,y,t)=>[r*Math.sin(t),y,r*Math.cos(t)];
      const points=[], triangles=[];
      for(let j=0;j<=5;j++){
        const a=theta+span*(2*j/5-1);
        points.push(at(ri,yi,a),at(ro,yo,a));
        if(j){const k=2*j;triangles.push(k-2,k-1,k+1,k-2,k+1,k);}
      }
      p.skin(paint,points,triangles,mode);
    };
    for(let i=0;i<10;i++){
      const th=full*i/10,s=Math.sin(th),c=Math.cos(th);
      deck(i%2===0?0xa568e4:0x833bbb,th,1.276,1.716,1.214,.995,.154,'coat');
      deck(0x352045,th,1.728,1.837,.993,.906,.159,'rubber');
      deck(cyan,th,1.753,1.818,.970,.924,.132,'glow');
      deck(0x211d30,th-.212,.945,1.17,1.257,1.253,.035,'metal');
      p.rivet(0xc2a9da,[.903*s,1.255,.903*c],[0,1,0],.013);
      if(i%2===0){
        const x=s*1.49,z=c*1.49;
        p.lathe(steel,[[0,-.15],[.21,-.15],[.29,-.12],[.32,-.052],[.295,.05],[.23,.12],[0,.12]],[x,.49,z],[0,0,0],'metal');
        p.tube(0x3d3648,[x,.374,z],.262,.033,[R,0,0],'rubber');
        p.tube(0x83d5ea,[x,.34,z],.227,.021,[R,0,0],'metal');
        p.ell(cyan,[x,.354,z],[.20,.029,.20],[0,0,0],'glow');
      }
    }
    p.add(0xc3e6ff,new p.T.SphereGeometry(1,36,18,0,full,0,R).scale(.858,.87,.858),[0,1.237,0],[0,0,0],'glass');
    withDriver(p,fit);
  }});
const split=concept({id:'volt-fork',name:'Volt Fork',role:'Twin-blade hover racer',color:green,trim:cyan,
  mount:mount(0,.85,.28,.70),wheels:[],bounds:[1.10,-2.32,1.53],height:2.07,hover:true,tail:[.67,1.45],
  build(p,fit){
    p.hull(ink,[[-1.68,.15,.45,.61],[-1.06,.42,.45,.88],[-.49,.50,.43,.94],[.34,.55,.48,.91],[1.24,.43,.54,.87],[1.44,.27,.65,.83]]);
    p.hull(0x353b38,[[-1.47,.21,.62,.69],[-1.10,.35,.68,.88],[-.68,.42,.78,.98],[-.49,.39,.79,.96]]);
    p.path(cyan,[[-.31,.974,-.68],[-.23,.926,-.97],[0,.862,-1.24],[.23,.926,-.97],[.31,.974,-.68]],.019,'glow');
    for(const s of [-1,1]){
      const x=s*.68;
      p.hull(0x242829,[[-2.29,.09,.28,.36,x],[-1.85,.16,.33,.51,x],[-1.14,.22,.40,.73,x],[-.45,.30,.43,.83,x+s*.08],[.36,.29,.46,.87,x+s*.09],[1.28,.22,.53,.80,x+s*.08]]);
      p.hull(green,[[-2.29,.084,.348,.394,x],[-1.81,.147,.45,.60,x],[-1.18,.211,.57,.81,x],[-.46,.287,.68,.96,x+s*.08],[.31,.279,.70,.94,x+s*.096],[1.24,.20,.63,.83,x+s*.078]]);
      p.path(cyan,[[x+s*.08,.354,-2.24],[x+s*.143,.434,-1.83],[x+s*.189,.506,-1.39],[x+s*.216,.571,-.94]],.025,'glow');
      p.hull(0x67a817,[[-.46,.13,.63,.93,x+s*.15],[.12,.20,.59,.94,x+s*.19],[.91,.18,.59,.89,x+s*.16],[1.37,.11,.60,.76,x+s*.13]]);
      p.path(cyan,[[x+s*.335,.646,-.38],[x+s*.377,.684,.03],[x+s*.363,.691,.56],[x+s*.27,.677,1.03]],.027,'glow');
      p.hull(green,[[.34,.035,.79,1.00,s*.53],[.75,.073,.93,1.44,s*.59],[1.24,.079,1.12,1.67,s*.64],[1.47,.05,1.21,1.68,s*.64]]);
      p.lathe(0x373e3b,[[0,-.19],[.205,-.19],[.24,-.12],[.245,.095],[.21,.149],[.156,.149],[.15,.040],[0,.040]],[x,.64,1.31],[R,0,0],'metal');
      p.tube(0x6ab651,[x,.64,1.441],.203,.023,[0,0,0],'coat');
      p.tube(0x22302b,[x,.64,1.458],.167,.014,[0,0,0],'rubber');
      p.path(0xd2ff61,[[x+s*.035,.407,-2.12],[x+s*.11,.62,-1.46],[x+s*.153,.819,-.91],[x+s*.23,.900,-.48],[x+s*.167,.939,.059]],.012,'coat');
      p.path(0x3b6824,[[x+s*.173,.89,-.66],[x+s*.208,.954,-.385],[x+s*.181,.937,.17],[x+s*.136,.852,.79]],.012,'coat');
      rearLouvres(p,x+s*.071,.942,.03,.31,.194,5);
      p.path(0xc5ef62,[[s*.58,1.339,.72],[s*.639,1.58,1.15],[s*.662,1.646,1.42]],.014,'coat');
    }
    withDriver(p,fit);
  }});
const mag=concept({id:'twin-current',name:'Twin Current',role:'Twin ring-wheel racer',color:turquoise,trim:cyan,
  mount:mount(0,.86,.31,.69),wheels:[wheel(-1.10,.11,1.02,.29,false,'ring',cyan,ink),wheel(1.10,.11,1.02,.29,false,'ring',cyan,ink)],bounds:[1.33,-1.64,1.29],height:2.07,tail:[.68,1.21],
  build(p,fit){
    p.hull(0x153849,[[-1.60,.35,.19,.44],[-1.32,.48,.21,.62],[-.75,.53,.26,.78],[-.21,.61,.38,.91],[.49,.53,.46,1.04],[1.21,.36,.46,.85]]);
    p.hull(turquoise,[[-1.61,.32,.33,.50],[-1.34,.45,.35,.67],[-.74,.55,.38,.83],[-.24,.62,.49,1.04]]);
    p.hull(0xe8eff2,[[-1.38,.19,.58,.65],[-.86,.30,.73,.86],[-.52,.26,.75,.93]]);
    for(const s of [-1,1]){
      p.hull(turquoise,[[-.54,.12,.55,.88,s*.46],[.09,.16,.66,1.01,s*.51],[.84,.14,.57,.94,s*.46],[1.16,.09,.56,.86,s*.38]]);
      p.pipe(steel,[s*.36,.92,.11],[s*1.06,1.02,.11],.175,.282);
      p.pipe(0x414c5a,[s*.83,1.02,.11],[s*1.12,1.02,.11],.33,.30);
      p.pipe(0x5d6874,[s*.88,1.02,.11],[s*.946,1.02,.11],.344,.332);
      p.pipe(0xa3b7c4,[s*1.115,1.02,.11],[s*1.146,1.02,.11],.23,.215);
      p.tube(steel,[s*.996,1.02,.11],.75,.043,[0,R,0],'metal');
      p.tube(0x46d7f6,[s*1.226,1.02,.11],.727,.032,[0,R,0],'glow');
      for(let i=0;i<7;i++){
        const angle=i*full/7,cy=1.02+Math.cos(angle)*.76,cz=.11+Math.sin(angle)*.76;
        p.box(0x627381,[s*1.234,cy,cz],[.044,.104,.237],.017,[angle,0,0],'metal');
      }
      p.path(0x227a8e,[[s*.446,.779,-.78],[s*.523,.912,-.406],[s*.523,.967,-.17]],.013,'coat');
      p.box(ink,[s*.335,.858,1.022],[.14,.045,.254],.016,[0,0,0],'rubber');
      exhaustFlange(p,s*.265,.641,1.113,.105,0x537d86);
      headlight(p,s*.27,.439,-1.548,.235,.124,s*.16,cyan);
      p.path(cyan,[[s*.38,.67,-1.21],[s*.48,.752,-.85],[s*.48,.80,-.66]],.017,'glow');
      rearLamp(p,s*.13,.758,1.202,.066);
    }
    withDriver(p,fit);
  }});
const ghost=concept({id:'rail-ghost',name:'Rail Ghost',role:'Amber-trim hover torpedo',color:0x272b32,trim:0xfbb238,
  mount:mount(0,.86,.31,.70),wheels:[],bounds:[1.03,-2.24,1.69],height:2.07,hover:true,tail:[.65,1.64],
  build(p,fit){
    const charcoal=0x292b32, bright=0xadb6bd, amber=0xf8a623, panel=0x656c75;
    p.hull(charcoal,[[-2.20,.05,.25,.34],[-1.69,.32,.31,.54],[-1.02,.56,.37,.82],[-.46,.57,.46,1.04],[.39,.54,.48,.93],[1.27,.48,.41,.99],[1.61,.27,.46,.80]]);
    p.hull(bright,[[-2.20,.063,.284,.352],[-1.88,.23,.38,.43],[-1.17,.43,.63,.67],[-.54,.47,.935,1.057]]);
    p.hull(charcoal,[[-2.20,.058,.337,.362],[-1.76,.21,.418,.502],[-1.08,.31,.631,.746],[-.53,.28,.938,1.082]]);
    for(const s of [-1,1]){
      p.path(amber,[[s*.255,.50,-1.68],[s*.449,.71,-1.20],[s*.566,.98,-.62],[s*.612,1.23,-.09],[s*.589,1.39,.47],[s*.497,1.43,.87],[s*.39,1.43,1.14]],.048);
      const pts=[[s*.454,.65,-1.17],[s*.548,.92,-.58],[s*.603,1.22,-.11],[s*.578,1.39,.45],[s*.484,1.43,.90],[s*.391,1.41,1.15],[s*.518,.77,1.09],[s*.631,.69,.38],[s*.62,.62,-.32]];
      const tri=[0,1,8,1,2,8,2,3,7,2,7,8,3,4,7,4,5,6,4,6,7];
      p.skin(amber,pts,[...tri,...tri.slice().reverse()],'glass');
      p.lathe(panel,[[0,-.55],[.27,-.55],[.34,-.42],[.38,-.28],[.39,.24],[.34,.44],[.277,.515],[.193,.54],[.180,.422],[0,.422]],[s*.63,.63,.79],[R,0,0],'metal');
      p.tube(0x262d36,[s*.63,.63,.435],.36,.021,[0,0,0],'metal');
      p.tube(amber,[s*.63,.63,.26],.276,.036,[0,0,0],'glow');
      p.tube(amber,[s*.63,.63,1.297],.277,.024,[0,0,0],'glow');
      for(let i=0;i<6;i++){
        const a=full*i/6, x=s*.63+Math.cos(a)*.353,y=.63+Math.sin(a)*.353;
        p.pipe(0x333b45,[x,y,.552],[x,y,1.14],.022,.020,'metal',6);
      }
      p.path(0x6e7884,[[s*.31,.47,-1.685],[s*.51,.65,-1.18],[s*.571,.791,-.68],[s*.564,.85,-.45]],.012,'metal');
      p.rivet(0xe4ad6d,[s*.50,1.279,.411],[0,1,0],.012);
      p.hull(bright,[[.51,.065,1.00,1.08,s*.48],[1.10,.18,.99,1.035,s*.69],[1.53,.22,.92,.985,s*.69]]);
      headlight(p,s*.17,.394,-1.915,.225,.076,s*.42);
    }
    p.hull(charcoal,[[.60,.04,1.04,1.10],[1.12,.09,1.03,1.55],[1.48,.07,1.00,1.60],[1.61,.04,.98,1.36]]);
    p.path(bright,[[0,1.11,.61],[0,1.52,1.13],[0,1.61,1.47]],.023);
    withDriver(p,fit);
  }});
const cushion=concept({id:'solar-cushion',name:'Solar Cushion',role:'Solar-deck hovercraft',color:white,trim:orange,
  mount:mount(0,.73,.25,.70),wheels:[],bounds:[1.59,-1.95,1.74],height:1.95,hover:true,tail:[.54,1.52],
  build(p,fit){
    const skirt=0xf88921, shadow=0xb44a16, cell=0x284675, seam=0x50719d;
    p.add(skirt,new p.T.TorusGeometry(1.245,.273,16,64).rotateX(R).scale(1.015,.87,1.16),[0,.454,-.03],[0,0,0],'rubber');
    p.add(0x5e402d,new p.T.TorusGeometry(1.26,.018,6,48).rotateX(R).scale(1.010,1,1.14),[0,.628,-.03],[0,0,0],'rubber');
    for(let i=0;i<16;i++){
      const a=full*i/16,s=Math.sin(a),c=Math.cos(a);
      p.path(shadow,[[1.36*s,.60,1.59*c-.03],[1.52*s,.46,1.75*c-.03],[1.37*s,.285,1.59*c-.03]],.011);
    }
    p.hull(0x464850,[[-1.87,.51,.53,.66],[-1.61,1.02,.55,.73],[-.89,1.34,.56,.82],[.63,1.38,.56,.85],[1.32,1.16,.57,.83],[1.58,.84,.54,.76]]);
    p.hull(white,[[-1.88,.52,.646,.724],[-1.57,.92,.680,.75],[-.98,1.25,.71,.93],[-.41,1.30,.72,.92]]);
    p.hull(white,[[.75,1.24,.70,.94],[1.26,1.17,.72,.94],[1.56,.82,.67,.84]]);
    p.hull(0xcdd1d1,[[-1.75,.31,.69,.75],[-1.02,.34,.72,.96],[-.42,.37,.73,.99]]);
    p.hull(skirt,[[-1.48,.11,.752,.765],[-.98,.15,.923,.955],[-.64,.13,.954,.98]]);
    for(const s of [-1,1]){
      p.hull(white,[[-1.40,.17,.70,.77,s*.66],[-.97,.36,.75,.94,s*.83],[-.39,.43,.76,1.02,s*.89],[.37,.44,.74,1.03,s*.91],[1.00,.35,.75,1.00,s*.86],[1.43,.22,.72,.90,s*.76]]);
      for(let j=0;j<5;j++)for(let k=0;k<2;k++){
        const x=s*(.752+k*.256),z=-.82+j*.358,y=j===0?1.002:j===1?1.024:j===4?1.035:1.055;
        const ang=j===0?-.13:j===1?-.06:j===4?.10:0;
        p.box(seam,[x,y,z],[.249,.025,.333],.011,[ang,0,0],'metal');
        p.box(cell,[x,y+.017,z],[.231,.012,.316],.005,[ang,0,0],'coat');
        for(let line of [-1,0,1])p.add(0x8095b0,new p.T.BoxGeometry(.004,.007,.310),[x+line*.051,y+.025,z],[ang,0,0],'metal');
        for(let line of [-1,1])p.add(0x8095b0,new p.T.BoxGeometry(.23,.007,.004),[x,y+.025,z+line*.079],[ang,0,0],'metal');
      }
      p.path(white,[[s*.52,.932,.86],[s*.51,1.44,.94],[s*.42,1.68,1.01],[0,1.69,1.01]],.091);
      p.box(skirt,[s*.494,1.494,.977],[.16,.28,.17],.037,[.07,0,-s*.21],'coat');
      p.box(ink,[s*.551,.904,1.40],[.265,.067,.249],.021,[.078,0,0],'rubber');
      rearLouvres(p,s*.551,.943,1.300,.164,.182,4);
      exhaustFlange(p,s*.565,.745,1.436,.110,0x6d8290);
      p.path(0xa7a6a2,[[s*.64,.735,-1.57],[s*.83,.911,-1.123],[s*.946,1.032,-.875]],.011,'metal');
      headlight(p,s*.55,.698,-1.73,.40,.097,s*.20);
    }
    withDriver(p,fit);
  }});
const sidecar=concept({id:'sunny-sidecar',name:'Sunny Sidecar',role:'Asymmetric road racer',color:yellow,trim:plum,
  mount:mount(-.38,.84,.16,.68),wheels:[wheel(-.38,-1.19,.527,.26,true,'road',plum),wheel(-.38,1.15,.527,.30,false,'road',plum),wheel(.91,.75,.50,.28,false,'road',plum)],
  bounds:[1.14,-1.80,1.72],height:2.02,tail:[.61,1.54],
  build(p,fit){
    const x=fit.x,car=.65;
    p.hull(ink,[[-.79,.20,.53,.90,x],[-.48,.28,.42,.95,x],[.55,.27,.47,.87,x],[1.50,.18,.52,.74,x]]);
    p.hull(yellow,[[-1.74,.095,.72,.79,x],[-1.31,.24,.84,1.02,x],[-.86,.32,.84,1.13,x],[-.48,.24,.76,1.04,x],[-.21,.15,.76,.92,x]]);
    p.hull(plum,[[-1.66,.031,.784,.803,x],[-1.28,.032,1.02,1.032,x],[-.87,.034,1.123,1.14,x],[-.59,.030,1.073,1.091,x]]);
    p.hull(yellow,[[.27,.15,.71,.83,x],[.61,.26,.70,.94,x],[1.23,.29,.72,.95,x],[1.52,.17,.77,.88,x]]);
    p.box(ink,[x,.815,.28],[.42,.13,.76],.063);
    for(const s of [-1,1]){
      p.pipe(steel,[x+s*.13,.527,-1.19],[x+s*.16,.985,-.69],.065);
      p.pipe(ink,[x+s*.178,.474,.28],[x+s*.182,.55,1.23],.06);
      p.path(0xa9a9ae,[[x+s*.178,.516,.61],[x+s*.249,.552,1.00],[x+s*.271,.62,1.48]],.057,'metal');
      exhaustFlange(p,x+s*.271,.62,1.499,.077);
      p.box(0x676570,[x+s*.263,.542,.658],[.104,.115,.200],.023,[.09,0,0],'metal');
      p.pipe(0xb7b9c2,[x+s*.13,.556,-1.187],[x+s*.151,.728,-.999],.066,.055);
      p.rivet(0xd8b864,[x+s*.225,.950,1.007],[0,1,0],.013);
    }
    for(const z of [-.33,.69])p.pipe(steel,[x,.49,z],[car,.49,z],.069);
    p.hull(yellow,[[-.91,.15,.36,.47,car],[-.62,.26,.37,.57,car],[-.15,.35,.36,.63,car],[.63,.34,.36,.68,car],[1.31,.24,.44,.67,car],[1.52,.16,.47,.635,car]]);
    p.box(leather,[car,.62,.33],[.51,.09,.62],.034);
    p.box(leather,[car,.77,.73],[.52,.36,.127],.051,[-.13,0,0],'rubber');
    for(let i=0;i<4;i++)p.box(0x49414a,[car,.715+i*.058,.653+i*.009],[.414,.029,.038],.009,[-.13,0,0],'rubber');
    for(const s of [-1,1]){
      p.path(yellow,[[car+s*.17,.56,-.78],[car+s*.31,.67,-.27],[car+s*.34,.69,.24],[car+s*.34,.77,.76],[car+s*.26,.86,1.08],[car,.86,1.21]],.053);
      p.path(plum,[[car+s*.15,.52,-.74],[car+s*.322,.60,-.23],[car+s*.355,.63,.29],[car+s*.351,.70,.80],[car+s*.27,.79,1.07]],.024);
    }
    p.hull(0xfecf29,[[.193,.15,.76,.833,1.0],[.432,.132,.84,.979,1.01],[.747,.120,.89,1.031,1.02],[1.046,.106,.78,.945,1.009],[1.211,.099,.66,.801,.999]]);
    p.box(plum,[1.007,.974,.82],[.166,.027,.293],.012,[.135,0,0],'coat');
    for(const zz of [-.15,-.036,.078])p.box(0x514226,[car+.348,.596,zz],[.042,.096,.052],.01,[.24,0,0],'rubber');
    headlight(p,x,.856,-1.554,.26,.094);headlight(p,car,.48,-.828,.21,.081);rearLamp(p,x,.815,1.50);
    withDriver(p,fit,true,false);
  }});

export const concepts=[mono,sail,sled,bamboo,mud,roller,saucer,split,mag,ghost,cushion,sidecar];
