// Board 01, Track & Tarmac. Track metres; the bonnet and driver face -Z.
const dark='#24272c', black='#16171b', rubber='#282b30', chrome='#adb6bc', glassColor='#add8f5',
  headWhite='#fff6ce', brakeRed='#fb421e', carbon='#34383f', offwhite='#f3eadb';
const catalog=[
  {id:'track-formula',name:'Pepper Seed',role:'Open-wheel formula racer',color:'#e92921',trim:'#f3efde',
    wheels:[[-1.22,.435,1.05,.35],[1.08,.49,1.07,.46]],driver:{x:0,y:.51,z:.035,scale:.64},extent:[1.44,-2.08,1.89,1.69],tail:1.83},
  {id:'track-rally',name:'Golden Switchback',role:'Classic rally coupe',color:'#fac222',trim:'#29282b',
    wheels:[[-1.14,.41,1.00,.33],[1.14,.41,1.00,.33]],driver:{x:0,y:.61,z:.025,scale:.61},extent:[1.31,-1.96,1.92,1.92],tail:1.89},
  {id:'track-prototype',name:'Glass Dart',role:'Bubble-canopy endurance prototype',color:'#68bcf2',trim:'#eff4f4',
    wheels:[[-1.17,.365,1.075,.3],[1.13,.415,1.075,.35]],driver:{x:0,y:.415,z:.02,scale:.61},extent:[1.39,-2.12,2.11,1.81],tail:1.97},
  {id:'track-hot-rod',name:'Whitewall Wasp',role:'Exposed-engine vintage special',color:'#e9d5a3',trim:'#232328',
    wheels:[[-1.13,.43,.92,.24],[1.17,.50,.97,.32]],driver:{x:0,y:.48,z:.11,scale:.65},extent:[1.28,-1.87,1.99,1.65],tail:1.94},
  {id:'track-drift',name:'Violet Drift',role:'Widebody drift pickup',color:'#933fd1',trim:'#e7af59',
    wheels:[[-1.17,.375,1.04,.36],[1.15,.39,1.04,.37]],driver:{x:0,y:.565,z:-.12,scale:.615},extent:[1.38,-2.16,2.17,2.04],tail:2.08},
  {id:'track-electric',name:'Twin-Plug',role:'Open battery-pod time-attack racer',color:'#8bd5a3',trim:'#f2ede0',
    wheels:[[-1.21,.385,1.06,.35],[1.16,.42,1.06,.37]],driver:{x:0,y:.42,z:.035,scale:.64},extent:[1.39,-2.22,2.08,1.68],tail:1.99}
];

