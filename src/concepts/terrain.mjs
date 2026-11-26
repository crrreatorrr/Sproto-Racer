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
  // Rounded coachwork interpolates its cross-sections without smoothing end faces.
  // The superellipse exponent gives bulky shoulders with a flat-ish crown.
  function shell(color,stations,mode='coat',exponent=.62){
    const ring=16, v=[], tris=[];
    for(const [z,w,lo,hi,c=0] of stations){
      const cy=(lo+hi)*.5, h=(hi-lo)*.5;
      for(let i=0;i<ring;i++){
        const a=full*i/ring,x=Math.sin(a),y=-Math.cos(a);
        v.push(c+w*Math.sign(x)*Math.pow(Math.abs(x),exponent),
          cy+h*Math.sign(y)*Math.pow(Math.abs(y),exponent),z);
      }
    }
    const capBase=v.length/3;
    v.push(...v.slice(0,ring*3),...v.slice(-ring*3));
    for(let row=1;row<stations.length;row++)for(let i=0;i<ring;i++){
      const a=(row-1)*ring+i,b=(row-1)*ring+(i+1)%ring;
      tris.push(a,b,b+ring,a,b+ring,a+ring);
    }
    for(let i=1;i<ring-1;i++){
      const a=capBase,b=a+ring;
      tris.push(a,a+i+1,a+i,b,b+i,b+i+1);
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(tris);g.computeVertexNormals();
    return add(color,g,[0,0,0],[0,0,0],mode);
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
  return {T, add,box,ell,tube,pipe,rivet,hull,shell,path,skin,lathe};
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
    p.lathe(0x242327,[[.987,-.333],[1.006,-.333],[1.079,-.278],[1.103,-.221],
      [1.104,.221],[1.079,.278],[1.006,.333],[.987,.333]], [0,1.34,0],[0,0,-R],'rubber');
    for(const s of [-1,1]){
      p.tube(orange,[s*.324,1.34,0],1.04,.065,[0,R,0],'coat');
      p.tube(steel,[s*.348,1.34,0],.963,.027,[0,R,0],'metal');
      p.tube(0x8a452c,[s*.371,1.34,0],1.045,.015,[0,R,0],'metal');
      for(let i=0;i<8;i++){
        const a=full*i/8, y=1.34+Math.cos(a)*1.075,z=Math.sin(a)*1.075;
        const edge=(rad,t,d)=>[s*d,1.34+rad*Math.cos(t),rad*Math.sin(t)];
        const form=(k,d,paint)=>{
          const lo=1.018+k,hi=1.158+k;
          const points=[edge(lo,a-.156,d),edge(hi,a-.184,d-.039),edge(hi,a-.106,d+.015),
            edge(hi,a+.106,d+.015),edge(hi,a+.184,d-.039),edge(lo,a+.156,d)];
          const tri=[0,1,2,0,2,5,2,3,5,3,4,5];
          p.skin(paint,points,s>0?tri:tri.slice().reverse(),'coat');
        };
        form(.0,.393,0xc85a21);form(.041,.415,orange);
        for(const e of [-1,1])p.rivet(steel,[s*.427,y-e*Math.sin(a)*.113,z+e*Math.cos(a)*.113],[s,0,0],.017);
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
    p.shell(0x353238,[[-.78,.225,.39,.53],[-.61,.299,.35,.66],[-.36,.38,.32,.66],
      [.35,.382,.35,.76],[.65,.33,.41,.72],[.83,.26,.46,.68]],'rubber',.48);
    p.shell(orange,[[-.784,.218,.44,.56],[-.66,.264,.446,.65],[-.50,.239,.46,.64],[-.44,.179,.48,.55]]);
    p.box(0x67615f,[0,.623,-.639],[.287,.071,.177],.028,[.25,0,0],'metal');
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
    p.shell(gold,[[-1.71,.065,.375,.497],[-1.38,.165,.375,.579],[-.94,.229,.369,.643],
      [-.53,.369,.359,.667],[.09,.488,.346,.65],[.58,.494,.38,.65],[.94,.439,.4,.64],[1.24,.303,.44,.62]],'coat',.5);
    p.hull(0xf1b840,[[-1.65,.07,.477,.527],[-1.21,.167,.517,.613],[-.74,.27,.567,.695],[-.37,.366,.568,.744],[-.16,.339,.57,.711]]);
    p.shell(0x7e5730,[[.58,.254,.373,.474],[1.02,.294,.401,.537],[1.23,.245,.45,.557]],'metal',.55);
    p.box(0xffd77c,[0,.605,-1.032],[.074,.036,.214],.016,[.19,0,0],'coat');
    for(const s of [-1,1]){
      p.path(gold,[[0,.57,-1.65],[s*.27,.61,-.69],[s*.438,.69,.03],[s*.475,.70,.55],[s*.39,.68,1.07],[0,.66,1.28]],.051);
      p.pipe(0x574134,[s*.37,.52,.92],[s*.99,.43,1.18],.032);
      p.pipe(0x574134,[s*.30,.44,.53],[s*.99,.43,1.18],.034);
      for(let i=0;i<3;i++){
        const z=-.029+i*.289;
        p.pipe(0xcd9444,[s*.420,.409,z-.133],[s*.468,.661,z+.051],.022);
        p.pipe(0xaa783d,[s*.475,.654,z+.051],[s*.418,.412,z+.221],.021);
      }
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
    const a=[.19,.589,-1.41],b=[.50,2.90,.70],c=[.67,1.08,1.79];
    const foot=[.238,1.04,-.98],points=[],tri=[];
    p.pipe(0x694d2d,a,b,.044,.024);p.pipe(0x694d2d,foot,c,.023,.035);
    p.pipe(0x886745,[.382,.69,.71],[.60,.99,1.60],.028,.022);
    p.box(0x8b622e,[.188,.584,-1.372],[.16,.115,.13],.033,[.3,0,.1],'metal');
    const ler=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
    for(let j=0;j<8;j++){
      const t=j/8,l=ler(foot,b,t),r=ler(c,b,t);
      for(let i=0;i<=8;i++){
        const u=i/8,v=ler(l,r,u);v[0]+=.126*Math.sin(Math.PI*u)*Math.sin(Math.PI*t);points.push(v);
        if(j&&i){const k=9*j+i;tri.push(k-10,k-9,k,k-10,k,k-1);}
      }
      if(j>0){
        const seam=Array.from({length:9},(_,i)=>{
          const u=i/8,v=ler(l,r,u);v[0]+=.126*Math.sin(Math.PI*u)*Math.sin(Math.PI*t)-.004;return v;
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
    p.shell(0x183aa0,[[-1.676,.23,.59,.76],[-1.475,.397,.54,.901],[-1.162,.55,.54,1.017],[-.754,.451,.60,1.15],[-.37,.267,.684,1.16]],'coat',.68);
    p.hull(blue,[[-1.675,.217,.735,.787],[-1.485,.365,.830,.928],[-1.10,.460,.945,1.071],[-.729,.369,1.053,1.169],[-.36,.239,1.005,1.145]]);
    p.shell(blue,[[.49,.301,.63,.914],[.80,.414,.60,1.004],[1.25,.341,.59,.929],[1.53,.219,.63,.87]],'coat',.60);
    p.box(ink,[0,1.025,.37],[.58,.19,.98],.091,[.12,0,0],'rubber');
    for(let i=0;i<5;i++)p.box(0x424650,[0,1.102-i*.014,.39+i*.080],[.44,.021,.013],.004,[.12,0,0],'rubber');
    p.hull(0x162649,[[-1.576,.225,.715,.773],[-1.341,.349,.822,.961],[-1.085,.381,.922,1.081],[-.939,.277,.965,1.120]]);
    p.hull(0x4f7de3,[[-1.566,.205,.771,.793],[-1.318,.34,.936,.980],[-1.073,.369,1.064,1.105],[-.942,.254,1.095,1.141]]);
    p.hull(0x292d3e,[[-.888,.162,1.048,1.151],[-.60,.155,1.114,1.197],[-.421,.098,1.120,1.189]],'rubber');
    p.path(light,[[-.277,.881,-1.49],[-.166,.779,-1.622],[0,.744,-1.684],[.168,.779,-1.622],[.277,.881,-1.49]],.038,'glow');
    p.path(0x8c98b1,[[-.307,.883,-1.491],[-.181,.749,-1.645],[0,.712,-1.686],[.181,.749,-1.645],[.307,.883,-1.491]],.022,'metal');
    for(const s of [-1,1]){
      const x=s*.81;
      p.pipe(steel,[s*.33,.74,-.65],[x,.55,-.64],.09);
      p.pipe(steel,[s*.30,.71,.51],[x,.53,.57],.077);
      p.shell(blue,[[-1.898,.207,.265,.418,x],[-1.689,.297,.259,.535,x],[-1.29,.369,.255,.670,x],
        [-.71,.392,.252,.734,x],[-.18,.386,.263,.746,x],[.43,.349,.296,.724,x],[.94,.294,.324,.662,x],[1.16,.236,.364,.594,x]],'coat',.52);
      p.shell(ink,[[-1.815,.236,.247,.381,x],[-1.33,.361,.230,.387,x],[-.58,.394,.228,.394,x],[.21,.365,.242,.401,x],[.87,.293,.269,.366,x],[1.128,.213,.288,.366,x]],'rubber',.49);
      p.hull(white,[[-1.788,.119,.417,.457,x+s*.072],[-1.36,.126,.619,.665,x+s*.105],[-1.08,.118,.686,.709,x+s*.101],[-.726,.102,.705,.739,x+s*.099]]);
      p.hull(white,[[.356,.028,.521,.616,x+s*.299],[.63,.037,.469,.606,x+s*.292],[.92,.043,.424,.550,x+s*.241],[1.071,.027,.413,.523,x+s*.219]]);
      p.hull(0x151e33,[[.52,.178,.632,.734,x],[.81,.167,.607,.699,x],[1.109,.131,.543,.639,x]]);
      p.box(ink,[x,.737,.16],[.29,.057,.84],.03,[.014,0,0],'rubber');
      rearLouvres(p,x,.775,-.113,.54,.233,6);
      p.box(cyan,[x,.27,.25],[.26,.040,1.03],.012,[0,0,0],'glow');
      p.path(0x5294f1,[[x+s*.119,.366,-1.79],[x+s*.294,.457,-1.42],[x+s*.365,.523,-.72],[x+s*.323,.529,.35],[x+s*.242,.486,1.09]],.009,'coat');
      for(const z of [-.53,.73])p.rivet(steel,[x+s*.086,.731,z]);
      exhaustFlange(p,x,.48,1.045,.118,0x4d627c);
      p.box(0xc19f72,[x,.383,-1.895],[.354,.121,.071],.035,[.10,0,0],'metal');
      headlight(p,x,.401,-1.937,.300,.082);
    }
    withDriver(p,fit,true,false);
  }});
const bamboo=concept({id:'bamboo-trike',name:'Bamboo Trike',role:'Lashed-frame trike',color:leaf,trim:gold,
  mount:mount(0,.84,.17,.68),wheels:[wheel(0,-1.20,.49,.31,true,'offroad',leaf),wheel(.68,.94,.48,.34,false,'offroad',leaf),wheel(-.68,.94,.48,.34,false,'offroad',leaf)],
  bounds:[.94,-1.80,1.49],height:2.02,tail:[.67,1.30],
  build(p,fit){
    p.shell(0x637a32,[[-1.60,.121,.851,.923],[-1.43,.234,.846,1.004],[-1.17,.284,.858,1.105],
      [-.904,.305,.829,1.190],[-.624,.352,.746,1.129],[-.398,.343,.711,1.005],[-.17,.205,.677,.873]],'coat',.72);
    p.shell(0x829b30,[[-1.60,.105,.873,.932],[-1.43,.217,.901,1.008],[-1.16,.269,1.015,1.106],[-.895,.265,1.100,1.196],
      [-.586,.226,1.025,1.123],[-.447,.16,.939,1.018]],'coat',.86);
    p.shell(0x8aa93c,[[-1.41,.179,.998,1.053],[-1.20,.193,1.060,1.119],[-.83,.164,1.167,1.202],[-.542,.108,1.059,1.117]],'coat',1.12);
    p.shell(0x496437,[[-.96,.228,.568,.815],[-.58,.319,.534,.818],[-.326,.263,.466,.733],[.166,.211,.434,.703]],'rubber',.76);
    p.hull(0x627830,[[-.62,.27,.53,.76],[.08,.43,.36,.72],[.70,.44,.40,.69],[1.24,.44,.47,.70]]);
    p.shell(0x677a30,[[.29,.266,.642,.835],[.72,.337,.605,.860],[1.128,.381,.577,.806],[1.335,.366,.616,.771]],'coat',.61);
    p.shell(ink,[[-.235,.212,.740,.856],[.04,.242,.703,.869],[.369,.251,.706,.879],[.618,.245,.760,.924],[.754,.181,.797,.913]],'rubber',.57);
    for(const s of [-1,1]){
      const nodes=[[s*.12,.51,-1.17],[s*.31,.88,-.46],[s*.49,.69,.32],[s*.58,.69,1.31]];
      p.path(0x899f3d,nodes,.071,'coat');
      p.path(0x78952f,[[s*.14,.73,-1.15],[s*.28,.43,-.37],[s*.46,.39,.48],[s*.57,.68,1.32]],.065,'coat');
      p.path(0xa2a748,[[s*.277,.660,-.675],[s*.365,.634,-.258],[s*.449,.663,.301],[s*.508,.710,.734],[s*.583,.715,1.313]],.048,'coat');
      p.pipe(0x9ea444,[s*.535,.712,.677],[s*.569,.717,1.167],.041,.041,'coat',10);
      p.pipe(0xaa8c58,[s*.175,.58,-1.194],[s*.198,.754,-.938],.065,.057,'metal',12);
      p.pipe(0xcaba7f,[s*.199,.762,-.936],[s*.221,.953,-.772],.054,.049,'metal',12);
      p.pipe(0x9aaf41,[s*.26,.47,-.36],[s*.48,.69,.34],.039);
      p.pipe(0xacc25c,[s*.45,.41,.44],[s*.57,.69,1.31],.044);
      p.pipe(0xa19057,[s*.13,.52,-1.20],[s*.20,.96,-.77],.059,.045);
      for(const [x,y,z] of [nodes[1],nodes[2],nodes[3]]){
        for(let i=-2;i<=2;i++)p.tube(i%2?0xe1bd78:0xd2a05b,[x,y,z+i*.021],.075,.013,[0,0,s*.19],'rubber');
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
    p.path(0xbbcd45,[[0,.907,-1.588],[0,1.04,-1.359],[0,1.198,-.895],[0,1.126,-.586],[0,1.026,-.478]],.013,'coat');
    for(const d of [-1,1])p.path(0xa3b33c,[[0,1.197,-.927],[d*.137,1.153,-.746],[d*.216,1.067,-.54]],.010,'coat');
    p.hull(0xc78b47,[[-1.531,.163,.898,1.024],[-1.435,.182,.898,1.045],[-1.361,.232,.870,1.066]]);
    headlight(p,0,.968,-1.532,.284,.113);
    withDriver(p,fit,true,false);
  }});
const mud=concept({id:'mud-marauder',name:'Mud Marauder',role:'Six-wheel utility buggy',color:khaki,trim:ink,
  mount:mount(0,.83,.02,.70),wheels:[-.99,.99].flatMap(x=>[-1.32,.51,1.47].map((z,i)=>wheel(x,z,i===0?.575:.525,.40,i===0,'offroad',0x999c58))),
  bounds:[1.28,-2.23,2.04],height:2.17,tail:[.57,1.95],
  build(p,fit){
    p.shell(0x49483c,[[-1.977,.645,.375,.660],[-1.591,.798,.323,.709],[-.593,.835,.324,.734],[.537,.858,.355,.755],
      [1.616,.81,.411,.736],[1.991,.710,.453,.701]],'rubber',.46);
    p.hull(0x646441,[[-1.967,.74,.540,.797],[-1.772,.889,.574,.926],[-1.406,.951,.609,1.057],
      [-.939,.930,.65,1.097],[-.536,.696,.719,1.094]]);
    p.hull(0x909259,[[-1.889,.452,.817,.915],[-1.646,.583,.843,1.023],[-1.051,.529,.911,1.177],[-.607,.382,.953,1.205]]);
    p.hull(0x383b31,[[-1.408,.186,1.017,1.079],[-1.079,.233,1.096,1.197],[-.74,.236,1.11,1.212]]);
    for(let i=-2;i<=2;i++)p.box(steel,[i*.066,1.176-i*i*.003,-1.012],[.017,.027,.306],.007,[.13,0,0],'metal');
    p.box(ink,[0,.682,-1.996],[.858,.234,.079],.030);
    for(let i=-2;i<=2;i++)p.box(0x666e54,[i*.149,.686,-2.041],[.042,.189,.018],.007,[0,0,0],'metal');
    p.box(khaki,[0,.705,1.37],[1.76,.22,1.22],.051);
    p.box(ink,[0,.84,1.45],[1.50,.08,1.02],.02);
    for(let i=-5;i<=5;i++)p.box(0x585744,[i*.128,.889,1.45],[.025,.015,.99],.005);
    for(const s of [-1,1]){
      p.hull(khaki,[[-1.814,.147,.74,.927,s*.939],[-1.553,.206,.957,1.108,s*.953],
        [-1.224,.243,1.144,1.230,s*.954],[-.893,.249,1.089,1.198,s*.930],[-.547,.187,.824,.976,s*.877],[-.368,.157,.606,.846,s*.826]]);
      p.hull(0x858253,[[.226,.159,.878,.995,s*.901],[.511,.244,1.067,1.159,s*.906],[1.073,.251,1.069,1.135,s*.923],
        [1.540,.238,1.065,1.130,s*.919],[1.855,.192,.961,1.071,s*.891],[1.992,.141,.807,.954,s*.826]]);
      p.hull(0x464632,[[.390,.072,.793,.913,s*.848],[.697,.090,.811,1.237,s*.848],[1.692,.069,.825,1.236,s*.848],
        [1.983,.068,.784,1.057,s*.812]]);
      p.box(0x85865a,[s*.864,1.170,1.25],[.130,.185,1.178],.037,[0,0,0],'coat');
      for(let i=0;i<3;i++)p.box(0x333528,[s*.938,1.19,.881+i*.347],[.022,.081,.211],.015,[0,0,0],'rubber');
      p.path(0x484342,[[s*.69,.80,-.50],[s*.59,1.75,-.48],[s*.55,2.13,-.37],[s*.55,2.14,.54],[s*.70,.86,.72]],.063);
      p.pipe(0x524d49,[s*.57,1.97,.6],[s*.81,.88,1.28],.052);
      p.hull(0x77794b,[[-.656,.123,.693,.990,s*.738],[-.337,.145,.576,.950,s*.725],[.245,.136,.609,.904,s*.716],[.534,.131,.667,.895,s*.752]]);
      p.hull(0x333934,[[-.601,.084,.533,.636,s*.818],[-.286,.095,.454,.567,s*.866],[.285,.101,.470,.565,s*.862],[.483,.071,.512,.600,s*.830]],'rubber');
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
    p.shell(0xea664d,[[-1.536,.553,1.221,1.379],[-1.385,.699,1.208,1.443],[-1.120,.818,1.216,1.437],
      [-.826,.772,1.162,1.351],[-.573,.639,.899,1.194],[-.296,.435,.775,1.036]],'coat',.52);
    p.hull(0x454143,[[-1.503,.331,1.362,1.402],[-1.336,.408,1.410,1.447],[-1.059,.443,1.404,1.436],[-.841,.336,1.315,1.352]],'rubber');
    p.shell(coral,[[.426,.413,.730,.957],[.677,.564,.722,1.095],[.99,.686,.748,1.194],[1.311,.691,.718,1.157],[1.46,.622,.700,1.056]],'coat',.58);
    for(const s of [-1,1]){
      p.shell(0xf16a50,[[-1.505,.073,.566,.951,s*.858],[-1.331,.132,.423,1.190,s*.860],
        [-1.105,.146,.368,1.283,s*.859],[-.856,.151,.460,1.255,s*.846],[-.538,.148,.563,1.050,s*.816],[-.094,.123,.565,.895,s*.756]],'coat',.57);
      p.shell(0xbb4e3d,[[-1.232,.147,.364,.718,s*.865],[-1.027,.163,.343,.807,s*.850],[-.705,.164,.424,.788,s*.827],[-.214,.128,.527,.744,s*.755]],'coat',.56);
      p.shell(coral,[[.319,.145,.74,1.026,s*.756],[.532,.229,.903,1.191,s*.791],[.801,.241,1.073,1.227,s*.789],
        [1.079,.232,1.047,1.201,s*.797],[1.363,.210,.833,1.128,s*.772],[1.485,.147,.704,.966,s*.723]],'coat',.58);
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
      p.hull(0x34323d,[[-1.554,.151,1.211,1.359,s*.455],[-1.479,.198,1.202,1.388,s*.475],[-1.351,.196,1.241,1.389,s*.513]]);
      headlight(p,s*.461,1.288,-1.585,.237,.089,s*.14);
      rearLamp(p,s*.46,.89,1.473);
    }
    withDriver(p,fit);
  }});
const saucer=concept({id:'violet-orbit',name:'Violet Orbit',role:'Bubble-dome saucer',color:violet,trim:cyan,
  mount:mount(0,.80,.12,.69),wheels:[],bounds:[1.91,-1.91,1.91],height:2.15,hover:true,tail:[.66,1.78],
  build(p,fit){
    p.lathe(0x39265d,[[0,.376],[1.06,.376],[1.37,.421],[1.61,.507],[1.741,.609],[1.834,.708],[1.864,.81]],
      [0,0,0],[0,0,0],'coat');
    p.lathe(0x6330b9,[[1.82,.71],[1.878,.752],[1.891,.791],[1.889,.858],[1.848,.937],[1.766,.991],
      [1.632,1.047],[1.449,1.12],[1.260,1.188],[1.061,1.238],[.919,1.253],[.84,1.240]],
      [0,0,0],[0,0,0],'coat');
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
      deck(i===5?0xdbe3ef:i%2===0?0x834dd5:0x7437c1,th,1.267,1.626,1.199,1.058,i===5?.216:.179,'coat');
      deck(0x382555,th,1.634,1.836,1.055,.951,.198,'rubber');
      deck(cyan,th,1.668,1.804,1.042,.975,.166,'glow');
      deck(0x242435,th-.221,.941,1.154,1.266,1.229,.042,'metal');
      p.rivet(0xc2a9da,[.903*s,1.255,.903*c],[0,1,0],.013);
      if(i%2===0){
        const x=s*1.515,z=c*1.515,angle=.276;
        const axis=[angle*c,0,-angle*s],rad=[R+angle*c,0,-angle*s];
        p.lathe(0x58666e,[[0,-.162],[.25,-.162],[.300,-.134],[.321,-.096],[.319,.004],
          [.280,.076],[.198,.140],[0,.140]], [x,.503,z],axis,'metal');
        const tip=[x+s*.033,.354,z+c*.033];
        p.tube(0x282c3b,tip,.258,.034,rad,'rubber');
        p.tube(0x67b4d4,[tip[0]+s*.014,.328,tip[2]+c*.014],.228,.022,rad,'metal');
        p.ell(cyan,[tip[0]+s*.012,.339,tip[2]+c*.012],[.205,.027,.205],axis,'glow');
      }
    }
    p.lathe(0x93a6ba,[[.847,1.226],[.893,1.235],[.899,1.257],[.883,1.279],[.848,1.275]],[0,0,0],[0,0,0],'metal');
    p.add(0xc0dbf7,new p.T.SphereGeometry(1,40,20,0,full,0,R).scale(.879,.921,.879),[0,1.249,0],[0,0,0],'glass');
    withDriver(p,fit);
  }});
const split=concept({id:'volt-fork',name:'Volt Fork',role:'Twin-blade hover racer',color:green,trim:cyan,
  mount:mount(0,.85,.28,.70),wheels:[],bounds:[1.10,-2.32,1.53],height:2.07,hover:true,tail:[.67,1.45],
  build(p,fit){
    p.shell(0x212729,[[-1.647,.173,.413,.592],[-1.393,.310,.398,.700],[-1.032,.418,.386,.827],
      [-.525,.518,.379,.951],[.171,.562,.432,.944],[.799,.499,.505,.897],[1.24,.413,.535,.876],[1.44,.274,.631,.822]],
      'coat',.62);
    p.hull(0x424b48,[[-1.462,.209,.605,.681],[-1.183,.323,.671,.771],[-.860,.387,.741,.926],
      [-.625,.428,.817,1.004],[-.489,.378,.848,.999]]);
    p.hull(0x1f2d25,[[-1.293,.166,.711,.763],[-1.119,.231,.748,.823],[-.898,.274,.851,.904],[-.616,.274,.950,1.007]]);
    p.path(cyan,[[-.31,.974,-.68],[-.24,.916,-.93],[-.152,.858,-1.09],[0,.791,-1.299],[.154,.858,-1.09],
      [.24,.916,-.93],[.31,.974,-.68]],.022,'glow');
    for(const s of [-1,1]){
      const x=s*.68;
      p.hull(0x242829,[[-2.29,.09,.28,.36,x],[-1.85,.16,.33,.51,x],[-1.14,.22,.40,.73,x],[-.45,.30,.43,.83,x+s*.08],[.36,.29,.46,.87,x+s*.09],[1.28,.22,.53,.80,x+s*.08]]);
      p.shell(0x8cde30,[[-2.291,.067,.337,.399,x],[-2.033,.12,.365,.508,x],[-1.72,.171,.427,.624,x],
        [-1.178,.212,.512,.816,x+s*.042],[-.676,.262,.572,.993,x+s*.068],[-.236,.288,.593,1.034,x+s*.081],
        [.382,.284,.610,.966,x+s*.090],[1.21,.204,.605,.858,x+s*.078]],'coat',.51);
      p.hull(0xb8f240,[[-2.273,.053,.384,.409,x],[-1.936,.102,.483,.540,x],[-1.424,.168,.658,.762,x+s*.038],
        [-.844,.225,.812,.976,x+s*.055],[-.367,.232,.915,1.041,x+s*.080]]);
      p.path(cyan,[[x+s*.08,.354,-2.24],[x+s*.143,.434,-1.83],[x+s*.189,.506,-1.39],[x+s*.216,.571,-.94]],.025,'glow');
      p.shell(0x68b020,[[-.153,.147,.586,.883,x+s*.197],[.191,.177,.545,1.004,x+s*.209],[.651,.188,.551,.980,x+s*.211],
        [1.038,.153,.585,.876,x+s*.186],[1.338,.107,.596,.762,x+s*.148]],'coat',.53);
      p.hull(0x1f3539,[[-.199,.030,.646,.713,x+s*.332],[.146,.036,.650,.775,x+s*.376],[.627,.033,.633,.756,x+s*.375],[1.051,.029,.646,.722,x+s*.300]]);
      p.path(cyan,[[x+s*.350,.680,-.182],[x+s*.391,.726,.06],[x+s*.397,.710,.53],[x+s*.361,.684,1.009]],.022,'glow');
      p.hull(0x7fc322,[[.214,.052,.777,.973,s*.517],[.503,.090,.824,1.217,s*.564],[.841,.097,.912,1.487,s*.613],
        [1.214,.109,1.116,1.727,s*.710],[1.485,.055,1.174,1.697,s*.727]]);
      p.hull(0xb3e648,[[.513,.044,1.201,1.232,s*.566],[.842,.046,1.463,1.491,s*.626],[1.202,.070,1.697,1.734,s*.702],
        [1.448,.044,1.669,1.701,s*.724]]);
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
  mount:mount(0,.86,.31,.69),wheels:[-1.10,1.10].map(x=>({...wheel(x,.11,1.02,.29,false,'ring',cyan,ink),rimPads:'magnetic'})),
  bounds:[1.33,-1.64,1.29],height:2.07,tail:[.68,1.21],
  build(p,fit){
    p.shell(0x174552,[[-1.613,.274,.221,.431],[-1.417,.432,.188,.569],[-.985,.523,.202,.741],[-.518,.588,.252,.880],
      [-.18,.636,.374,.926],[.442,.561,.454,1.032],[1.212,.362,.461,.847]],'coat',.47);
    p.hull(0x00a8d9,[[-1.619,.284,.325,.499],[-1.447,.418,.325,.605],[-1.113,.502,.341,.714],[-.697,.570,.355,.865],
      [-.267,.616,.522,1.068]]);
    p.hull(0xe2e9ed,[[-1.201,.158,.652,.714],[-.982,.238,.721,.795],[-.683,.294,.795,.901],[-.475,.281,.851,.970],[-.369,.219,.893,1.020]]);
    for(const s of [-1,1]){
      p.shell(0x04bce4,[[-.706,.142,.439,.820,s*.433],[-.373,.188,.528,.983,s*.492],[.116,.200,.671,1.108,s*.524],
        [.631,.164,.611,1.033,s*.468],[1.113,.113,.557,.849,s*.396]],'coat',.56);
      p.hull(0x2e6d80,[[-.857,.082,.40,.661,s*.418],[-.516,.122,.454,.866,s*.475],[-.152,.130,.562,.913,s*.506]]);
      p.pipe(0x778b96,[s*.356,.889,.11],[s*.612,.978,.11],.125,.214);
      p.pipe(0x9baebc,[s*.55,.983,.11],[s*1.075,1.02,.11],.213,.284);
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
      p.path(0x164a65,[[s*.251,.390,-1.614],[s*.378,.443,-1.478],[s*.487,.553,-1.232],[s*.474,.620,-1.122]],.061,'rubber');
      p.path(cyan,[[s*.235,.422,-1.626],[s*.371,.463,-1.497],[s*.479,.554,-1.249],[s*.480,.602,-1.166]],.034,'glow');
      p.path(cyan,[[s*.289,.642,-1.21],[s*.441,.770,-.85],[s*.507,.815,-.67]],.021,'glow');
      rearLamp(p,s*.13,.758,1.202,.066);
    }
    withDriver(p,fit);
  }});
const ghost=concept({id:'rail-ghost',name:'Rail Ghost',role:'Amber-trim hover torpedo',color:0x272b32,trim:0xfbb238,
  mount:mount(0,.86,.31,.70),wheels:[],bounds:[1.03,-2.24,1.69],height:2.07,hover:true,tail:[.65,1.64],
  build(p,fit){
    const charcoal=0x292b32, bright=0xadb6bd, amber=0xf8a623, panel=0x656c75;
    p.shell(charcoal,[[-2.20,.052,.252,.334],[-1.958,.239,.261,.445],[-1.62,.406,.309,.634],[-1.186,.538,.332,.780],
      [-.702,.605,.391,.942],[-.336,.614,.450,1.044],[.421,.556,.459,.990],[1.225,.495,.425,1.015],[1.61,.275,.455,.788]],'coat',.62);
    p.shell(bright,[[-2.20,.061,.278,.356],[-1.919,.255,.349,.471],[-1.586,.408,.440,.640],[-1.095,.505,.594,.793],[-.602,.497,.764,.999]],'metal',.60);
    p.shell(0x2d3039,[[-2.206,.053,.331,.369],[-1.901,.199,.425,.505],[-1.589,.306,.540,.662],[-1.075,.394,.697,.849],[-.558,.329,.920,1.079]],'coat',.70);
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
      p.path(0x252631,[[s*.085,.377,-2.161],[s*.181,.444,-1.948],[s*.267,.548,-1.701],[s*.361,.628,-1.494]],.060,'rubber');
      p.path(0xffc45e,[[s*.083,.390,-2.174],[s*.178,.463,-1.956],[s*.274,.559,-1.713],[s*.352,.641,-1.511]],.030,'glow');
    }
    p.hull(charcoal,[[.60,.04,1.04,1.10],[1.12,.09,1.03,1.55],[1.48,.07,1.00,1.60],[1.61,.04,.98,1.36]]);
    p.path(bright,[[0,1.11,.61],[0,1.52,1.13],[0,1.61,1.47]],.023);
    withDriver(p,fit);
  }});
const cushion=concept({id:'solar-cushion',name:'Solar Cushion',role:'Solar-deck hovercraft',color:white,trim:orange,
  mount:mount(0,.73,.25,.70),wheels:[],bounds:[1.59,-1.95,1.74],height:1.95,hover:true,tail:[.54,1.52],
  build(p,fit){
    const skirt=0xf88921, shadow=0xb44a16, cell=0x284675, seam=0x50719d;
    p.add(0xf78420,new p.T.TorusGeometry(1.17,.345,20,64).rotateX(R).scale(1.021,.91,1.16),
      [0,.460,-.03],[0,0,0],'rubber');
    p.add(0x352e28,new p.T.TorusGeometry(1.347,.034,8,52).rotateX(R).scale(1.008,1,1.151),[0,.671,-.03],[0,0,0],'rubber');
    for(let i=0;i<16;i++){
      const a=full*i/16,s=Math.sin(a),c=Math.cos(a);
      p.path(shadow,[[1.378*s,.711,1.596*c-.03],[1.485*s,.591,1.719*c-.03],[1.541*s,.457,1.748*c-.03],
        [1.476*s,.319,1.713*c-.03],[1.376*s,.213,1.591*c-.03]],.010,'rubber');
    }
    p.hull(0x464850,[[-1.87,.51,.53,.66],[-1.61,1.02,.55,.73],[-.89,1.34,.56,.82],[.63,1.38,.56,.85],[1.32,1.16,.57,.83],[1.58,.84,.54,.76]]);
    p.shell(white,[[-1.878,.49,.638,.753],[-1.691,.787,.638,.803],[-1.38,1.095,.641,.869],[-1.01,1.238,.658,.960],[-.420,1.306,.69,.959]],'coat',.57);
    p.hull(white,[[.75,1.24,.70,.94],[1.26,1.17,.72,.94],[1.56,.82,.67,.84]]);
    p.shell(0xcfd5d9,[[-1.789,.272,.706,.789],[-1.536,.306,.728,.850],[-1.048,.363,.759,1.014],[-.426,.355,.782,1.054]],'coat',.64);
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
      p.shell(0x3b3d42,[[-1.801,.181,.674,.804,s*.561],[-1.697,.225,.672,.813,s*.589],[-1.594,.204,.681,.815,s*.645]],'rubber',.50);
      headlight(p,s*.563,.741,-1.817,.331,.078,s*.27);
    }
    withDriver(p,fit);
  }});
const sidecar=concept({id:'sunny-sidecar',name:'Sunny Sidecar',role:'Asymmetric road racer',color:yellow,trim:plum,
  mount:mount(-.38,.84,.16,.68),wheels:[wheel(-.38,-1.19,.527,.26,true,'road',plum),wheel(-.38,1.15,.527,.30,false,'road',plum),wheel(.91,.75,.50,.28,false,'road',plum)],
  bounds:[1.14,-1.80,1.72],height:2.02,tail:[.61,1.54],
  build(p,fit){
    const x=fit.x,car=.65;
    p.hull(ink,[[-.79,.20,.53,.90,x],[-.48,.28,.42,.95,x],[.55,.27,.47,.87,x],[1.50,.18,.52,.74,x]]);
    p.shell(0xf3bc12,[[-1.743,.109,.694,.805,x],[-1.541,.189,.786,.954,x],[-1.226,.234,.838,1.065,x],[-.844,.318,.804,1.173,x],
      [-.506,.279,.751,1.076,x],[-.227,.166,.731,.901,x]],'coat',.51);
    p.path(0xcb197e,[[x,.806,-1.718],[x,.951,-1.534],[x,1.061,-1.231],[x,1.178,-.846],[x,1.126,-.624],[x,1.072,-.515]],.023,'coat');
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
    p.shell(0xf4bd1c,[[-.942,.158,.369,.507,car],[-.71,.282,.357,.640,car],[-.393,.339,.355,.703,car],[-.018,.361,.361,.683,car],
      [.574,.356,.394,.699,car],[.991,.322,.426,.742,car],[1.298,.246,.425,.718,car],[1.507,.158,.468,.637,car]],'coat',.61);
    p.shell(yellow,[[-.912,.143,.476,.541,car],[-.647,.274,.534,.684,car],[-.348,.297,.589,.725,car],[-.121,.261,.597,.696,car]],'coat',.46);
    p.shell(0xd8a412,[[.774,.236,.608,.734,car],[1.036,.332,.643,.899,car],[1.316,.259,.595,.828,car],[1.504,.156,.533,.678,car]],'coat',.52);
    p.box(leather,[car,.62,.33],[.51,.09,.62],.034);
    p.box(leather,[car,.77,.73],[.52,.36,.127],.051,[-.13,0,0],'rubber');
    for(let i=0;i<4;i++)p.box(0x49414a,[car,.715+i*.058,.653+i*.009],[.414,.029,.038],.009,[-.13,0,0],'rubber');
    for(const s of [-1,1]){
      p.path(yellow,[[car+s*.148,.608,-.75],[car+s*.269,.705,-.348],[car+s*.330,.718,.059],[car+s*.339,.767,.498],
        [car+s*.297,.864,.868],[car+s*.201,.914,1.104],[car,.917,1.194]],.068,'coat');
      p.path(plum,[[car+s*.15,.52,-.74],[car+s*.322,.60,-.23],[car+s*.355,.63,.29],[car+s*.351,.70,.80],[car+s*.27,.79,1.07]],.024);
    }
    p.hull(0xfecf29,[[.193,.15,.76,.833,1.0],[.432,.132,.84,.979,1.01],[.747,.120,.89,1.031,1.02],[1.046,.106,.78,.945,1.009],[1.211,.099,.66,.801,.999]]);
    p.box(plum,[1.007,.974,.82],[.166,.027,.293],.012,[.135,0,0],'coat');
    for(const zz of [-.15,-.036,.078])p.box(0x514226,[car+.348,.596,zz],[.042,.096,.052],.01,[.24,0,0],'rubber');
    headlight(p,x,.856,-1.554,.26,.094);headlight(p,car,.48,-.828,.21,.081);rearLamp(p,x,.815,1.50);
    withDriver(p,fit,true,false);
  }});

export const concepts=[mono,sail,sled,bamboo,mud,roller,saucer,split,mag,ghost,cushion,sidecar];