const specs=Object.fromEntries(catalog.map(c=>[c.id,c]));
function trackPainter(h){
  const T=h.T;
  function geometry(g,col,mode='paint',position=[0,0,0],rotation=[0,0,0]){
    if(rotation?.isQuaternion){g.applyQuaternion(rotation);rotation=[0,0,0];}
    h.mesh(col,g,position??[0,0,0],rotation??[0,0,0],mode==='glass'?'glass':mode==='lights'?'glow':mode==='metal'?'metal':mode==='paint'?'coat':mode==='rubber'?'rubber':'solid');
  }
  const quad=(points,col,mode='paint')=>skin(points,[[0,1,2],[0,2,3]],col,mode);
  function skin(points,faces,col,mode='paint',smooth=false){
    const g=new T.BufferGeometry();
    if(smooth){
      g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
      g.setIndex(faces.flat());
    }else g.setAttribute('position',new T.Float32BufferAttribute(faces.flatMap(face=>face.flatMap(i=>points[i])),3));
    g.computeVertexNormals();geometry(g,col,mode);
  }
  function block(col,p,d,round=.025,mode='paint',rot=null){
    // Six planar fields with curved bevels, avoiding the old triangular chamfer reflections.
    if(round>=.010 && Math.min(...d)>=.027 && Math.max(...d)>=.13){
      const [w,hh,l]=d,b=Math.min(round,w*.25,hh*.46,l*.27);
      const G=h.RoundedBoxGeometry;
      if(G){geometry(new G(...d,2,b),col,mode,p,rot);return;}
      // h.mesh stays palette-specific; use a rounded 2D outline and a shallow 3D round-over.
      const step=(x,y,sx,sy)=>[x*sx,y*sy];
      const smoothOutline=(halfX,halfY,r,z)=>{
        const arr=[];
        for(const [i,sx,sy] of [[0,1,1],[1,-1,1],[2,-1,-1],[3,1,-1]]){
          const cen=step(halfX-r,halfY-r,sx,sy);
          for(let j=0;j<=3;j++){
            const a=(3*i+j)*Math.PI/6;
            arr.push([cen[0]+r*Math.cos(a),cen[1]+r*Math.sin(a),z]);
          }
        }
        return arr;
      };
      const k=b*.385, profiles=[
        smoothOutline(w/2-k,hh/2-k,Math.max(.0001,b-k),-l/2),
        smoothOutline(w/2-k*.28,hh/2-k*.28,b-k*.28,-l/2+k*.28),
        smoothOutline(w/2,hh/2,b,-l/2+k),
        smoothOutline(w/2,hh/2,b,l/2-k),
        smoothOutline(w/2-k*.28,hh/2-k*.28,b-k*.28,l/2-k*.28),
        smoothOutline(w/2-k,hh/2-k,Math.max(.0001,b-k),l/2),
      ];
      const points=profiles.flat(),faces=[],n=profiles[0].length,end=points.length-n;
      for(let j=1;j<profiles.length;j++)for(let i=0;i<n;i++){
        const a=(j-1)*n+i,c=j*n+i,prev=(j-1)*n+(i+1)%n,next=j*n+(i+1)%n;
        faces.push([a,prev,c],[c,prev,next]);
      }
      const side=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
      side.setIndex(faces.flat());side.computeVertexNormals();
      geometry(side,col,mode,p,rot);
      const capFaces=[];for(let i=1;i<n-1;i++)capFaces.push([0,i+1,i],[end,end+i,end+i+1]);
      const cap=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(capFaces.flatMap(f=>f.flatMap(i=>points[i])),3));
      cap.computeVertexNormals();geometry(cap,col,mode,p,rot);
      return;
    }
    geometry(new T.BoxGeometry(...d),col,mode,p,rot);
  }
  function rod(col,a,b,r,mode='metal',r2=r,n=12,dest='body'){
    const s=new T.Vector3(...a),axis=new T.Vector3(...b).sub(s);
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),axis.clone().normalize());
    geometry(new T.CylinderGeometry(r2,r,axis.length(),n),col,mode,s.addScaledVector(axis,.5).toArray(),q,dest);
  }
  function bulb(col,p,d,mode='paint'){geometry(new T.SphereGeometry(1,20,12).scale(...d),col,mode,p);}
  function path(col,points,r,mode='metal',segments){
    const c=new T.CatmullRomCurve3(points.map(a=>new T.Vector3(...a)));
    geometry(new T.TubeGeometry(c,segments??Math.min(r<.026?18:32,points.length*(r<.026?3:4)),r,r<.026?6:7,false),col,mode);
  }
  function densify(rows){
    // C1 smooth along a body station; clamp to each envelope to protect wheel and driver clearances.
    const res=[];
    const comp=(row,i)=>row[i]??(i===5?.78:0);
    for(let j=0;j<rows.length-1;j++){
      const pre=rows[j-1]??rows[j],a=rows[j],b=rows[j+1],post=rows[j+2]??b;
      const dx=b[0]-a[0];
      const steps=dx<.16?1:dx<.39?2:3;
      for(let i=0;i<steps;i++){
        const t=i/steps,t2=t*t,t3=t2*t,newRow=[a[0]+dx*t];
        for(let e=1;e<=5;e++){
          const v=comp(a,e),u=comp(b,e);
          const d0=(comp(b,e)-comp(pre,e))/(b[0]-pre[0]||1);
          const d1=(comp(post,e)-comp(a,e))/(post[0]-a[0]||1);
          const x=(2*t3-3*t2+1)*v+(t3-2*t2+t)*dx*d0+(-2*t3+3*t2)*u+(t3-t2)*dx*d1;
          newRow.push(Math.max(Math.min(x,Math.max(v,u)),Math.min(v,u)));
        }
        res.push(newRow);
      }
    }
    res.push(rows.at(-1));return res;
  }
  function loft(col,stations,mode='paint'){
    const rows=densify(stations);
    const cross=([z,w,b,t,c=0,shape=.78])=>{
      const hi=t-b,n=w*shape,u=w-n;
      // Soft low shoulder, then an almost-flat crown allows clean inlaid livery.
      return [[c-w*.81,b,z],[c+w*.81,b,z],[c+w*.95,b+hi*.095,z],[c+w,b+hi*.22,z],
        [c+w,t-hi*.195,z],[c+n+u*.73,t-hi*.086,z],[c+n+u*.34,t-hi*.015,z],[c+n,t,z],
        [c-n,t,z],[c-n-u*.34,t-hi*.015,z],[c-n-u*.73,t-hi*.086,z],[c-w,t-hi*.195,z],
        [c-w,b+hi*.22,z],[c-w*.95,b+hi*.095,z]];
    };
    const n=14,pts=rows.flatMap(cross),faces=[];
    for(let j=1;j<rows.length;j++)for(let i=0;i<n;i++){
      const a=(j-1)*n+i,b=j*n+i,k=(i+1)%n;faces.push([a,(j-1)*n+k,b],[b,(j-1)*n+k,j*n+k]);
    }
    skin(pts,faces,col,mode,true);
    const cap=[];for(let i=1;i<n-1;i++){const e=pts.length-n;cap.push([0,i+1,i],[e,e+i,e+i+1]);}
    skin(pts,cap,col,mode);
  }
  function stripes(stations,left,right,col,offset=.005){
    const rows=densify(stations),pts=rows.flatMap(a=>[
      [left(a),a[3]+offset,a[0]],[right(a),a[3]+offset,a[0]]
    ]),fs=[];
    for(let j=1;j<rows.length;j++){const a=j*2-2,b=a+2;fs.push([a,b,b+1],[a,b+1,a+1]);}
    skin(pts,fs,col,'paint',true);
  }
  function arch(x,z,r,base,w,col,lip=.04){
    const pts=[],faces=[],n=18,diff=x>0?1:-1;
    for(let i=0;i<=n;i++){
      const t=i*Math.PI/n;
      for(const [dx,dr] of [[0,0],[0,lip],[-w*diff,lip*.65],[-w*diff,0]])
        pts.push([x+dx,base+Math.sin(t)*(r+dr),z+Math.cos(t)*(r+dr)]);
    }
    for(let i=1;i<=n;i++)for(let j=0;j<3;j++){const a=(i-1)*4+j,b=i*4+j;if(diff>0)faces.push([a,b,a+1],[a+1,b,b+1]);else faces.push([a,a+1,b],[a+1,b+1,b]);}
    skin(pts,faces,col,'paint',true);
  }
  function headlamp(x,y,z,w,h,style='bar'){
    if(style==='round'){
      rod('#4c4643',[x,y,z+.092],[x,y,z+.005],w*.515,'rubber',w*.515,28);
      rod(chrome,[x,y,z+.075],[x,y,z-.007],w*.504,'metal',w*.494,24);
      rod('#bdac7f',[x,y,z-.005],[x,y,z-.016],w*.461,'metal',w*.438,24);
      rod(headWhite,[x,y,z-.016],[x,y,z-.026],w*.428,'matte',w*.412,24);
      for(let i=-3;i<=3;i++)block('#e5d5a6',[x+i*w*.088,y,z-.031],[.0045,w*.694*Math.sqrt(1-(i*.21)**2),.009],.001);
      rod('#ffebae',[x,y,z-.031],[x,y,z-.034],w*.188,'lights',w*.179,20);
    }else{
      block('#252831',[x,y,z+.014],[w+.064,h+.045,.072],.022,'rubber');
      block(chrome,[x,y,z-.018],[w+.025,h+.018,.027],.017,'metal');
      block('#fff2cb',[x,y,z-.033],[w,h,.016],.015,'matte');
      block(headWhite,[x,y,z-.042],[w*.93,h*.63,.009],.008,'lights');
      for(const off of [-.25,0,.25])block('#f2e0b0',[x+off*w,y,z-.048],[.007,h*.83,.006],.002,'matte');
    }
  }
  function fastener(x,y,z,r=.015,axis='y'){
    const v=[x,y,z],q=v.slice(),along=axis==='x'?0:axis==='y'?1:2;
    q[along]+=r*.42*(axis==='x'&&x<0?-1:1);
    rod('#47434a',v,q,r*1.25,'metal',r*1.10,12);
    const cap=q.slice();cap[along]+=r*.35*(axis==='x'&&x<0?-1:1);
    rod(chrome,q,cap,r*.78,'metal',r*.66,6);
  }
  function grilleX(s,x,y,z,w,h,slats=6){
    block('#10151b',[s*x,y,z],[.035,h,w],.013,'rubber');
    for(let i=0;i<slats;i++)block('#525961',[s*(x+.021),y-h*.33+i*h*.66/Math.max(1,slats-1),z],[.010,.009,w*.91],.002,'metal');
  }
  function seat(d,style='black'){
    const comfort=style==='brown'?'#5b3525':'#282a2d',insert=style==='brown'?'#71452b':'#3d4146';
    block(dark,[d.x,d.y-.145,d.z+.02],[.93*d.scale,.19,.94*d.scale],.08,'matte');
    block(comfort,[d.x,d.y-.09,d.z-.03],[1.20*d.scale,.16,.78*d.scale],.07,'matte');
    block(comfort,[d.x,d.y+.35,d.z+.45*d.scale],[1.22*d.scale,.83,.14],.068,'matte',[.14,0,0]);
    block(insert,[d.x,d.y+.30,d.z+.36*d.scale],[.86*d.scale,.63,.07],.027,'matte',[.14,0,0]);
    for(const s of [-1,1]){
      block(comfort,[d.x+s*.54*d.scale,d.y+.01,d.z-.035],[.12,.17,.71*d.scale],.038,'matte');
      rod('#bd975d',[d.x+s*.41*d.scale,d.y+.12,d.z+.31*d.scale],[d.x+s*.40*d.scale,d.y+.66,d.z+.49*d.scale],.009,'matte');
    }
  }
  function foil(col,sections,mode='paint'){
    // Real full-depth wing: transverse span sections carry a rounded leading edge,
    // thicker leading third, low pressure underside and a taper to the trailing edge.
    const rows=sections.map(([x,y,z,chord,thickness])=>[
      [x,y+thickness*.07,z-.5*chord],[x,y+thickness*.40,z-.38*chord],
      [x,y+thickness*.51,z-.18*chord],[x,y+thickness*.40,z+.12*chord],
      [x,y+thickness*.22,z+.38*chord],[x,y+thickness*.06,z+.50*chord],
      [x,y-thickness*.06,z+.50*chord],[x,y-thickness*.229,z+.10*chord],
      [x,y-thickness*.38,z-.27*chord],[x,y-thickness*.20,z-.46*chord],
    ]);
    const n=rows[0].length,faces=[],caps=[],end=(rows.length-1)*n;
    for(let row=1;row<rows.length;row++)for(let i=0;i<n;i++){
      const a=(row-1)*n+i,b=a+n,k=(i+1)%n;
      faces.push([a,(row-1)*n+k,b],[b,(row-1)*n+k,row*n+k]);
    }
    // Span caps are not smoothed into the scoop surfaces.
    for(let i=1;i<n-1;i++)caps.push([0,i+1,i],[end,end+i,end+i+1]);
    skin(rows.flat(),faces,col,mode,true);
    skin(rows.flat(),caps,col,mode);
  }
  function plateX(col,x,profile,thickness=.055,mode='paint'){
    const n=profile.length,v=[...profile.map(([y,z])=>[x-thickness*.5,y,z]),...profile.map(([y,z])=>[x+thickness*.5,y,z])],f=[];
    const signed=profile.reduce((acc,[y,z],i)=>{const [Y,Z]=profile[(i+1)%n];return acc+y*Z-Y*z;},0);
    for(let i=1;i<n-1;i++)f.push([0,i+1,i],[n,n+i,n+i+1]);
    for(let i=0;i<n;i++){const j=(i+1)%n;f.push([i,j,i+n],[j,j+n,i+n]);}
    skin(v,signed>0?f:f.map(a=>a.slice().reverse()),col,mode);
  }
  function wing(y,z,width,col,tip=col,mount=[.30,.47,-.10]){
    const w=width/2;
    const span=[-w,-w*.68,-w*.30,0,w*.30,w*.68,w];
    foil(col,span.map(x=>[x,y+(Math.abs(x)/w)**1.6*.019,z+.033*Math.abs(x)/w,.43+.035*(1-Math.abs(x)/w),.102]));
    foil(col,span.map(x=>[x,y-.055,z+.139+.033*Math.abs(x)/w,.279-.027*Math.abs(x)/w,.060]));
    foil(col,span.map(x=>[x,y-.091,z+.183+.027*Math.abs(x)/w,.129,.031]),'matte');
    for(const s of [-1,1]){
      const xx=s*(w+.023);
      const upright= [[y-.13,z-.20],[y+.10,z-.22],[y+.143,z-.15],[y+.156,z+.245],[y+.137,z+.31],[y-.13,z+.31],[y-.153,z+.232]];
      plateX(tip,xx,upright,.056);
      path(tip,upright.slice(1,5).map(([u,v])=>[xx+s*.031,u,v]),.010,'paint');
      rod(dark,[s*mount[0],mount[1],z+mount[2]],[s*width*.265,y-.046,z-.06],.062,'matte');
      rod(dark,[s*(mount[0]+.04),mount[1]-.018,z+mount[2]+.12],[s*width*.276,y-.074,z+.16],.033,'matte');
      for(const d of [-1,1])fastener(xx+s*.039,y+.029,z+d*.121,.014,'x');
    }
  }
  function tails(y,z,w,square=true){
    for(const s of [-1,1]){
      const x=s*w;
      if(square){
        block(black,[x,y,z],[.29,.14,.060],.025,'matte');
        block(brakeRed,[x,y+.017,z+.034],[.237,.064,.014],.008,'lights');
        block('#ffd158',[x,y-.036,z+.032],[.17,.026,.013],.004,'lights');
      }else{
        rod(dark,[x,y,z-.032],[x,y,z+.016],.105,'metal');
        rod(brakeRed,[x,y,z+.014],[x,y,z+.028],.082,'lights',.076,16);
      }
    }
  }
  function slot(col,p,d){block(col,p,d,.015,'matte');}
  return {geometry,block,rod,path,bulb,skin,quad,loft,stripes,arch,headlamp,seat,wing,tails,slot,fastener,grilleX,foil,plateX};
}

function formula(k,c){
  const {loft,block,rod,path,stripes,seat,wing,tails,fastener,grilleX,foil,plateX}=k,col=c.color,iv=c.trim;
  loft(dark,[[-1.95,.34,.16,.24],[-1.04,.57,.18,.35],[.68,.77,.19,.36],[1.60,.52,.19,.32]],'matte');
  const nose=[[-2.026,.315,.193,.297],[-1.914,.325,.205,.330],[-1.675,.350,.220,.398],
    [-1.398,.376,.242,.482],[-1.127,.418,.254,.603],[-.810,.495,.294,.757],[-.465,.545,.365,.814]];
  loft(col,nose);stripes(nose,r=>-Math.min(.178,r[1]*.58),r=>Math.min(.178,r[1]*.58),iv);
  loft(col,[[.50,.55,.24,.71],[.77,.58,.27,.76],[1.14,.46,.29,.70],[1.54,.41,.25,.54],[1.78,.36,.22,.45]]);
  loft(col,[[.415,.253,.63,.945],[.55,.277,.68,1.296],[.67,.238,.64,1.35],[.824,.188,.64,1.27],[1.12,.122,.62,.95],[1.65,.075,.52,.58]]);
  block('#222833',[0,1.159,.519],[.273,.183,.028],.025,'rubber');
  block(chrome,[0,1.264,.529],[.192,.029,.031],.012,'metal');
  const p=c.driver;
  seat(p);
  for(const s of [-1,1]){
    const rows=[[-.88,.136,.243,.535,s*.61],[-.64,.223,.251,.653,s*.63],[-.37,.255,.243,.754,s*.68],
      [-.067,.257,.220,.773,s*.691],[.345,.241,.212,.671,s*.713],[.622,.204,.237,.612,s*.686],[.943,.150,.273,.505,s*.615]];
    loft('#9f231b',rows.map(([z,hw,b,t,x])=>[z,hw*.99,b-.055,b+.046,x]),'paint');
    loft(col,rows);
    grilleX(s,.937,.474,.109,.46,.160);
    path('#9c1e17',[[s*.802,.29,-.54],[s*.867,.32,-.20],[s*.893,.32,.34],[s*.834,.31,.69]],.011,'paint');
    for(const [x,y] of [[.328,.244],[.988,.262]])fastener(s*x,y,-1.885,.014);
    path(col,[[s*.49,.69,-.59],[s*.54,.84,-.23],[s*.53,.85,.22],[s*.51,.77,.55],[s*.32,.76,.67]],.051,'paint');
    for(const z of [-1.22,1.08]){
      const r=z<0?.435:.49;
      for(const off of [-.26,.26]){
        rod(carbon,[s*.30,r+.06,z+off],[s*1.025,r,z],.043,'matte');
        rod(carbon,[s*.40,r-.09,z+off*.78],[s*1.025,r-.075,z],.037,'matte');
      }
      rod(chrome,[s*.38,r+.115,z+.10],[s*.95,r+.01,z],.029);
    }
    const span=[.265,.43,.67,.99,1.236].map(x=>s*x).sort((a,b)=>a-b);
    foil(col,span.map(x=>[x,.195+Math.abs(x)*.026,-1.835-Math.abs(x)*.045,.402-.021*Math.abs(x),.09]));
    foil(col,span.map(x=>[x,.276+Math.abs(x)*.037,-1.743-Math.abs(x)*.039,.290-.008*Math.abs(x),.065]));
    foil('#b02021',span.map(x=>[x,.342+Math.abs(x)*.043,-1.692-Math.abs(x)*.031,.184,.052]));
    plateX(iv,s*1.25,[[.137,-2.042],[.126,-1.607],[.263,-1.592],[.342,-1.63],[.413,-1.726],[.462,-1.874],[.414,-1.98],[.267,-2.066]],.062);
    rod(dark,[s*.20,.24,-1.52],[s*.48,.18,-1.82],.05,'matte');
    rod(chrome,[s*.24,.45,1.60],[s*.24,.445,1.778],.084,'metal',.076,24);
  }
  wing(1.515,1.50,2.27,col,iv,[.30,.47,-.13]);
  // Central two-chip rain light stays clear of the twin chrome outlet apertures.
  block(carbon,[0,.511,1.744],[.23,.093,.082],.022,'rubber');
  for(const x of [-.044,.044])block(brakeRed,[x,.514,1.787],[.059,.041,.012],.006,'lights');
}

function coupeCage(k,c,{front,rear,topFront,topRear,belt,roof,half,trim,topStripe=0,sideBack=false}){
  const {rod,quad,loft,path,stripes,block,fastener}=k;
  const bx=half,tx=half*(sideBack?.875:.856),rearX=half*(sideBack?.96:.80),tl=roof-.065,w=c.color;
  const roofRows=[[topFront-.073,tx*.82,tl-.010,roof-.047,0,.53],[topFront-.014,tx*.96,tl-.013,roof-.014,0,.59],
    [topFront+.097,tx*1.020,tl-.030,roof,0,.71],[topRear-.097,tx*1.02,tl-.026,roof,0,.70],
    [topRear+.014,tx*.974,tl-.011,roof-.014,0,.59],[topRear+.065,tx*.84,tl-.010,roof-.046,0,.53]];
  loft(w,roofRows);
  if(topStripe)for(const s of [-1,1])stripes(roofRows,()=>s*.108-topStripe/2,()=>s*.108+topStripe/2,c.trim);
  rod(trim,[-tx+.05,tl+.024,topFront-.025],[tx-.05,tl+.024,topFront-.025],.027,'rubber');
  rod(trim,[-tx+.05,tl+.024,topRear+.009],[tx-.05,tl+.024,topRear+.009],.029,'rubber');
  for(const s of [-1,1]){
    const lower=[s*bx,belt,front],upper=[s*tx,tl,topFront],backLower=[s*rearX,belt,rear],backUpper=[s*tx,tl,topRear];
    const middle=.27,midTop=.28;
    for(const [a,b,r] of [[lower,upper,.081],[backLower,backUpper,.097],[upper,backUpper,.077],
      [[s*bx,belt+.008,middle],[s*tx,tl,midTop],.044]])rod(w,a,b,r,'paint',r*.94,9);
    path(trim,[lower,[s*(bx-.017),belt+.19,front+(topFront-front)*.25],upper],.021,'rubber');
    rod('#4b4c55',[s*(bx-.03),belt+.024,middle-.024],[s*(tx-.012),tl-.014,midTop-.02],.017,'metal');
    rod(trim,lower,backLower,.025,'matte');
    rod(trim,upper,backUpper,.023,'matte');
    rod(chrome,[s*(bx+.01),belt+.024,front+.01],[s*(rearX+.009),belt+.024,rear],.011);
    if(sideBack){
      const pane=[[s*(bx-.027),belt+.040,middle+.040],[s*(rearX-.035),belt+.040,rear-.058],
        [s*(tx-.020),tl-.041,topRear-.033],[s*(tx-.018),tl-.044,midTop+.022]];
      quad(s>0?pane.slice().reverse():pane,'#99c6d4','glass');
      path(trim,[pane[0],pane[1],pane[2]],.019,'rubber');
      // A painted C-pillar cheek fills the wide coupling down to the rear shoulders.
      quad([[s*(rearX-.009),belt-.095,rear+.18],[s*(rearX-.02),belt-.003,rear-.069],
        [s*(tx+.014),tl-.028,topRear],[s*(tx-.009),tl-.04,topRear+.09]],w);
    }else{
      const to=[s*(tx-.02),tl-.048,topRear-.069],at=[s*(rearX-.020),belt+.033,rear-.026];
      rod(trim,to,at,.035,'rubber');
      rod(w,[s*(tx-.016),tl-.039,topRear+.041],[s*(rearX-.014),belt+.02,rear+.036],.038,'paint');
    }
  }
  quad([[-bx+.023,belt+.015,front-.012],[-tx+.02,tl-.023,topFront-.012],[tx-.02,tl-.023,topFront-.012],[bx-.023,belt+.015,front-.012]],glassColor,'glass');
  quad([[rearX-.02,belt+.018,rear+.005],[tx-.02,tl-.026,topRear+.005],[-tx+.02,tl-.026,topRear+.005],[-rearX+.02,belt+.018,rear+.005]],glassColor,'glass');
  rod(trim,[-bx,belt,front],[bx,belt,front],.024,'matte');
  for(const s of [-1,1]){
    rod(carbon,[s*.16,belt+.040,front-.018],[s*.46,belt+.195,front+(topFront-front)*.23-.020],.013,'matte');
    block(black,[s*(bx-.11),belt-.08,front+.07],[.045,.10,.44],.02,'matte');
  }
  block(trim,[0,belt-.067,front+.04],[2*bx-.08,.12,.20],.045,'matte');
}

function rally(k,c){
  const {loft,block,rod,stripes,arch,headlamp,seat,tails,slot,path,fastener}=k,col=c.color;
  const bonnet=[[-1.832,.836,.419,.787,0,.82],[-1.754,.932,.408,.919,0,.87],[-1.575,.974,.413,.981,0,.82],
    [-1.259,.966,.457,1.011,0,.83],[-1.057,.950,.475,1.035,0,.86],[-.64,.864,.489,1.075,0,.92]];
  loft(col,bonnet);
  for(const z of [-.105,.105])stripes(bonnet,()=>z-.071,()=>z+.071,c.trim);
  loft('#e8a932',[[-.64,.85,.29,.55],[.52,.84,.31,.57],[.92,.89,.34,.55],[1.75,.83,.38,.59]]);
  loft(col,[[.66,.882,.43,.972],[.96,.939,.422,1.058],[1.24,.953,.449,1.059],
    [1.54,.946,.466,1.017],[1.715,.923,.434,.952],[1.822,.828,.46,.897]]);
  loft('#cb8c17',[[.711,.829,.355,.463],[1.103,.894,.342,.481],[1.701,.905,.358,.489],[1.842,.802,.394,.461]]);
  for(const s of [-1,1]){
    loft(col,[[-.842,.094,.36,1.03,s*.842],[-.634,.172,.40,1.08,s*.784],[-.358,.164,.39,1.081,s*.797],
      [.172,.171,.383,1.069,s*.790],[.527,.169,.399,1.062,s*.780],[.777,.185,.411,1.052,s*.782],[1.084,.162,.420,1.051,s*.819]]);
    path('#f3d276',[[s*.889,1.00,-.909],[s*.919,1.04,-.643],[s*.942,1.032,-.343],[s*.936,1.016,.125],[s*.928,1.009,.552],[s*.940,.996,.89],[s*.930,.967,1.405]],.014,'metal');
    for(const z of [-1.13,1.13]){
      arch(s*1.159,z,.428,.418,.270,col,.117);
      arch(s*1.164,z,.433,.419,.042,'#c2840a',.014);
      arch(s*1.165,z,.453,.418,.018,'#e8a421',.029);
    }
    path('#bd7910',[[s*.957,.57,-.57],[s*.969,.56,-.41],[s*.968,.54,.16],[s*.967,.535,.48]],.010,'paint');
    fastener(s*.65,.986,-1.48,.026);
    block('#252a2e',[s*.74,.528,-1.877],[.22,.078,.015],.012,'rubber');
    slot('#4d4230',[s*.956,.696,.10],[.021,.018,.99]);
    rod('#a9691d',[s*.934,.41,.32],[s*.935,.98,.36],.010,'matte');
    block(chrome,[s*.952,1.00,.26],[.030,.038,.175],.012,'metal');
    path(chrome,[[s*.73,1.038,-1.255],[s*.74,1.166,-1.244],[s*.80,1.199,-1.244]],.023);
    block(chrome,[s*.828,1.204,-1.244],[.21,.117,.10],.035,'metal');
    block(glassColor,[s*.828,1.204,-1.185],[.167,.075,.010],.007,'metal');
    headlamp(s*.667,.745,-1.878,.306,.255,'round');
  }
  block(dark,[0,.718,-1.78],[1.53,.32,.145],.061,'matte');
  block(chrome,[0,.532,-1.815],[1.87,.11,.125],.028,'metal');
  for(let i=0;i<5;i++)block(i===1?'#a4aaad':'#51555b',[0,.64+i*.042,-1.864],[.98,.017,.013],.003,'metal');
  for(const x of [-.495,-.165,.165,.495])headlamp(x,.59,-1.90,.247,.22,'round');
  block(col,[0,1.082,1.69],[1.50,.13,.21],.045,'paint',[.12,0,0]);
  block(chrome,[0,.493,1.819],[1.78,.091,.105],.03,'metal');
  // Period underbody muffler and a short drop section mate into the positive-Z tip socket.
  block('#41464a',[.473,.395,1.446],[.262,.144,.42],.040,'metal');
  path(chrome,[[.475,.397,1.46],[.516,.379,1.545],[.539,.349,1.654],[.54,.338,1.747],[.54,.338,1.813]],.064);
  rod('#34363c',[.54,.386,1.722],[.54,.454,1.722],.018,'rubber',.015,10);
  tails(.74,1.796,.65);
  seat(c.driver);
  coupeCage(k,c,{front:-.67,rear:.94,topFront:-.35,topRear:.57,belt:1.07,roof:1.88,half:.80,trim:black,topStripe:.135,sideBack:true});
}

function prototype(k,c,T){
  const {loft,block,rod,path,stripes,arch,headlamp,seat,wing,tails,slot,geometry,grilleX,fastener}=k,col=c.color,iv=c.trim;
  loft(carbon,[[-2.09,.91,.155,.205],[-1.93,1.22,.155,.229],[-1.60,1.275,.17,.25],[-.58,1.21,.17,.27],
    [1.48,1.23,.18,.28],[1.91,1.155,.185,.268],[2.05,.94,.18,.24]],'matte');
  const nose=[[-2.034,.409,.196,.287,0,.91],[-1.942,.480,.205,.332,0,.93],[-1.786,.510,.246,.444,0,.94],
    [-1.507,.552,.249,.555,0,.92],[-1.241,.578,.255,.623,0,.92],[-.994,.616,.275,.681,0,.95],[-.848,.625,.285,.734,0,.92]];
  loft(col,nose);stripes(nose,()=>-.19,()=>.19,iv);
  loft(col,[[.81,.537,.288,.76],[1.044,.59,.298,.866],[1.286,.669,.29,.906],[1.546,.691,.276,.847],
    [1.741,.669,.273,.739],[1.943,.62,.277,.614],[2.012,.551,.277,.535]]);
  block(dark,[0,.408,1.997],[.480,.046,.031],.008,'rubber');
  seat(c.driver);
  for(const s of [-1,1]){
    const front=[[-1.951,.222,.241,.405,s*.942,.72],[-1.833,.275,.25,.528,s*.937,.65],
      [-1.647,.320,.25,.669,s*.941,.64],[-1.457,.337,.286,.802,s*.928,.62],[-1.214,.322,.615,.877,s*.928,.61],
      [-.997,.318,.564,.871,s*.937,.62],[-.809,.308,.495,.827,s*.935,.64],[-.633,.280,.238,.69,s*.932,.64],[-.395,.230,.235,.522,s*.975,.68]];
    loft(col,front);stripes(front.slice(0,4),r=>r[4]-.110,r=>r[4]+.105,iv,.008);
    loft('#20333f',[[-1.877,.124,.346,.500,s*.938,.96],[-1.740,.123,.466,.608,s*.938,.98],
      [-1.611,.122,.527,.692,s*.937,.98]],'rubber');
    // Lens retainers hug the compound swept-forward face of the fender.
    for(const [z,y] of [[-1.897,.380],[-1.803,.492]]){
      const rot=[-.42,0,0];block(chrome,[s*.938,y,z],[.249,.114,.051],.020,'metal',rot);
      block('#fff6d6',[s*.938,y,z-.031],[.214,.083,.023],.014,'matte',rot);
      block(headWhite,[s*.938,y+.005,z-.040],[.205,.032,.010],.006,'lights',rot);
    }
    path('#a7cbdd',front.slice(3,7).map(([z,w,,y,x])=>[x+s*w*.61,y+.004,z]),.010);
    
    const rear=[[.361,.187,.271,.537,s*.995],[.587,.244,.279,.617,s*.959],[.802,.302,.351,.734,s*.948],
      [1.111,.334,.733,.940,s*.936,.61],[1.347,.349,.604,.938,s*.925,.61],[1.629,.342,.364,.877,s*.922,.62],
      [1.842,.289,.272,.753,s*.931,.64],[1.982,.242,.268,.663,s*.919,.68],[2.013,.220,.267,.599,s*.904]];
    loft(col,rear);
    loft('#2d4552',[[.662,.101,.386,.55,s*1.137],[.841,.108,.429,.689,s*1.143],[.992,.103,.445,.748,s*1.142]],'rubber');
    loft(col,[[-.81,.32,.29,.51,s*.75],[-.48,.32,.29,.69,s*.78],[.05,.27,.27,.76,s*.804],
      [.52,.27,.28,.71,s*.822],[.85,.28,.30,.71,s*.84]]);
    for(const [z,r] of c.wheels)arch(s*1.24,z,r+.045,r,.37,col,.058);
    
    slot(carbon,[s*.945,.732,-1.24],[.22,.033,.25]);
    for(let i=0;i<4;i++)block('#7b98a7',[s*.945,.753,-1.32+i*.053],[.198,.011,.009],.003,'metal');
    grilleX(s,1.095,.491,.27,.37,.186,5);
    for(const z of [-1.99,-1.56,.39,1.65])fastener(s*(z< -1.85?1.01:1.166),.239,z,.016);
    slot(black,[s*.925,.79,.983],[.20,.03,.22]);
    path(chrome,[[s*.51,.711,-.85],[s*.63,.762,-.60],[s*.66,.796,-.30],[s*.67,.809,.07],[s*.61,.803,.55],[s*.51,.767,.85]],.028);
  }
  const dome=new T.SphereGeometry(1,32,16,0,Math.PI*2,0,Math.PI/2);
  const p=dome.attributes.position;
  for(let i=0;i<p.count;i++){
    const sway=p.getY(i),sweep=sway*.096;
    p.setXYZ(i,p.getX(i)*(.668+.018*sway),sway*.98,p.getZ(i)*.878+sweep);
  }
  dome.computeVertexNormals();
  geometry(dome,'#92c8e7','glass',[0,.798,.016]);
  block('#343b42',[0,.674,-.728],[.82,.126,.167],.030,'rubber',[.20,0,0]);
  const rail=(theta)=>[.669*Math.cos(theta),.797,.016+.879*Math.sin(theta)];
  path('#222a37',Array.from({length:23},(_,j)=>{const [x,y,z]=rail(j*Math.PI/11);return [x*.987,y-.015,z*.987];}),.038,'rubber');
  path(chrome,Array.from({length:23},(_,j)=>rail(j*Math.PI/11)),.025);
  for(let j=0;j<16;j++){const a=j*Math.PI/8;const [x,y,z]=rail(a);fastener(x,y+.014,z,.013);}
  for(const s of [-1,1]){
    const seam=Array.from({length:15},(_,i)=>{
      const a=i*Math.PI/14,cross=Math.cos(a);
      return [s*.273,.798+.889*Math.sin(a),.016-.798*cross+.091*Math.sin(a)];
    });
    path('#b4c6d3',seam,.012);
  }
  wing(1.455,1.63,2.28,col,col,[.41,.53,-.16]);tails(.491,2.002,.79);
  for(const s of [-1,1])rod(chrome,[s*.38,.34,1.935],[s*.38,.34,1.997],.085,'metal',.084,24);
}

function hotRod(k,c){
  const {loft,block,rod,path,stripes,headlamp,seat,tails,quad,fastener}=k,iv=c.color,col=c.trim;
  loft(col,[[-1.77,.44,.226,.44],[-1.53,.445,.22,.48],[-.60,.56,.228,.48],[.72,.62,.22,.50],
    [1.38,.53,.23,.49],[1.84,.30,.24,.40]],'matte');
  const bonnet=[[-1.742,.365,.462,.975,0,.59],[-1.636,.416,.457,1.101,0,.58],
    [-1.445,.461,.452,1.174,0,.60],[-1.174,.493,.445,1.214,0,.53],[-.905,.510,.448,1.212,0,.55],
    [-.635,.519,.453,1.173,0,.62],[-.435,.527,.473,1.099,0,.61]];
  loft(iv,bonnet);
  for(const s of [-1,1])for(let j=0;j<7;j++)fastener(s*.348,.998+(j<4?.029*j:.102),-1.62+j*.18,.014);
  for(const z of [-1.28,-.87]){
    const n=.63,points=[[-.502,.73,z],[-.503,.93,z],[-.404,1.153,z],[-.25,1.169,z],[.25,1.169,z],[.404,1.153,z],[.503,.93,z],[.502,.73,z]];
    path('#7a4b30',points.map(([x,y,v])=>[x,y+.038,v]),.024,'matte');
    path('#bb8959',points.map(([x,y,v])=>[x*.994,y+.057,v+.016]),.006,'metal');
    block('#a66e44',[0,1.167,z],[.095,.019,.079],.008,'matte');
    block(chrome,[0,1.183,z+.012],[.060,.025,.050],.005,'metal');
  }
  const ring=[[0,1.142,-1.743],[-.167,1.120,-1.765],[-.289,1.045,-1.774],[-.365,.939,-1.793],
    [-.376,.782,-1.799],[-.374,.546,-1.806],[-.330,.344,-1.817],[-.232,.260,-1.797],[0,.231,-1.79],
    [.232,.260,-1.797],[.330,.344,-1.817],[.374,.546,-1.806],[.376,.782,-1.799],[.365,.939,-1.793],
    [.289,1.045,-1.774],[.167,1.120,-1.765],[0,1.142,-1.743]];
  path('#31291d',ring.map(([x,y,z])=>[x*1.069,y,z+.018]),.061,'rubber');
  path('#e1b66e',ring,.042);
  path('#f6d597',ring.map(([x,y,z])=>[x*.918,(y-.68)*.94+.68,z-.019]),.016);
  const center=[0,.665,-1.804],fac=[];
  for(let i=1;i<ring.length;i++)fac.push([0,i,i+1]);
  k.skin([center,...ring],fac,black,'matte');
  for(let i=-6;i<=6;i++){
    const x=i*.048,ratio=Math.abs(x)/.35;
    rod('#d0ac71',[x,.279+.134*ratio**3,-1.831],[x,1.09-.231*ratio**3,-1.824],.011);
  }
  seat(c.driver,'brown');
  for(const s of [-1,1]){
    const rails=[[-.535,.12,.29,.93,s*.554],[-.375,.154,.304,.993,s*.558],[-.105,.164,.32,1.013,s*.595],
      [.225,.149,.282,.988,s*.608],[.559,.155,.282,.912,s*.619],[.90,.170,.306,.832,s*.580],[1.40,.139,.318,.647,s*.514]];
    loft(col,rails);
    path('#bc9e68',rails.map(([z,w,,y,xc])=>[xc+s*w*.60,y+.009,z]),.013);
    path('#bc9e68',rails.map(([z,w,b,,xc])=>[xc+s*w+.006,b+.08,z]),.011);
    path(chrome,[[s*.44,.96,-.43],[s*.58,1.015,-.23],[s*.61,.984,.03],[s*.59,.94,.31],[s*.53,.865,.69]],.023);
    for(let i=0;i<5;i++){
      const z=-1.25+i*.147;
      path(chrome,[[s*.462,.836,z],[s*.586,.810,z+.023],[s*.685,.707,z+.078],[s*.766,.555,z+.194],
        [s*.814,.472,z+.320],[s*.824,.447,z+.480]],.055,'metal',17);
      path('#545054',[[s*.476,.837,z],[s*.534,.824,z+.008]],.065,'matte');
    }
    rod('#ac9380',[s*.824,.442,-.912],[s*.824,.442,.698],.084,'metal',.076,24);
    for(const z of [-.335,.156,.590])rod('#63594f',[s*.824,.442,z-.038],[s*.824,.442,z+.044],.091,'metal',.088,24);
    path(chrome,[[s*.824,.442,.48],[s*.727,.395,.69],[s*.552,.326,.935],[s*.366,.335,1.18],[s*.35,.335,1.54],[s*.35,.335,1.877]],.071);
    headlamp(s*.615,.515,-1.635,.288,.22,'round');
    for(const z of [-1.13,1.17]){
      const r=z<0?.43:.50;
      for(const a of [-1,1])rod(chrome,[s*.35,.29,z+a*.18],[s*.865,r,z],.039,'metal');
      rod('#624736',[s*.37,r+.07,z+.10],[s*.84,r+.012,z],.041,'metal');
    }
  }
  loft(col,[[.585,.437,.47,.931],[.789,.535,.423,1.078],[1.163,.570,.395,1.015],
    [1.429,.515,.362,.890],[1.711,.399,.339,.751],[1.857,.309,.328,.614]]);
  loft('#252426',[[.688,.27,.705,.956],[.882,.327,.720,1.130],[1.065,.316,.685,1.252],
    [1.291,.240,.641,1.429],[1.518,.127,.605,1.535],[1.738,.076,.582,1.587],[1.847,.058,.570,1.60]]);
  const fin=[[0,.94,.70],[0,1.295,1.05],[0,1.56,1.62],[0,1.58,1.88],[0,.67,1.79]];
  for(const s of [-1,1]){
    const p=fin.map(([x,y,z],i)=>[s*(i===0?.105:i===4?.097:.025),y,z]);
    k.skin(p,s<0?[[0,1,4],[1,2,4],[2,3,4]]:[[0,4,1],[1,4,2],[2,4,3]],col);
    path(iv,p.slice(0,4),.028,'paint');
  }
  block(chrome,[0,.32,1.87],[.77,.051,.089],.018,'metal');
  tails(.45,1.87,.265,false);
}

function drift(k,c){
  const {loft,block,rod,path,headlamp,seat,tails,arch,slot,fastener,grilleX,plateX}=k,col=c.color;
  const nose=[[-2.042,.932,.281,.734,0,.90],[-1.996,1.019,.269,.771,0,.91],[-1.875,1.035,.275,.817,0,.91],
    [-1.663,1.064,.284,.867,0,.91],[-1.262,1.027,.303,.921,0,.91],[-.92,.988,.325,.948,0,.92],[-.654,.921,.334,.976,0,.95]];
  loft(col,nose);
  loft('#7032b1',[[-2.147,1.008,.151,.257,0,.95],[-2.09,1.121,.157,.273,0,.94],[-1.93,1.169,.155,.286,0,.95],
    [-1.57,1.148,.172,.301,0,.94],[-1.28,1.064,.189,.348,0,.90]]);
  block('#2a2235',[0,.174,-2.087],[1.875,.043,.105],.010,'rubber');
  loft('#511b7d',[[-.67,1.055,.192,.33],[.20,1.065,.193,.32],[.69,1.052,.206,.36],[1.58,1.012,.23,.44],[1.98,.977,.27,.42]]);
  block(col,[0,.947,-1.075],[.65,.076,.51],.055,'paint',[.16,0,0]);
  slot(black,[0,.942,-1.372],[.52,.043,.056]);
  for(const x of [-.20,-.10,0,.10,.20])block('#4a435a',[x,.952,-1.392],[.052,.008,.024],.004,'metal');
  block(black,[0,.623,-2.010],[1.788,.296,.097],.046,'matte');
  block('#792cb1',[0,.454,-2.043],[2.104,.150,.135],.040);
  block('#9847c6',[0,.404,-2.097],[2.08,.049,.052],.012);
  block(col,[0,.223,-2.138],[1.926,.049,.042],.009);
  block(black,[0,.299,-2.082],[1.02,.173,.07],.019,'matte');
  for(let i=0;i<4;i++)block('#585563',[0,.263+i*.039,-2.12],[.97,.011,.012],.003,'matte');
  for(let i=0;i<5;i++)block('#545461',[0,.548+i*.037,-2.066],[.89,.011,.012],.002,'matte');
  for(const s of [-1,1]){
    headlamp(s*.697,.626,-2.056,.42,.182);
    block('#ff962a',[s*.705,.414,-2.123],[.217,.056,.022],.012,'lights');
    slot(black,[s*.835,.304,-2.104],[.314,.166,.04]);
    path('#b65fe4',[[s*1.071,.284,-.55],[s*1.103,.279,-.244],[s*1.108,.273,.137],[s*1.104,.283,.520]],.022,'paint');
    fastener(s*.625,.904,-1.554,.022);
    loft(col,[[-.71,.13,.30,.967,s*.857],[-.49,.16,.306,.995,s*.843],[.33,.17,.31,.965,s*.86],[.61,.16,.33,.941,s*.866]]);
    loft(col,[[.43,.149,.31,.951,s*.956,.82],[.670,.164,.337,1.012,s*.978,.84],
      [.91,.190,.739,1.042,s*.987,.79],[1.234,.204,.769,1.038,s*.995,.78],[1.527,.198,.636,.998,s*1.006,.78],
      [1.729,.186,.355,.967,s*.979,.79],[1.997,.129,.358,.924,s*.924,.80]]);
    path('#a75bd0',[[s*.966,.967,.508],[s*1.018,1.009,.692],[s*1.077,1.002,1.077],[s*1.065,.976,1.477],[s*1.032,.932,1.8],[s*.953,.923,1.99]],.016);
    plateX('#8e40c5',s*1.08,[[.197,-.592],[.225,.461],[.267,.655],[.317,.544],[.319,-.503],[.288,-.618]],.056);
    for(const [z,r] of c.wheels){
      arch(s*1.211,z,r+.045,r,.219,'#a64cdf',.088);
      arch(s*1.213,z,r+.041,r,.034,'#642988',.015);
      for(let i=0;i<7;i++){
        const angle=(i+.5)*Math.PI/7,rad=r+.089;
        rod(chrome,[s*1.216,r+rad*Math.sin(angle),z+rad*Math.cos(angle)],[s*1.223,r+rad*Math.sin(angle),z+rad*Math.cos(angle)],.011,'metal',.008,7);
      }
    }
    rod(chrome,[s*.805,1.033,-.479],[s*.963,1.091,-.480],.018);
    block('#32303d',[s*1.005,1.091,-.479],[.165,.093,.112],.028,'matte');
    path(chrome,[[s*.39,.65,1.49],[s*.49,.91,1.16],[s*.52,1.62,.96],[s*.48,1.98,.89],[s*.354,1.98,.83]],.045);
    path('#377cf5',[[s*.504,1.35,1.017],[s*.509,1.48,.990],[s*.514,1.57,.968]],.050,'paint');
    rod('#3e2d52',[s*1.027,.57,.303],[s*1.029,.956,.303],.010,'matte');
    block(black,[s*1.017,.92,.28],[.025,.045,.173],.012,'matte');
  }
  block(col,[0,.679,1.978],[1.987,.484,.108],.045);
  block(black,[0,.604,1.151],[1.66,.066,1.51],.027,'matte');
  for(let j=0;j<8;j++)block('#353440',[(j-3.5)*.201,.644,1.186],[.04,.018,1.28],.009,'matte');
  block(black,[0,1.627,.89],[.831,.602,.144],.052,'matte');
  block(chrome,[0,1.634,.97],[.758,.547,.065],.035,'metal');
  for(let i=0;i<10;i++){block(chrome,[0,1.402+i*.049,.798],[.650,.014,.019],.004,'metal');block('#373a43',[0,1.402+i*.049,1.005],[.650,.019,.019],.004,'matte');}
  block(col,[0,.384,2.048],[2.05,.146,.122],.045);
  tails(.76,2.037,.773);
  seat(c.driver);
  coupeCage(k,c,{front:-.68,rear:.58,topFront:-.42,topRear:.47,belt:1.002,roof:1.82,half:.834,trim:black});
}

function electric(k,c){
  const {loft,block,rod,path,stripes,arch,headlamp,seat,wing,tails,slot,fastener,grilleX,foil,plateX}=k,col=c.color,iv=c.trim;
  loft(carbon,[[-2.13,.73,.155,.213],[-2.04,1.208,.155,.223],[-1.61,1.26,.155,.238],
    [-.62,1.23,.172,.244],[.82,1.23,.179,.249],[1.72,1.155,.182,.235],[2.015,.912,.187,.23]],'matte');
  const nose=[[-2.168,.191,.199,.278,0,.94],[-2.055,.208,.214,.322,0,.95],[-1.806,.247,.226,.429,0,.96],
    [-1.455,.279,.239,.530,0,.96],[-1.126,.328,.254,.635,0,.92],[-.809,.397,.293,.748,0,.90],[-.494,.489,.319,.818,0,.90]];
  loft(col,nose);stripes(nose,r=>-r[1]*.61,r=>r[1]*.61,iv,.018);
  seat(c.driver);
  loft(col,[[.58,.51,.28,.73],[.90,.53,.26,.75],[1.27,.47,.25,.67],[1.89,.51,.25,.61]]);
  for(const s of [-1,1]){
    const left=[[-1.982,.267,.254,.423,s*.920,.839],[-1.862,.311,.257,.501,s*.908,.823],[-1.694,.348,.261,.619,s*.874,.72],
      [-1.479,.355,.324,.782,s*.858,.664],[-1.292,.371,.587,.858,s*.850,.652],[-1.046,.344,.443,.838,s*.885,.657],
      [-.821,.311,.269,.729,s*.866,.662],[-.517,.246,.265,.681,s*.812,.68]];
    loft(col,left);
    loft(col,[[-.64,.256,.34,.716,s*.662],[-.36,.175,.35,.756,s*.648],[.00,.176,.36,.755,s*.632],[.38,.175,.40,.739,s*.646],[.96,.218,.30,.664,s*.695]]);
    arch(s*1.201,-1.21,.438,.385,.32,col,.065);
    arch(s*1.22,1.16,.458,.42,.32,col,.059);
    plateX(col,s*1.219,[[.175,-2.114],[.181,-1.729],[.294,-1.547],[.435,-1.602],[.532,-1.815],[.476,-1.997],[.367,-2.079]],.062);
    const bar=[.36,.594,.844,1.215].map(x=>s*x).sort((a,b)=>a-b);
    foil('#2a303a',bar.map(x=>[x,.232+.026*Math.abs(x),-1.885+Math.abs(x)*.061,.361,.047]),'matte');
    rod(carbon,[s*.407,.218,-1.88],[s*.919,.224,-1.61],.023,'matte');
    headlamp(s*.911,.444,-1.979,.367,.097);
    slot(black,[s*.905,.305,-1.997],[.426,.116,.038]);
    for(const x of [.789,.899,1.011])rod('#687a80',[s*x,.253,-2.016],[s*x,.352,-2.018],.012,'metal');slot(black,[s*.889,.70,-1.438],[.33,.035,.17]);
    for(let z of [-1.49,-1.45,-1.41])block('#597269',[s*.887,.723,z],[.293,.010,.011],.004,'metal');
    grilleX(s,1.046,.452,.00,.28,.117,5);
    for(const x of [.58,.854,1.09])fastener(s*x,.24,-1.955,.013);
    path('#ed6b22',[[s*.638,.50,-.35],[s*.757,.52,-.28],[s*.830,.55,-.18],[s*.825,.627,.012],[s*.793,.668,.198],[s*.842,.704,.38],[s*.955,.752,.54],[s*.994,.81,.788]],.046);
  }
  loft('#333b40',[[.002,.244,.471,.859,-.884,.82],[.104,.303,.453,1.094,-.894,.71],
    [.299,.313,.449,1.131,-.903,.68],[.613,.299,.423,1.141,-.891,.71],[.836,.267,.411,1.032,-.876,.69],
    [.967,.207,.405,.821,-.849,.64]],'metal');
  block('#466162',[-.892,.909,.563],[.454,.272,.621],.061,'metal',[.03,0,0]);
  block('#535c62',[-.878,.777,.077],[.48,.426,.104],.041,'metal');
  for(const x of [-1.072,-.688])for(const y of [.62,.936])fastener(x,y,.028,.014,'z');
  for(const x of [-.99,-.767]){
    block('#e97825',[x,.776,.020],[.105,.258,.032],.015,'paint');
    block('#ffa132',[x,.777,-.002],[.038,.202,.019],.008,'lights');
  }
  for(let i=0;i<3;i++)block('#252e31',[-.872,1.125,.345+i*.139],[.364,.023,.071],.008,'matte');
  path('#eb7b27',[[-.864,1.091,.119],[-.884,1.179,.176],[-.889,1.190,.274],[-.882,1.151,.322]],.047,'paint');
  const pc=[.905,.722,.234],ec=[.905,.729,1.353];
  rod('#3e454b',pc,ec,.319,'metal',.295,28);
  rod('#576074',[.905,.726,.414],[.905,.727,.557],.326,'metal',.324,28);
  rod('#586369',[.905,.727,.773],[.905,.728,.923],.319,'metal',.310,26);
  rod('#f4bb38',[.905,.725,.287],[.905,.726,.353],.328,'lights',.331,28);
  rod('#8d744e',[.905,.725,.276],[.905,.725,.284],.333,'metal',.328,28);
  rod('#7d898e',[.905,.724,.165],[.905,.725,.296],.258,'metal',.324,28);
  rod('#293234',[.905,.724,.156],[.905,.724,.170],.161,'matte',.151,24);
  rod(chrome,[.905,.729,1.30],[.905,.728,1.416],.261,'metal',.229,28);
  path(black,[[-.46,.498,.70],[-.435,.810,.71],[-.353,1.318,.73],[-.257,1.563,.746],
    [.248,1.563,.746],[.351,1.314,.73],[.429,.811,.71],[.465,.490,.70]],.052,'matte');
  block(carbon,[0,.568,-.635],[.451,.209,.216],.051,'matte',[-.22,0,0]);
  wing(1.348,1.552,2.275,col,col,[.37,.50,-.18]);tails(.489,1.993,.78);
}

const shapes={
  'track-formula':formula,'track-rally':rally,'track-prototype':prototype,
  'track-hot-rod':hotRod,'track-drift':drift,'track-electric':electric,
};
const crown={
  'track-formula':.52,'track-rally':.57,'track-prototype':.44,
  'track-hot-rod':.47,'track-drift':.55,'track-electric':.44,
};
export const concepts=catalog.map(c=>{
  const [w,minZ,maxZ,height]=c.extent;
  return {id:c.id,name:c.name,role:c.role,color:c.color,trim:c.trim,mount:c.driver,
    wheels:c.wheels.flatMap(([z,r,x,width])=>[-1,1].map(side=>{
      const style=c.id==='track-hot-rod'?'whitewall':c.id==='track-rally'?'offroad':'spoke';
      return {x:x*side,z,r,width,steer:z<0,rim:c.id==='track-drift'?'#a2784a':c.id==='track-hot-rod'?'#9e7850':'#bdc6cb',tire:rubber,style};
    })),
    bounds:[w,minZ,maxZ],height,tail:[crown[c.id],c.tail],seat:false,
    build(h){shapes[c.id](trackPainter(h),c,h.T);}
  };
});
